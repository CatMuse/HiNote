import { Component, MarkdownView, Notice, editorInfoField, editorLivePreviewField } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, type Rect } from '@codemirror/view';
import type CommentPlugin from '../../../main';
import { HIGHLIGHT_COLOR_CHOICES, recolorHighlightSource } from '../../services/highlight/HighlightColorEdit';
import type { HighlightColor } from '../../services/highlight/HighlightColor';
import { HighlightExtractor } from '../../services/highlight/HighlightExtractor';
import { highlightColorStyle } from '../../services/highlight/HighlightColor';
import { readPreviewSection, resolvePreviewSelection, resolveSourceSelection, type SelectionRangePlan } from './SelectionRangeResolver';
import { t } from '../../i18n';

interface SelectionContext {
    view?: EditorView;
    markdownView: MarkdownView;
    file: import('obsidian').TFile;
    snapshot: string;
    plan: SelectionRangePlan;
}

class SelectionColorController extends Component {
    private toolbar?: HTMLElement;
    private timer?: number;
    private pointerDownInEditor = false;
    private disposed = false;
    private extractor: HighlightExtractor;

    constructor(private plugin: CommentPlugin) {
        super();
        this.extractor = new HighlightExtractor(plugin.app, () => plugin.settings);
    }

    onload(): void {
        const doc = activeDocument;
        const win = doc.defaultView;
        if (!win) return;
        this.registerDomEvent(doc, 'pointerdown', event => {
            const target = event.target as Node;
            if (this.toolbar?.contains(target)) return;
            const editor = this.getEditorView();
            const preview = this.getMarkdownView()?.previewMode?.containerEl;
            this.pointerDownInEditor = !!editor?.dom.contains(target) || !!preview?.contains(target);
            this.hide();
        });
        this.registerDomEvent(doc, 'pointerup', () => {
            if (this.pointerDownInEditor || this.isPreview()) {
                this.pointerDownInEditor = false;
                this.schedule();
            }
        });
        this.registerDomEvent(doc, 'selectionchange', () => {
            if (this.isPreview()) this.schedule();
        });
        this.registerDomEvent(doc, 'keydown', event => {
            if (event.key === 'Escape') this.hide();
        });
        this.registerDomEvent(doc, 'scroll', () => this.hide(), true);
        this.registerDomEvent(win, 'resize', () => this.hide());
        this.registerDomEvent(win, 'blur', () => this.hide());
        this.registerEvent(this.plugin.app.workspace.on('active-leaf-change', () => this.hide()));
        this.registerEvent(this.plugin.app.workspace.on('file-open', () => this.hide()));
    }

    onEditorUpdate(view: EditorView, update: ViewUpdate): void {
        if (view !== this.getEditorView()) return;
        if (update.selectionSet || update.focusChanged) this.schedule();
        if (update.docChanged) this.hide();
    }

    private getMarkdownView(): MarkdownView | null {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    private getEditorView(): EditorView | null {
        const editor = this.getMarkdownView()?.editor as unknown as { cm?: EditorView } | undefined;
        return editor?.cm || null;
    }

    private isPreviewView(view: EditorView): boolean {
        return view.state.field(editorLivePreviewField, false) === true;
    }

    private isPreview(): boolean {
        const markdownView = this.getMarkdownView();
        const editor = this.getEditorView();
        return markdownView?.getMode() === 'preview' || (!!editor && this.isPreviewView(editor));
    }

    private schedule(): void {
        if (this.disposed) return;
        const win = activeDocument.defaultView;
        if (!win) return;
        if (this.timer !== undefined) win.clearTimeout(this.timer);
        this.timer = win.setTimeout(() => {
            this.timer = undefined;
            void this.show();
        }, 140);
    }

    private async capture(): Promise<{ context: SelectionContext; anchor: Rect } | null> {
        const markdownView = this.getMarkdownView();
        const view = this.getEditorView();
        if (!markdownView) return null;
        const file = view?.state.field(editorInfoField, false)?.file || markdownView.file;
        if (!file || !this.extractor.shouldProcessFile(file)) return null;
        const isReadingPreview = markdownView.getMode() === 'preview';
        const snapshot = view && !isReadingPreview ? view.state.doc.toString() : await this.plugin.app.vault.read(file);
        const scans = this.extractor.extractHighlights(snapshot, file);

        if (isReadingPreview) {
            const selection = activeDocument.getSelection();
            if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
            const range = selection.getRangeAt(0);
            const host = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                ? range.commonAncestorContainer as Element : range.commonAncestorContainer.parentElement;
            const sectionElement = host?.closest<HTMLElement>('[data-hinote-source-path]');
            const section = sectionElement ? readPreviewSection(sectionElement) : null;
            if (!section || section.sourcePath !== file.path) return null;
            const plan = resolvePreviewSelection(snapshot, section, selection.toString(), scans);
            const rect = range.getBoundingClientRect();
            return plan && rect.width + rect.height > 0 ? { context: { view: undefined, markdownView, file, snapshot, plan }, anchor: rect } : null;
        }

        // Source mode and Live Preview share the same CodeMirror source selection.
        if (!view || !view.hasFocus) return null;
        const selection = view.state.selection.main;
        if (selection.empty) return null;
        const plan = resolveSourceSelection(snapshot, selection.from, selection.to, scans);
        const from = view.coordsAtPos(selection.from);
        const to = view.coordsAtPos(selection.to);
        if (!plan || !from || !to) return null;
        return {
            context: { view, markdownView, file, snapshot, plan },
            anchor: { left: Math.min(from.left, to.left), right: Math.max(from.right, to.right), top: Math.min(from.top, to.top), bottom: Math.max(from.bottom, to.bottom) }
        };
    }

    private async show(): Promise<void> {
        this.hide();
        const captured = await this.capture();
        if (!captured) return;
        const doc = activeDocument;
        const win = doc.defaultView;
        if (!win) return;
        const toolbar = this.toolbar = doc.body.createDiv({ cls: 'hinote-selection-color-toolbar', attr: {
            role: 'toolbar', 'aria-label': t('Change highlight color')
        } });
        this.registerToolbarEvents(toolbar, captured.context);
        for (const choice of HIGHLIGHT_COLOR_CHOICES) {
            const button = toolbar.createEl('button', { cls: 'hinote-selection-color-swatch', attr: {
                type: 'button', title: t(choice.label), 'aria-label': t(choice.label)
            } });
            button.style.setProperty('--swatch-color', highlightColorStyle(choice.color || 'yellow'));
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void this.apply(captured.context, choice.color).catch(error => {
                    new Notice(error instanceof Error ? error.message : t('Could not save the selection.'));
                });
            });
        }
        const rect = toolbar.getBoundingClientRect();
        const top = captured.anchor.top >= rect.height + 10
            ? captured.anchor.top - rect.height - 8
            : captured.anchor.bottom + 8;
        toolbar.style.left = `${Math.max(8, Math.min((captured.anchor.left + captured.anchor.right) / 2 - rect.width / 2, win.innerWidth - rect.width - 8))}px`;
        toolbar.style.top = `${Math.max(8, Math.min(top, win.innerHeight - rect.height - 8))}px`;
    }

    private registerToolbarEvents(toolbar: HTMLElement, context: SelectionContext): void {
        toolbar.addEventListener('pointerdown', event => event.preventDefault());
        toolbar.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.hide();
        });
        toolbar.addEventListener('focusout', event => {
            if (!toolbar.contains(event.relatedTarget as Node)) this.hide();
        });
        void context;
    }

    private async apply(context: SelectionContext, color: HighlightColor | null): Promise<void> {
        if (context.view
            ? context.view.state.doc.toString() !== context.snapshot || !context.view.dom.isConnected
            : this.plugin.app.vault.getAbstractFileByPath(context.file.path) !== context.file) {
            new Notice(t('The selection changed. Select the text again.'));
            this.hide();
            return;
        }
        const { plan } = context;
        const original = context.snapshot.slice(plan.from, plan.to);
        const replacement = plan.source
            ? recolorHighlightSource(original, color)
            : recolorHighlightSource(`==${original}==`, color);
        if (context.view) {
            context.view.dispatch({
                changes: { from: plan.from, to: plan.to, insert: replacement },
                selection: { anchor: plan.from + replacement.length },
                userEvent: 'input.hinote-highlight-color'
            });
        } else {
            await this.plugin.app.vault.process(context.file, current => {
                if (current !== context.snapshot) throw new Error(t('The selection changed. Select the text again.'));
                return current.slice(0, plan.from) + replacement + current.slice(plan.to);
            });
            context.markdownView.previewMode.rerender(true);
        }
        this.hide();
        this.plugin.services?.highlightDecorator.refreshDecorations();
    }

    private hide(): void {
        const win = activeDocument.defaultView;
        if (this.timer !== undefined) win?.clearTimeout(this.timer);
        this.timer = undefined;
        this.toolbar?.remove();
        this.toolbar = undefined;
    }

    onunload(): void {
        this.disposed = true;
        this.hide();
    }
}

export function registerSelectionColorToolbar(plugin: CommentPlugin): void {
    const controller = plugin.addChild(new SelectionColorController(plugin));
    const extension = ViewPlugin.fromClass(class {
        update(update: ViewUpdate): void { controller.onEditorUpdate(update.view, update); }
    });
    plugin.registerEditorExtension(extension);
}

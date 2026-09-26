import { Component, MarkdownView, Notice, editorInfoField, editorLivePreviewField, setIcon } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, type Rect } from '@codemirror/view';
import type { EditorFeatureContext } from '../../types/plugin';
import { HIGHLIGHT_COLOR_CHOICES, recolorHighlightSource } from '../../services/highlight/HighlightColorEdit';
import type { HighlightColor } from '../../services/highlight/HighlightColor';
import { HighlightExtractor } from '../../services/highlight/HighlightExtractor';
import { highlightColorStyle } from '../../services/highlight/HighlightColor';
import { readPreviewSection, resolvePreviewSelection, resolveSourceSelection, type SelectionRangePlan } from './SelectionRangeResolver';
import { t } from '../../i18n';
import { CommentService } from '../../services/comment';
import { FloatingCommentInput } from '../../components/comment';
import { scanToHighlightView } from '../../models/HighlightModels';
import type { HighlightInfo } from '../../types/highlight';
import { HighlightCardClipboard } from '../../components/highlight/card/Clipboard';
import { HighlightDeletionManager } from '../../views/highlight/actions/HighlightDeletionManager';

interface SelectionContext {
    view?: EditorView;
    markdownView: MarkdownView;
    file: import('obsidian').TFile;
    snapshot: string;
    plan: SelectionRangePlan;
}

interface PendingAutoHighlight {
    context: SelectionContext;
    originalSnapshot: string;
    originalPlan: SelectionRangePlan;
}

class SelectionColorController extends Component {
    private toolbar?: HTMLElement;
    private timer?: number;
    private pointerDownInEditor = false;
    private disposed = false;
    private extractor: HighlightExtractor;
    private commentInput?: FloatingCommentInput;
    private annotateButton?: HTMLButtonElement;
    private deleteButton?: HTMLButtonElement;
    private colorButtons: Array<{ color: HighlightColor | null; button: HTMLButtonElement }> = [];
    private openingComment = false;
    private commentInputActive = false;
    private pendingAutoHighlight?: PendingAutoHighlight;
    private selectionSuppressedUntil = 0;

    constructor(private plugin: EditorFeatureContext) {
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
            if ((this.pointerDownInEditor || this.isPreview()) && !this.selectionUpdatesSuppressed()) {
                this.pointerDownInEditor = false;
                this.schedule();
            }
        });
        this.registerDomEvent(doc, 'selectionchange', () => {
            if (this.isPreview() && !this.commentInputActive && !this.selectionUpdatesSuppressed()) this.schedule();
        });
        this.registerDomEvent(doc, 'click', event => {
            if (this.toolbar?.contains(event.target as Node) || this.commentInputActive) return;
            void this.showForHighlightClick(event);
        });
        this.registerDomEvent(doc, 'keydown', event => {
            if (event.key === 'Escape' && !this.commentInput?.isProcessing()) void this.cancelComment(true);
        });
        this.registerDomEvent(doc, 'scroll', () => this.hide(), true);
        this.registerDomEvent(win, 'resize', () => this.hide());
        this.registerDomEvent(win, 'blur', () => this.hide());
        this.registerEvent(this.plugin.app.workspace.on('active-leaf-change', () => this.hide()));
        this.registerEvent(this.plugin.app.workspace.on('file-open', () => this.hide()));
    }

    onEditorUpdate(view: EditorView, update: ViewUpdate): void {
        if (view !== this.getEditorView() || this.commentInputActive || this.selectionUpdatesSuppressed()) return;
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

    private selectionUpdatesSuppressed(): boolean {
        return Date.now() < this.selectionSuppressedUntil;
    }

    private schedule(): void {
        if (this.disposed || this.openingComment || this.commentInputActive || this.selectionUpdatesSuppressed()) return;
        const win = activeDocument.defaultView;
        if (!win) return;
        if (this.timer !== undefined) win.clearTimeout(this.timer);
        this.timer = win.setTimeout(() => {
            this.timer = undefined;
            void this.show();
        }, 140);
    }

    private selectionRect(range: Range): Rect | null {
        const rects = Array.from(range.getClientRects());
        const rect = rects.length ? rects.reduce((merged, current) => ({
            left: Math.min(merged.left, current.left), right: Math.max(merged.right, current.right),
            top: Math.min(merged.top, current.top), bottom: Math.max(merged.bottom, current.bottom)
        }), { left: rects[0].left, right: rects[0].right, top: rects[0].top, bottom: rects[0].bottom }) : range.getBoundingClientRect();
        return rect.right > rect.left && rect.bottom > rect.top ? rect : null;
    }

    private editorRangeRect(view: EditorView, from: number, to: number): Rect | null {
        try {
            const start = view.domAtPos(from);
            const end = view.domAtPos(to);
            const range = view.dom.ownerDocument.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            const rect = this.selectionRect(range);
            if (rect) return rect;
        } catch {
            // Virtualized or replaced content may not have a complete DOM range.
        }
        const start = view.coordsAtPos(from), end = view.coordsAtPos(to);
        return start && end ? {
            left: Math.min(start.left, end.left), right: Math.max(start.right, end.right),
            top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom)
        } : null;
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
            const rect = this.selectionRect(range);
            return plan && rect ? { context: { view: undefined, markdownView, file, snapshot, plan }, anchor: rect } : null;
        }

        // Source mode and Live Preview share the same CodeMirror source selection.
        if (!view || !view.hasFocus) return null;
        const selection = view.state.selection.main;
        if (selection.empty) return null;
        const plan = resolveSourceSelection(snapshot, selection.from, selection.to, scans);
        const anchor = this.editorRangeRect(view, selection.from, selection.to);
        if (!plan || !anchor) return null;
        return { context: { view, markdownView, file, snapshot, plan }, anchor };
    }

    private async show(): Promise<void> {
        if (this.openingComment || this.commentInputActive || this.disposed) return;
        this.hide();
        const captured = await this.capture();
        if (captured) this.render(captured);
    }

    private async showForHighlightClick(event: MouseEvent): Promise<void> {
        const captured = this.isPreview() && this.getMarkdownView()?.getMode() === 'preview'
            ? await this.captureReadingHighlightClick(event)
            : this.captureEditorHighlightClick(event);
        // Ordinary clicks must remain available for double-click and triple-click
        // selection. Suppress later selection updates only after a real highlight hit.
        if (!captured) return;
        this.selectionSuppressedUntil = Date.now() + 500;
        this.hide();
        this.render(captured);
    }

    private captureEditorHighlightClick(event: MouseEvent): { context: SelectionContext; anchor: Rect } | null {
        const markdownView = this.getMarkdownView();
        const view = this.getEditorView();
        const file = view?.state.field(editorInfoField, false)?.file || markdownView?.file;
        if (!markdownView || !view || !file || !this.extractor.shouldProcessFile(file) || !view.dom.isConnected) return null;
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null || position === undefined) return null;
        const snapshot = view.state.doc.toString();
        const scan = this.extractor.extractHighlights(snapshot, file).find(item =>
            item.syntax === 'markdown' && item.position <= position && position <= item.position + item.originalLength
        );
        if (!scan) return null;
        const anchor = this.editorRangeRect(view, scan.position, scan.position + scan.originalLength);
        if (!anchor) return null;
        return {
            context: { view, markdownView, file, snapshot, plan: { from: scan.position, to: scan.position + scan.originalLength, source: scan } },
            anchor
        };
    }

    private async captureReadingHighlightClick(event: MouseEvent): Promise<{ context: SelectionContext; anchor: Rect } | null> {
        const markdownView = this.getMarkdownView();
        const file = markdownView?.file;
        const target = event.target as HTMLElement | null;
        const mark = target?.closest<HTMLElement>('mark, span.highlight');
        if (!markdownView || !file || !mark || !this.extractor.shouldProcessFile(file)) return null;
        if (mark.dataset.hinoteSourcePath !== file.path) return null;
        const snapshot = await this.plugin.app.vault.read(file);
        const scans = this.extractor.extractHighlights(snapshot, file);
        const sourceFrom = Number(mark.dataset.hinoteSourceFrom);
        const sourceTo = Number(mark.dataset.hinoteSourceTo);
        const exactScan = Number.isInteger(sourceFrom) && Number.isInteger(sourceTo) && sourceTo > sourceFrom
            ? scans.find(scan => scan.position === sourceFrom && scan.position + scan.originalLength === sourceTo)
            : undefined;
        const plan: SelectionRangePlan | null = exactScan
            ? { from: sourceFrom, to: sourceTo, source: exactScan }
            : null;
        if (!plan) return null;
        const rect = mark.getBoundingClientRect();
        return { context: { view: undefined, markdownView, file, snapshot, plan }, anchor: rect };
    }

    private render(captured: { context: SelectionContext; anchor: Rect }): void {
        this.hide();
        const doc = activeDocument;
        const win = doc.defaultView;
        if (!win) return;
        const popover = this.toolbar = doc.body.createDiv({ cls: 'hinote-selection-color-popover' });
        const colorBar = popover.createDiv({
            cls: 'hinote-selection-color-toolbar',
            attr: { role: 'toolbar' }
        });
        this.colorButtons = [];
        this.registerToolbarEvents(popover, captured.context);
        for (const choice of HIGHLIGHT_COLOR_CHOICES) {
            const label = t(choice.color === null ? 'Default' : choice.label);
            const button = colorBar.createEl('button', { cls: 'hinote-selection-color-swatch', attr: {
                type: 'button', 'aria-label': label
            } });
            button.style.setProperty('--swatch-color', highlightColorStyle(choice.color || 'yellow'));
            this.colorButtons.push({ color: choice.color, button });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void this.apply(captured.context, choice.color).catch(error => {
                    new Notice(error instanceof Error ? error.message : t('Could not save the selection.'));
                });
            });
        }
        this.updateColorSelection(captured.context);
        const annotate = this.annotateButton = colorBar.createEl('button', {
            cls: 'hinote-selection-annotate-button clickable-icon',
            attr: {
                type: 'button',
                'aria-label': t('Comment'),
                'aria-expanded': 'false'
            }
        });
        setIcon(annotate, 'message-square-plus');
        annotate.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (this.commentInputActive) {
                if (this.commentInput?.isProcessing()) return;
                void this.cancelComment(true);
                return;
            }
            void this.openComment(captured.context).catch(error => {
                new Notice(error instanceof Error ? error.message : t('Could not save the selection.'));
            });
        });
        const copy = colorBar.createEl('button', {
            cls: 'hinote-selection-action-button clickable-icon',
            attr: { type: 'button', 'aria-label': t('Copy') }
        });
        setIcon(copy, 'copy');
        copy.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void this.copyHighlight(captured.context).catch(error => {
                console.error('[HiNote] Could not copy the selected highlight:', error);
                new Notice(t('Failed to copy content'));
            });
        });
        const remove = this.deleteButton = colorBar.createEl('button', {
            cls: 'hinote-selection-action-button hinote-selection-delete-button clickable-icon',
            attr: { type: 'button', 'aria-label': t('Delete') }
        });
        setIcon(remove, 'trash-2');
        this.updateDeleteButton(!!captured.context.plan.source);
        remove.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void this.deleteHighlight(captured.context);
        });
        const rect = popover.getBoundingClientRect();
        const top = captured.anchor.top >= rect.height + 10
            ? captured.anchor.top - rect.height - 8
            : captured.anchor.bottom + 8;
        popover.style.left = `${Math.max(8, Math.min((captured.anchor.left + captured.anchor.right) / 2 - rect.width / 2, win.innerWidth - rect.width - 8))}px`;
        popover.style.top = `${Math.max(8, Math.min(top, win.innerHeight - rect.height - 8))}px`;
    }

    private async openComment(context: SelectionContext): Promise<void> {
        const popover = this.toolbar;
        if (!popover?.isConnected || this.openingComment) return;
        this.openingComment = true;
        try {
        const services = await this.plugin.ensureServicesInitialized();
        let prepared = context;
        if (!prepared.plan.source) {
            const originalSnapshot = prepared.snapshot;
            const originalPlan = { ...prepared.plan };
            await this.writeSelectionChange(prepared, null);
            const snapshot = prepared.view ? prepared.view.state.doc.toString() : await this.plugin.app.vault.read(prepared.file);
            const scans = this.extractor.extractHighlights(snapshot, prepared.file);
            const scan = scans.find(item => item.position === prepared.plan.from);
            if (!scan) throw new Error(t('This selection cannot be highlighted safely.'));
            prepared = { ...prepared, snapshot, plan: {
                from: scan.position, to: scan.position + scan.originalLength, source: scan
            } };
            // Keep the toolbar's captured context current so closing and reopening
            // the comment panel does not try to highlight the same selection twice.
            context.snapshot = prepared.snapshot;
            context.plan = prepared.plan;
            this.pendingAutoHighlight = { context, originalSnapshot, originalPlan };
            this.updateColorSelection(context);
            this.updateDeleteButton(true);
        }
        const snapshot = prepared.view ? prepared.view.state.doc.toString() : await this.plugin.app.vault.read(prepared.file);
        const scans = this.extractor.extractHighlights(snapshot, prepared.file);
        const scan = scans.find(item => item.position === prepared.plan.from);
        if (!scan) throw new Error(t('This selection cannot be highlighted safely.'));
        const merged = services.highlightService.mergeHighlightsWithComments(
            scans, services.highlightRepository.getCachedHighlights(prepared.file.path) || [], prepared.file
        );
        const highlight = merged.find(item => item.position === scan.position) || scanToHighlightView(scan);
        const commentService = new CommentService(this.plugin.app, {
            eventManager: services.eventManager,
            fsrsManager: services.fsrsManager
        }, services.highlightManager);
        commentService.updateState({ currentFile: prepared.file, highlights: [highlight] });
        if (!popover.isConnected) return;
        this.commentInput?.destroy();
        this.commentInputActive = true;
        this.commentInput = new FloatingCommentInput(popover, highlight, this.plugin, {
            onSave: async content => {
                await commentService.addComment(highlight, content);
                this.pendingAutoHighlight = undefined;
                this.commentInputActive = false;
                this.hide();
            },
            onCancel: () => {
                void this.cancelComment(true);
            }
        });
        // Freeze the color row's geometry; only the comment panel expands below it.
        const bounds = popover.getBoundingClientRect();
        const win = popover.ownerDocument.defaultView!;
        popover.style.width = `${bounds.width}px`;
        popover.style.setProperty('--comment-width', `${Math.min(320, win.innerWidth - bounds.left - 8)}px`);
        popover.style.setProperty('--comment-max-height', `${Math.max(48, win.innerHeight - bounds.bottom - 14)}px`);
        this.commentInput.show();
        this.updateAnnotateButton(true);
        } finally {
            this.openingComment = false;
        }
    }

    private async getExistingHighlight(context: SelectionContext): Promise<HighlightInfo | null> {
        if (!context.plan.source) return null;
        const services = await this.plugin.ensureServicesInitialized();
        const snapshot = context.view ? context.view.state.doc.toString() : await this.plugin.app.vault.read(context.file);
        const scans = this.extractor.extractHighlights(snapshot, context.file);
        const scan = scans.find(item => item.position === context.plan.from);
        if (!scan) return null;
        const merged = services.highlightService.mergeHighlightsWithComments(
            scans, services.highlightRepository.getCachedHighlights(context.file.path) || [], context.file
        );
        return merged.find(item => item.position === scan.position) || scanToHighlightView(scan);
    }

    private async copyHighlight(context: SelectionContext): Promise<void> {
        const existing = await this.getExistingHighlight(context);
        const highlight: HighlightInfo = existing || {
            text: context.snapshot.slice(context.plan.from, context.plan.to),
            position: context.plan.from,
            filePath: context.file.path,
            fileName: context.file.basename,
            comments: []
        };
        HighlightCardClipboard.copyHighlightContent(highlight, context.file.basename);
    }

    private async deleteHighlight(context: SelectionContext): Promise<void> {
        try {
            const highlight = await this.getExistingHighlight(context);
            if (!highlight) {
                new Notice(t('Select an existing highlight to delete.'));
                return;
            }
            const services = await this.plugin.ensureServicesInitialized();
            const deleted = await new HighlightDeletionManager({
                app: this.plugin.app,
                settings: this.plugin.settings,
                highlightManager: services.highlightManager,
                eventManager: services.eventManager
            }).deleteHighlight(highlight);
            if (!deleted) return;
            this.pendingAutoHighlight = undefined;
            this.closeComment(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(t('Failed to delete highlight: {error}', { error: message }));
        }
    }

    private updateAnnotateButton(open: boolean): void {
        const button = this.annotateButton;
        if (!button) return;
        const label = t(open ? 'Close' : 'Comment');
        button.classList.toggle('is-active', open);
        button.setAttribute('aria-expanded', String(open));
        button.setAttribute('aria-label', label);
        setIcon(button, open ? 'x' : 'message-square-plus');
    }

    private updateDeleteButton(enabled: boolean): void {
        if (!this.deleteButton) return;
        this.deleteButton.disabled = !enabled;
        if (enabled) this.deleteButton.removeAttribute('aria-disabled');
        else this.deleteButton.setAttribute('aria-disabled', 'true');
    }

    private updateColorSelection(context: SelectionContext): void {
        const source = context.plan.source;
        const current = source?.backgroundColor;
        const defaultColors = new Set([
            undefined,
            '#ffeb3b',
            'var(--text-highlight-bg, #ffeb3b)',
            highlightColorStyle('yellow')
        ]);
        for (const { color, button } of this.colorButtons) {
            const selected = !!source && (color
                ? current === highlightColorStyle(color)
                : defaultColors.has(current));
            button.setAttribute('aria-pressed', String(selected));
        }
    }

    private closeComment(hideToolbar: boolean): void {
        this.commentInput?.destroy();
        this.commentInputActive = false;
        this.commentInput = undefined;
        this.updateAnnotateButton(false);
        if (hideToolbar) this.hide();
    }

    private async cancelComment(hideToolbar: boolean): Promise<void> {
        const pending = this.pendingAutoHighlight;
        const shouldRollback = !!pending && !this.commentInput?.hasContent();
        this.pendingAutoHighlight = undefined;
        this.closeComment(false);
        if (shouldRollback && pending) await this.rollbackAutoHighlight(pending);
        if (hideToolbar) this.hide();
    }

    private async rollbackAutoHighlight(pending: PendingAutoHighlight): Promise<void> {
        const { context, originalSnapshot, originalPlan } = pending;
        const currentPlan = context.plan;
        const originalText = originalSnapshot.slice(originalPlan.from, originalPlan.to);
        if (context.view) {
            if (!context.view.dom.isConnected || context.view.state.doc.toString() !== context.snapshot) return;
            this.selectionSuppressedUntil = Date.now() + 500;
            context.view.dispatch({
                changes: { from: currentPlan.from, to: currentPlan.to, insert: originalText },
                selection: { anchor: originalPlan.from + originalText.length },
                userEvent: 'input.hinote-cancel-comment-highlight'
            });
        } else {
            let restored = false;
            await this.plugin.app.vault.process(context.file, current => {
                if (current !== context.snapshot) return current;
                restored = true;
                return current.slice(0, currentPlan.from) + originalText + current.slice(currentPlan.to);
            });
            if (!restored) return;
        }
        context.snapshot = originalSnapshot;
        context.plan = originalPlan;
        this.plugin.services?.highlightDecorator.invalidate(context.file.path);
    }

    private registerToolbarEvents(toolbar: HTMLElement, context: SelectionContext): void {
        toolbar.addEventListener('pointerdown', event => {
            if (!(event.target as Element).closest('textarea, input')) event.preventDefault();
        });
        toolbar.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !this.commentInput?.isProcessing()) void this.cancelComment(true);
        });
        toolbar.addEventListener('focusout', event => {
            if (!toolbar.contains(event.relatedTarget as Node)) this.hide();
        });
        void context;
    }

    private async apply(context: SelectionContext, color: HighlightColor | null): Promise<void> {
        await this.writeSelectionChange(context, color);
        this.hide();
    }

    private async writeSelectionChange(context: SelectionContext, color: HighlightColor | null): Promise<void> {
        if (context.view
            ? context.view.state.doc.toString() !== context.snapshot || !context.view.dom.isConnected
            : this.plugin.app.vault.getAbstractFileByPath(context.file.path) !== context.file) {
            throw new Error(t('The selection changed. Select the text again.'));
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
        }
        this.plugin.services?.highlightDecorator.invalidate(context.file.path);
    }

    private hide(force = false): void {
        if (this.openingComment || (this.commentInputActive && !force)) return;
        const win = activeDocument.defaultView;
        if (this.timer !== undefined) win?.clearTimeout(this.timer);
        this.timer = undefined;
        this.closeComment(false);
        this.toolbar?.remove();
        this.toolbar = undefined;
        this.annotateButton = undefined;
        this.deleteButton = undefined;
        this.colorButtons = [];
    }

    onunload(): void {
        this.disposed = true;
        if (this.commentInputActive && !this.commentInput?.isProcessing()) {
            void this.cancelComment(true);
        } else {
            this.commentInputActive = false;
            this.hide(true);
        }
    }
}

export function registerSelectionColorToolbar(plugin: EditorFeatureContext): void {
    const controller = plugin.addChild(new SelectionColorController(plugin));
    const extension = ViewPlugin.fromClass(class {
        update(update: ViewUpdate): void { controller.onEditorUpdate(update.view, update); }
    });
    plugin.registerEditorExtension(extension);
}

import { Component, Notice, setIcon } from 'obsidian';
import { EditorView, ViewPlugin, ViewUpdate, type Rect } from '@codemirror/view';
import type { EditorFeatureContext } from '../../types/plugin';
import { HIGHLIGHT_COLOR_CHOICES } from '../../services/highlight/HighlightColorEdit';
import type { HighlightColor } from '../../services/highlight/HighlightColor';
import { HighlightExtractor } from '../../services/highlight/HighlightExtractor';
import { highlightColorStyle } from '../../services/highlight/HighlightColor';
import type { SelectionRangePlan } from './SelectionRangeResolver';
import { SelectionCapture, type SelectionContext } from './SelectionCapture';
import { SelectionHighlightActions } from './SelectionHighlightActions';
import { t } from '../../i18n';
import { CommentService } from '../../services/comment';
import { FloatingCommentInput } from '../../components/comment';

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
    private selectionCapture: SelectionCapture;
    private actions: SelectionHighlightActions;
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
        this.selectionCapture = new SelectionCapture(plugin, this.extractor);
        this.actions = new SelectionHighlightActions(plugin, this.extractor);
    }

    onload(): void {
        const doc = activeDocument;
        const win = doc.defaultView;
        if (!win) return;
        this.registerDomEvent(doc, 'pointerdown', event => {
            const target = event.target as Node;
            if (this.toolbar?.contains(target)) return;
            const editor = this.selectionCapture.getEditorView();
            const preview = this.selectionCapture.getMarkdownView()?.previewMode?.containerEl;
            this.pointerDownInEditor = !!editor?.dom.contains(target) || !!preview?.contains(target);
            this.hide();
        });
        this.registerDomEvent(doc, 'pointerup', () => {
            if ((this.pointerDownInEditor || this.selectionCapture.isPreview()) && !this.selectionUpdatesSuppressed()) {
                this.pointerDownInEditor = false;
                this.schedule();
            }
        });
        this.registerDomEvent(doc, 'selectionchange', () => {
            if (this.selectionCapture.isPreview() && !this.commentInputActive && !this.selectionUpdatesSuppressed()) this.schedule();
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
        if (view !== this.selectionCapture.getEditorView() || this.commentInputActive || this.selectionUpdatesSuppressed()) return;
        if (update.selectionSet || update.focusChanged) this.schedule();
        if (update.docChanged) this.hide();
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

    private async show(): Promise<void> {
        if (this.openingComment || this.commentInputActive || this.disposed) return;
        this.hide();
        const captured = await this.selectionCapture.captureSelection();
        if (captured) this.render(captured);
    }

    private async showForHighlightClick(event: MouseEvent): Promise<void> {
        const captured = await this.selectionCapture.captureHighlightClick(event);
        // Ordinary clicks must remain available for double-click and triple-click
        // selection. Suppress later selection updates only after a real highlight hit.
        if (!captured) return;
        this.selectionSuppressedUntil = Date.now() + 500;
        this.hide();
        this.render(captured);
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
            void this.actions.copyHighlight(captured.context).catch(error => {
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
        // Initialize persistence before adding an automatic highlight so a
        // service startup failure cannot leave an unannotated source change.
        const services = await this.plugin.ensureServicesInitialized();
        const result = await this.actions.ensureHighlighted(context);
        const prepared = result.context;
        if (result.rollback) {
            // Keep the toolbar's captured context current so closing and reopening
            // the comment panel does not try to highlight the same selection twice.
            context.snapshot = prepared.snapshot;
            context.plan = prepared.plan;
            this.pendingAutoHighlight = { context, ...result.rollback };
            this.updateColorSelection(context);
            this.updateDeleteButton(true);
        }
        const highlight = await this.actions.getExistingHighlight(prepared);
        if (!highlight) throw new Error(t('This selection cannot be highlighted safely.'));
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

    private async deleteHighlight(context: SelectionContext): Promise<void> {
        try {
            const result = await this.actions.deleteHighlight(context);
            if (result === 'missing') {
                new Notice(t('Select an existing highlight to delete.'));
                return;
            }
            if (result === 'cancelled') return;
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
        await this.actions.writeSelectionChange(context, color);
        this.hide();
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

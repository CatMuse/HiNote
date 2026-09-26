import type { HighlightInfo } from '../../types/highlight';
import type { PluginSettingsContext } from '../../types/plugin';
import { InlineAICommentHandler } from './InlineAICommentHandler';
import { CommentInputActionBar } from './CommentInputActionBar';
import { CommentInputSaveController } from './CommentInputSaveController';
import { autoResizeCommentTextarea, setupCommentInputKeyboard } from './CommentInputKeyboard';
import { t } from '../../i18n';

interface FloatingCommentInputOptions {
    onSave: (content: string) => Promise<void>;
    onCancel: () => void;
}

/** Reuses the normal comment editor behavior without requiring a sidebar card DOM. */
export class FloatingCommentInput {
    private inputEl?: HTMLElement;
    private textarea?: HTMLTextAreaElement;
    private actionHint?: HTMLElement;
    private outsideClick?: (event: MouseEvent) => void;
    private saveController?: CommentInputSaveController;
    private inlineAI?: InlineAICommentHandler;
    private openState = false;

    constructor(
        private container: HTMLElement,
        private highlight: HighlightInfo,
        private plugin: PluginSettingsContext,
        private options: FloatingCommentInputOptions
    ) {}

    show(): void {
        this.inputEl = this.container.createDiv({ cls: 'hinote-selection-comment-input' });
        this.textarea = this.inputEl.createEl('textarea', {
            cls: 'hi-note-input',
            attr: { rows: '3', placeholder: t('Add comment...') }
        });
        this.inlineAI = new InlineAICommentHandler({
            plugin: this.plugin,
            highlight: this.highlight,
            existingComment: undefined,
            getTextarea: () => this.textarea!,
            getActionHint: () => this.actionHint!,
            resizeTextarea: () => this.resize()
        });
        this.saveController = new CommentInputSaveController({
            getTextarea: () => this.textarea!,
            onSave: this.options.onSave,
            onSaved: () => this.destroy()
        });
        this.actionHint = new CommentInputActionBar(this.inputEl, {
            onSave: async () => await this.save(),
            saveHintText: 'Tab AI, Shift + Enter Wrap, Enter Save'
        }).render();
        setupCommentInputKeyboard(this.textarea, {
            onInlineAI: async () => {
                await this.inlineAI!.generate();
                this.textarea?.focus();
            },
            onSave: async () => await this.save()
        });
        this.textarea.addEventListener('input', () => this.resize());
        this.outsideClick = event => {
            const target = event.target as Node;
            if (this.inputEl?.contains(target) || this.isProcessing()) return;
            if (this.textarea?.value.trim()) void this.save();
            else this.cancel();
        };
        activeDocument.addEventListener('click', this.outsideClick);
        this.openState = true;
        window.setTimeout(() => this.textarea?.focus(), 0);
    }

    isProcessing(): boolean {
        return this.inlineAI?.isGenerating() === true || this.saveController?.isProcessing() === true;
    }

    hasContent(): boolean {
        return !!this.textarea?.value.trim();
    }

    private resize(): void {
        if (this.textarea) autoResizeCommentTextarea(this.textarea);
    }

    private async save(): Promise<void> {
        if (!this.saveController || !this.openState) return;
        const saved = await this.saveController.saveCurrentContent();
        if (!saved && !this.textarea?.value.trim()) this.cancel();
    }

    private cancel(): void {
        if (!this.openState) return;
        this.options.onCancel();
        this.destroy();
    }

    destroy(): void {
        this.openState = false;
        if (this.outsideClick) activeDocument.removeEventListener('click', this.outsideClick);
        this.inputEl?.remove();
        this.inputEl = undefined;
        this.textarea = undefined;
        this.actionHint = undefined;
        this.saveController?.reset();
        this.saveController = undefined;
    }
}

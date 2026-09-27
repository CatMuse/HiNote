import { Modal, Notice, TFile } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { CommentInput } from '../../../components/comment';
import { CommentList } from '../../../components/highlight';
import { t } from '../../../i18n';
import type { FlashcardState } from '../../../flashcard';
import { isSystemCardGroup } from '../../../flashcard/types/FlashcardGroups';
import type { CommentItem, HighlightRecord } from '../../../types/highlight';
import { IdGenerator } from '../../../utils/IdGenerator';
import { showConfirmModal } from '../../../utils/ConfirmModal';

export class HiCardEditorModal extends Modal {
    private closed = false;
    private linkedRecord: HighlightRecord | null = null;
    private annotationHost: HTMLElement | null = null;
    private annotationInput: CommentInput | null = null;
    private readonly preventOutsideDismiss = (event: Event): void => {
        const target = event.target;
        if (target instanceof Node && !this.modalEl.contains(target)) {
            event.preventDefault();
            event.stopPropagation();
        }
    };

    constructor(
        private plugin: CommentPlugin,
        private card: FlashcardState,
        private saved: () => void
    ) { super(plugin.app); }

    onOpen(): void {
        this.closed = false;
        this.modalEl.addClass('hicard-editor-modal');
        this.containerEl.addEventListener('mousedown', this.preventOutsideDismiss, true);
        this.containerEl.addEventListener('click', this.preventOutsideDismiss, true);
        this.titleEl.setText(t('Edit card'));
        void this.renderEditor();
    }

    onClose(): void {
        this.closed = true;
        this.containerEl.removeEventListener('mousedown', this.preventOutsideDismiss, true);
        this.containerEl.removeEventListener('click', this.preventOutsideDismiss, true);
        this.annotationInput?.suspend();
        this.annotationInput = null;
    }

    private async renderEditor(): Promise<void> {
        this.contentEl.empty();
        const form = this.contentEl.createDiv({ cls: 'hicard-card-editor' });
        this.renderLearningDetails(form, this.card);

        let linkedRecord: HighlightRecord | null = null;
        try {
            linkedRecord = await this.loadLinkedRecord();
        } catch (error) {
            console.error('[HiNote] Could not load the HiCard source annotations:', error);
        }
        if (this.closed) return;

        if (this.isLinkedCard()) this.renderLinkedContent(form, linkedRecord);
        else this.renderLegacyContent(form);
    }

    private renderLinkedContent(form: HTMLElement, record: HighlightRecord | null): void {
        const question = this.textarea(form, t('Highlight text'), record?.text ?? this.card.text, '');
        question.readOnly = true;

        const section = form.createDiv({ cls: 'hicard-card-editor-groups' });
        section.createDiv({ cls: 'hicard-form-label', text: t('Annotations') });

        if (record) {
            this.linkedRecord = record;
            this.annotationHost = section.createDiv({ cls: 'hicard-annotation-card-list' });
            this.renderAnnotationComments();
            section.createDiv({
                cls: 'setting-item-description',
                text: t('Changes are synced to the source highlight.')
            });
            const add = section.createEl('button', { text: t('Add another annotation'), attr: { type: 'button' } });
            add.addEventListener('click', () => this.openAnnotationInput());
        } else {
            section.createDiv({
                cls: 'setting-item-description',
                text: t('The source highlight is unavailable. Its annotations cannot be edited.')
            });
        }

        const checks = this.renderGroups(form);
        this.renderActions(async () => {
            this.saveGroups(checks);
            this.finish(t('Card updated'));
        }, t('Done'));
    }

    /** Existing source-less cards remain editable, but no new source-less cards can be created. */
    private renderLegacyContent(form: HTMLElement): void {
        const question = this.textarea(form, t('Question'), this.card.text, t('What do you want to remember?'));
        const answer = this.textarea(form, t('Answer'), this.card.answer, t('Write a concise answer.'));
        const checks = this.renderGroups(form);
        this.renderActions(async () => {
            const text = question.value.trim();
            const response = answer.value.trim();
            if (!text || !response) throw new Error(t('Question and answer are required.'));
            this.plugin.fsrsManager.updateCard(this.card.id, { text, answer: response });
            this.saveGroups(checks);
            this.finish(t('Card updated'));
        });
    }

    private renderAnnotationComments(): void {
        if (!this.annotationHost || !this.linkedRecord) return;
        this.annotationHost.empty();
        if (this.linkedRecord.comments.length === 0) {
            this.annotationHost.createDiv({ cls: 'hicard-annotation-empty', text: t('No annotations') });
            return;
        }
        new CommentList(
            this.annotationHost,
            this.linkedRecord,
            comment => this.openAnnotationInput(comment),
            this.plugin.app
        );
    }

    private openAnnotationInput(existingComment?: CommentItem): void {
        if (!this.annotationHost || !this.linkedRecord) return;
        this.annotationInput?.suspend();
        this.annotationHost.querySelector('.hicard-annotation-empty')?.remove();

        const input = new CommentInput(this.annotationHost, this.linkedRecord, existingComment, this.plugin, {
            onSave: async content => {
                await this.updateAnnotation(existingComment, content);
            },
            onDelete: existingComment ? async () => {
                await this.deleteAnnotation(existingComment.id);
            } : undefined,
            onCancel: () => this.renderAnnotationComments(),
            onClosed: () => {
                if (this.annotationInput === input) this.annotationInput = null;
            }
        });
        this.annotationInput = input;
        input.show();
    }

    private async loadLinkedRecord(): Promise<HighlightRecord | null> {
        if (!this.isLinkedCard() || !this.card.filePath || !this.card.sourceId) return null;
        const records = await this.plugin.highlightRepository.getFileHighlights(this.card.filePath);
        return records.find(record => record.id === this.card.sourceId) ?? null;
    }

    private isLinkedCard(): boolean {
        return this.card.sourceType === 'highlight' && Boolean(this.card.sourceId);
    }

    private async updateAnnotation(existingComment: CommentItem | undefined, content: string): Promise<void> {
        const record = this.linkedRecord;
        if (!record) return;
        const file = this.plugin.app.vault.getAbstractFileByPath(record.filePath);
        if (!(file instanceof TFile)) throw new Error(t('No corresponding file found.'));

        const now = Date.now();
        this.linkedRecord = await this.plugin.highlightManager.updateHighlightComments(file, record.id, latestComments => {
            if (!existingComment) {
                return [...latestComments, {
                    id: IdGenerator.generateCommentId(),
                    content,
                    createdAt: now,
                    updatedAt: now
                }];
            }
            return latestComments.map(comment => comment.id === existingComment.id
                ? { ...comment, content, updatedAt: content === comment.content ? comment.updatedAt : now }
                : comment);
        });
        this.renderAnnotationComments();
    }

    private async deleteAnnotation(commentId: string): Promise<void> {
        const record = this.linkedRecord;
        if (!record) return;
        const file = this.plugin.app.vault.getAbstractFileByPath(record.filePath);
        if (!(file instanceof TFile)) throw new Error(t('No corresponding file found.'));
        this.linkedRecord = await this.plugin.highlightManager.updateHighlightComments(
            file,
            record.id,
            latestComments => latestComments.filter(comment => comment.id !== commentId)
        );
        this.renderAnnotationComments();
    }

    private renderGroups(container: HTMLElement): Map<string, HTMLInputElement> {
        const groups = container.createDiv({ cls: 'hicard-card-editor-groups' });
        groups.createDiv({ cls: 'hicard-form-label', text: t('Study groups') });
        const checks = new Map<string, HTMLInputElement>();
        for (const group of this.plugin.fsrsManager.getCardGroups().filter(group => !isSystemCardGroup(group.id))) {
            const label = groups.createEl('label', { cls: 'hicard-check-row' });
            const check = label.createEl('input', { attr: { type: 'checkbox' } });
            check.checked = Boolean(this.card.groupIds?.includes(group.id));
            checks.set(group.id, check);
            label.createSpan({ text: group.name });
        }
        if (!checks.size) groups.createDiv({ cls: 'setting-item-description', text: t('Create a manual group to organize cards here.') });
        return checks;
    }

    private renderActions(saveAction: () => Promise<void>, primaryLabel = t('Save changes')): void {
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        if (this.card.lastReview) {
            const reset = actions.createEl('button', { cls: 'hicard-reset-progress', text: t('Reset progress') });
            reset.addEventListener('click', () => { void this.resetProgress(); });
        }
        actions.createEl('button', { text: t('Cancel') }).addEventListener('click', () => this.close());
        const save = actions.createEl('button', { cls: 'mod-cta', text: primaryLabel });
        save.addEventListener('click', () => {
            save.disabled = true;
            void saveAction().catch(error => {
                save.disabled = false;
                const message = error instanceof Error ? error.message : String(error);
                new Notice(message);
            });
        });
    }

    private saveGroups(checks: Map<string, HTMLInputElement>): void {
        for (const [groupId, check] of checks) {
            if (check.checked) this.plugin.fsrsManager.addCardToGroup(this.card.id, groupId);
            else this.plugin.fsrsManager.removeCardFromGroup(this.card.id, groupId);
        }
    }

    private finish(message: string): void {
        this.close();
        this.saved();
        new Notice(message);
    }

    private textarea(container: HTMLElement, label: string, value: string, placeholder: string): HTMLTextAreaElement {
        const field = container.createEl('label', { cls: 'hicard-form-field' });
        field.createSpan({ text: label });
        const input = field.createEl('textarea', { attr: { placeholder, rows: '4' } });
        input.value = value;
        return input;
    }

    private renderLearningDetails(container: HTMLElement, card: FlashcardState): void {
        const details = container.createDiv({ cls: 'hicard-editor-learning' });
        const items: Array<[string, string]> = [
            [t('Reviews'), String(card.reviews)],
            [t('Lapses'), String(card.lapses)],
            [t('Next review'), card.suspended ? t('Paused cards') : card.lastReview ? new Date(card.nextReview).toLocaleString() : t('Not studied yet')]
        ];
        for (const [label, value] of items) {
            const item = details.createDiv();
            item.createSpan({ text: label });
            item.createEl('strong', { text: value });
        }
    }

    private async resetProgress(): Promise<void> {
        const confirmed = await showConfirmModal(this.plugin.app, {
            title: t('Reset card progress'),
            message: t('Make this card new again? Its review history will be cleared.')
        });
        if (!confirmed) return;
        this.plugin.fsrsManager.resetCardProgress(this.card.id);
        this.finish(t('Card progress reset'));
    }
}

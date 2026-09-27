import { Modal, Notice } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import type { FlashcardState } from '../../../flashcard';
import { isSystemCardGroup } from '../../../flashcard/types/FlashcardGroups';
import { showConfirmModal } from '../../../utils/ConfirmModal';

export class HiCardEditorModal extends Modal {
    constructor(
        private plugin: CommentPlugin,
        private card: FlashcardState | undefined,
        private saved: () => void
    ) { super(plugin.app); }

    onOpen(): void {
        this.modalEl.addClass('hicard-editor-modal');
        this.titleEl.setText(t(this.card ? 'Edit card' : 'Create card'));
        const form = this.contentEl.createDiv({ cls: 'hicard-card-editor' });
        if (this.card) this.renderLearningDetails(form, this.card);
        const question = this.textarea(form, t('Question'), this.card?.text ?? '', t('What do you want to remember?'));
        const answer = this.textarea(form, t('Answer'), this.card?.answer ?? '', t('Write a concise answer.'));
        const source = this.input(form, t('Source note (optional)'), this.card?.filePath ?? '', t('Path inside this vault'));
        const groups = form.createDiv({ cls: 'hicard-card-editor-groups' });
        groups.createDiv({ cls: 'hicard-form-label', text: t('Study groups') });
        const checks = new Map<string, HTMLInputElement>();
        for (const group of this.plugin.fsrsManager.getCardGroups().filter(group => !isSystemCardGroup(group.id))) {
            const label = groups.createEl('label', { cls: 'hicard-check-row' });
            const check = label.createEl('input', { attr: { type: 'checkbox' } });
            check.checked = Boolean(this.card?.groupIds?.includes(group.id));
            checks.set(group.id, check);
            label.createSpan({ text: group.name });
        }
        if (!checks.size) groups.createDiv({ cls: 'setting-item-description', text: t('Create a manual group to organize cards here.') });
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        if (this.card?.lastReview) {
            const reset = actions.createEl('button', { cls: 'hicard-reset-progress', text: t('Reset progress') });
            reset.addEventListener('click', () => { void this.resetProgress(); });
        }
        actions.createEl('button', { text: t('Cancel') }).addEventListener('click', () => this.close());
        const save = actions.createEl('button', { cls: 'mod-cta', text: t(this.card ? 'Save changes' : 'Create card') });
        save.addEventListener('click', () => {
            const text = question.value.trim();
            const response = answer.value.trim();
            if (!text || !response) { new Notice(t('Question and answer are required.')); return; }
            const card = this.card ?? this.plugin.fsrsManager.addCard(text, response, source.value.trim() || undefined);
            if (this.card) this.plugin.fsrsManager.updateCard(card.id, { text, answer: response, filePath: source.value.trim() });
            for (const [groupId, check] of checks) {
                if (check.checked) this.plugin.fsrsManager.addCardToGroup(card.id, groupId);
                else this.plugin.fsrsManager.removeCardFromGroup(card.id, groupId);
            }
            this.close();
            this.saved();
            new Notice(t(this.card ? 'Card updated' : 'Card created'));
        });
    }

    private textarea(container: HTMLElement, label: string, value: string, placeholder: string): HTMLTextAreaElement {
        const field = container.createEl('label', { cls: 'hicard-form-field' });
        field.createSpan({ text: label });
        const input = field.createEl('textarea', { attr: { placeholder, rows: '4' } });
        input.value = value;
        return input;
    }

    private input(container: HTMLElement, label: string, value: string, placeholder: string): HTMLInputElement {
        const field = container.createEl('label', { cls: 'hicard-form-field' });
        field.createSpan({ text: label });
        const input = field.createEl('input', { attr: { type: 'text', placeholder } });
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
        if (!this.card) return;
        const confirmed = await showConfirmModal(this.plugin.app, {
            title: t('Reset card progress'),
            message: t('Make this card new again? Its review history will be cleared.')
        });
        if (!confirmed) return;
        this.plugin.fsrsManager.resetCardProgress(this.card.id);
        this.close();
        this.saved();
        new Notice(t('Card progress reset'));
    }
}

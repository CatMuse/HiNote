import { Notice, setIcon, TFile } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import type { FlashcardState } from '../../../flashcard';
import { isSystemCardGroup } from '../../../flashcard/types/FlashcardGroups';
import { showConfirmModal } from '../../../utils/ConfirmModal';
import { renderHiCardPageHeader } from './HiCardPageHeader';
import { HiCardEditorModal } from '../modals/HiCardEditorModal';

type CardStatusFilter = 'all' | 'new' | 'learning' | 'due' | 'scheduled' | 'paused';

export class HiCardCardsPage {
    private container: HTMLElement | null = null;
    private query = '';
    private groupId = 'all';
    private status: CardStatusFilter = 'all';
    private selected = new Set<string>();
    private editor: HiCardEditorModal | null = null;

    constructor(private plugin: CommentPlugin) {}

    render(container: HTMLElement): void {
        this.container = container;
        container.empty();
        container.addClass('hicard-page', 'hicard-cards-page');
        const actions = renderHiCardPageHeader(
            container,
            t('Card management'),
            t('Find, inspect, pause, resume, and delete HiCards.')
        );
        const create = actions.createEl('button', { cls: 'mod-cta', text: t('Create card'), attr: { 'data-action': 'create-card' } });
        create.addEventListener('click', () => this.openEditor());
        this.renderFilters(container);
        if (this.selected.size) this.renderBulkActions(container);
        this.renderCards(container);
    }

    destroy(): void { this.editor?.close(); }

    private renderFilters(container: HTMLElement): void {
        const filters = container.createDiv({ cls: 'hicard-card-filters' });
        const search = filters.createEl('input', {
            cls: 'hicard-card-search',
            attr: { type: 'search', placeholder: t('Search cards') }
        });
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value;
            this.render(container);
            const next = container.querySelector<HTMLInputElement>('.hicard-card-search');
            next?.focus();
            next?.setSelectionRange(this.query.length, this.query.length);
        });

        const status = filters.createEl('select', { cls: 'dropdown' });
        this.addOption(status, 'all', t('All statuses'), this.status);
        this.addOption(status, 'new', t('New Cards'), this.status);
        this.addOption(status, 'learning', t('Learning'), this.status);
        this.addOption(status, 'due', t('Due'), this.status);
        this.addOption(status, 'scheduled', t('Scheduled'), this.status);
        this.addOption(status, 'paused', t('Paused cards'), this.status);
        status.addEventListener('change', () => {
            this.status = status.value as CardStatusFilter;
            this.render(container);
        });

        const group = filters.createEl('select', { cls: 'dropdown' });
        this.addOption(group, 'all', t('All groups'), this.groupId);
        for (const item of this.plugin.fsrsManager.getCardGroups()) {
            this.addOption(group, item.id, isSystemCardGroup(item.id) ? t(item.name) : item.name, this.groupId);
        }
        group.addEventListener('change', () => {
            this.groupId = group.value;
            this.render(container);
        });
    }

    private addOption(select: HTMLSelectElement, value: string, label: string, selected: string): void {
        const option = select.createEl('option', { text: label, value });
        option.selected = value === selected;
    }

    private renderCards(container: HTMLElement): void {
        const cards = this.getFilteredCards();
        const summary = container.createDiv({ cls: 'hicard-card-results-summary' });
        const selectAll = summary.createEl('label', { cls: 'hicard-select-all' });
        const allCheck = selectAll.createEl('input', { attr: { type: 'checkbox', 'aria-label': t('Select all visible cards') } });
        allCheck.checked = cards.length > 0 && cards.slice(0, 200).every(card => this.selected.has(card.id));
        allCheck.addEventListener('change', () => {
            for (const card of cards.slice(0, 200)) allCheck.checked ? this.selected.add(card.id) : this.selected.delete(card.id);
            this.render(container);
        });
        selectAll.createSpan({ text: t('{count} cards', { count: cards.length }) });
        if (cards.length === 0) {
            const empty = container.createDiv({ cls: 'hicard-management-empty' });
            empty.createDiv({ text: t('No matching cards.') });
            if (this.plugin.fsrsManager.getAllCards().length === 0) {
                const create = empty.createEl('button', { cls: 'mod-cta', text: t('Create your first card') });
                create.addEventListener('click', () => this.openEditor());
            }
            return;
        }
        const list = container.createDiv({ cls: 'hicard-card-list' });
        for (const card of cards.slice(0, 200)) this.renderCard(list, card);
        if (cards.length > 200) {
            list.createDiv({ cls: 'hicard-management-empty', text: t('Showing the first 200 cards.') });
        }
    }

    private renderCard(list: HTMLElement, card: FlashcardState): void {
        const row = list.createDiv({ cls: `hicard-card-row${this.selected.has(card.id) ? ' is-selected' : ''}` });
        const check = row.createEl('input', { cls: 'hicard-card-check', attr: { type: 'checkbox', 'aria-label': t('Select card') } });
        check.checked = this.selected.has(card.id);
        check.addEventListener('change', () => {
            check.checked ? this.selected.add(card.id) : this.selected.delete(card.id);
            if (this.container) this.render(this.container);
        });
        const content = row.createDiv({ cls: 'hicard-card-row-content' });
        content.createDiv({ cls: 'hicard-card-question', text: card.text || t('Untitled card') });
        const details = content.createDiv({ cls: 'hicard-card-meta' });
        details.createSpan({ cls: `hicard-card-status is-${this.getCardStatus(card)}`, text: this.getCardStatusLabel(card) });
        if (card.filePath) details.createSpan({ text: card.filePath });
        details.createSpan({ text: this.getNextReviewLabel(card) });

        const actions = row.createDiv({ cls: 'hicard-management-actions' });
        this.addAction(actions, 'pencil', t('Edit'), () => this.openEditor(card));
        const filePath = card.filePath;
        if (filePath) this.addAction(actions, 'file-text', t('Open source'), () => this.openSource(filePath));
        this.addAction(actions, card.suspended ? 'play' : 'pause', t(card.suspended ? 'Resume card' : 'Pause card'), () => {
            void this.toggleSuspended(card);
        });
        this.addAction(actions, 'trash-2', t('Delete'), () => { void this.deleteCard(card); }, true);
    }

    private addAction(
        container: HTMLElement,
        iconName: string,
        label: string,
        action: () => void,
        destructive = false
    ): void {
        const button = container.createEl('button', {
            cls: `clickable-icon${destructive ? ' hicard-destructive-action' : ''}`,
            attr: { type: 'button', 'aria-label': label }
        });
        button.setAttribute('data-tooltip', label);
        setIcon(button, iconName);
        button.addEventListener('click', action);
    }

    private getFilteredCards(): FlashcardState[] {
        const source = this.groupId === 'all'
            ? this.plugin.fsrsManager.getAllCards()
            : this.plugin.fsrsManager.getCardsByGroupId(this.groupId);
        const query = this.query.trim().toLocaleLowerCase();
        return source
            .filter(card => this.status === 'all' || this.getCardStatus(card) === this.status)
            .filter(card => !query || `${card.text}\n${card.answer}\n${card.filePath ?? ''}`.toLocaleLowerCase().includes(query))
            .sort((a, b) => a.nextReview - b.nextReview || b.createdAt - a.createdAt);
    }

    private getCardStatus(card: FlashcardState): Exclude<CardStatusFilter, 'all'> {
        if (card.suspended) return 'paused';
        if (card.lastReview === 0) return 'new';
        if (card.state === 1 || card.state === 3) return 'learning';
        return card.nextReview <= Date.now() ? 'due' : 'scheduled';
    }

    private getCardStatusLabel(card: FlashcardState): string {
        const status = this.getCardStatus(card);
        return t({
            paused: 'Paused cards',
            new: 'New Cards',
            learning: 'Learning',
            due: 'Due',
            scheduled: 'Scheduled'
        }[status]);
    }

    private getNextReviewLabel(card: FlashcardState): string {
        if (card.suspended) return t('No review scheduled');
        if (card.lastReview === 0) return t('Not studied yet');
        if (card.nextReview <= Date.now()) return t('Due now');
        return new Date(card.nextReview).toLocaleString();
    }

    private async toggleSuspended(card: FlashcardState): Promise<void> {
        try {
            await this.plugin.fsrsManager.setCardSuspended(card.id, !card.suspended);
            if (this.container) this.render(this.container);
        } catch {
            new Notice(t('Card could not be updated. Please try again.'));
        }
    }

    private async deleteCard(card: FlashcardState): Promise<void> {
        const confirmed = await showConfirmModal(this.plugin.app, {
            title: t('Delete HiCard'),
            message: t('Delete this HiCard? The source highlight will be kept.')
        });
        if (!confirmed) return;
        this.plugin.fsrsManager.deleteCard(card.id);
        this.selected.delete(card.id);
        if (this.container) this.render(this.container);
    }

    private openEditor(card?: FlashcardState): void {
        this.editor?.close();
        this.editor = new HiCardEditorModal(this.plugin, card, () => {
            this.editor = null;
            if (this.container) this.render(this.container);
        });
        this.editor.open();
    }

    private renderBulkActions(container: HTMLElement): void {
        const bar = container.createDiv({ cls: 'hicard-bulk-bar' });
        bar.createSpan({ cls: 'hicard-bulk-count', text: t('{count} selected', { count: this.selected.size }) });
        const group = bar.createEl('select', { cls: 'dropdown' });
        group.createEl('option', { value: '', text: t('Add to group…') });
        for (const item of this.plugin.fsrsManager.getCardGroups().filter(item => !isSystemCardGroup(item.id))) {
            group.createEl('option', { value: item.id, text: item.name });
        }
        group.addEventListener('change', () => {
            if (!group.value) return;
            for (const cardId of this.selected) this.plugin.fsrsManager.addCardToGroup(cardId, group.value);
            new Notice(t('Cards added to group'));
            group.value = '';
        });
        const pause = bar.createEl('button', { text: t('Pause') });
        pause.addEventListener('click', () => { void this.setSelectedSuspended(true); });
        const resume = bar.createEl('button', { text: t('Resume') });
        resume.addEventListener('click', () => { void this.setSelectedSuspended(false); });
        const remove = bar.createEl('button', { cls: 'hicard-destructive-button', text: t('Delete') });
        remove.addEventListener('click', () => { void this.deleteSelected(); });
        const clear = bar.createEl('button', { cls: 'clickable-icon', attr: { type: 'button', 'aria-label': t('Clear selection') } });
        setIcon(clear, 'x');
        clear.addEventListener('click', () => { this.selected.clear(); this.render(container); });
    }

    private async setSelectedSuspended(suspended: boolean): Promise<void> {
        await Promise.all(Array.from(this.selected, id => this.plugin.fsrsManager.setCardSuspended(id, suspended)));
        if (this.container) this.render(this.container);
    }

    private async deleteSelected(): Promise<void> {
        const confirmed = await showConfirmModal(this.plugin.app, {
            title: t('Delete selected cards'),
            message: t('Delete {count} selected cards? Source highlights will be kept.', { count: this.selected.size })
        });
        if (!confirmed) return;
        for (const id of this.selected) this.plugin.fsrsManager.deleteCard(id);
        this.selected.clear();
        if (this.container) this.render(this.container);
    }

    private openSource(filePath: string): void {
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) void this.plugin.app.workspace.getLeaf().openFile(file);
    }
}

import { MarkdownView, Menu, Notice, setIcon, TFile } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { formatDate, formatDateTime, t } from '../../../i18n';
import type { FlashcardState } from '../../../flashcard';
import type { HiCardManagementViewMode } from '../../../flashcard/types/FSRSTypes';
import { isSystemCardGroup } from '../../../flashcard/types/FlashcardGroups';
import type { HighlightRecord } from '../../../types/highlight';
import { showConfirmModal } from '../../../utils/ConfirmModal';
import { renderHiCardPageHeader, renderHiCardViewToggle } from './HiCardPageHeader';
import { HiCardEditorModal } from '../modals/HiCardEditorModal';
import { createBulkActionButton } from '../../../components/BulkActionButton';

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
        renderHiCardViewToggle(actions, this.getViewMode(), mode => this.setViewMode(mode));
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
        let composing = false;
        search.addEventListener('input', () => {
            if (composing) return;
            this.updateSearchQuery(container, search);
        });
        search.addEventListener('compositionstart', () => {
            composing = true;
        });
        search.addEventListener('compositionend', () => {
            composing = false;
            this.updateSearchQuery(container, search);
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

    private updateSearchQuery(container: HTMLElement, search: HTMLInputElement): void {
        this.query = search.value;
        this.render(container);
        const next = container.querySelector<HTMLInputElement>('.hicard-card-search');
        next?.focus();
        next?.setSelectionRange(this.query.length, this.query.length);
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
            empty.createDiv({ text: t(this.plugin.fsrsManager.getAllCards().length === 0
                ? 'Create a HiCard from a highlight in HiNote.'
                : 'No matching cards.') });
            return;
        }
        const viewMode = this.getViewMode();
        const list = container.createDiv({
            cls: viewMode === 'grid' ? 'hicard-card-grid' : 'hicard-card-list',
            attr: viewMode === 'grid' ? undefined : { role: 'list' }
        });
        for (const card of cards.slice(0, 200)) this.renderCard(list, card, viewMode);
        if (cards.length > 200) {
            list.createDiv({ cls: 'hicard-management-empty', text: t('Showing the first 200 cards.') });
        }
    }

    private renderCard(list: HTMLElement, card: FlashcardState, viewMode: HiCardManagementViewMode): void {
        const isGrid = viewMode === 'grid';
        const isSelected = this.selected.has(card.id);
        const row = list.createEl('article', {
            cls: `hicard-card-${isGrid ? 'tile' : 'row'}${isSelected ? ' is-selected' : ''}`,
            attr: isGrid ? undefined : {
                tabindex: '0',
                'aria-selected': String(isSelected),
                role: 'listitem'
            }
        });
        const source = card.sourceId ? this.plugin.highlightRepository.findHighlightById(card.sourceId) : null;
        const gridHeader = isGrid ? this.renderGridHeader(row, card) : null;
        const checkHost = gridHeader?.selector ?? row;
        const check = checkHost.createEl('input', {
            cls: 'hicard-card-check',
            attr: {
                type: 'checkbox',
                'aria-label': t('Select card: {question}', { question: card.text || t('Untitled card') })
            }
        });
        check.checked = this.selected.has(card.id);
        check.addEventListener('change', () => {
            check.checked ? this.selected.add(card.id) : this.selected.delete(card.id);
            if (this.container) this.render(this.container);
        });
        row.addEventListener('click', event => {
            const target = event.target as HTMLElement;
            if (target.closest('button, input, a, [role="button"], .hicard-management-actions, .hicard-card-source-name')) return;
            if (this.selected.has(card.id)) this.selected.delete(card.id);
            else this.selected.add(card.id);
            if (this.container) this.render(this.container);
        });
        if (!isGrid) {
            row.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                const target = event.target as HTMLElement;
                if (target.closest('button, input, a, [role="button"]')) return;
                event.preventDefault();
                if (this.selected.has(card.id)) this.selected.delete(card.id);
                else this.selected.add(card.id);
                if (this.container) this.render(this.container);
            });
        }
        const content = row.createDiv({ cls: 'hicard-card-row-content' });
        if (isGrid) {
            const question = content.createDiv({ cls: 'hicard-card-side hicard-card-front' });
            this.renderSideLabel(question, 'Q', t('Question'));
            question.createDiv({ cls: 'hicard-card-question', text: card.text || t('Untitled card') });
            this.renderGridAnnotations(content, card, source);
        } else {
            content.createDiv({ cls: 'hicard-card-question', text: card.text || t('Untitled card') });
            const details = content.createDiv({ cls: 'hicard-card-meta' });
            details.createSpan({ cls: `hicard-card-status is-${this.getCardStatus(card)}`, text: this.getCardStatusLabel(card) });
            if (card.filePath) {
                const sourceName = details.createSpan({ cls: 'hicard-card-source-name', text: this.getSourceFileName(card.filePath) });
                sourceName.addClass('is-openable');
                sourceName.setAttribute('data-tooltip', `${card.filePath} · ${t('Open source (double-click)')}`);
                sourceName.addEventListener('dblclick', event => {
                    event.preventDefault();
                    event.stopPropagation();
                    void this.openCardSource(card, source);
                });
            }
            details.createSpan({ text: this.getNextReviewLabel(card) });
        }

        const actions = gridHeader?.actions ?? row.createDiv({ cls: 'hicard-management-actions' });
        this.addAction(actions, 'pencil', t(isGrid && card.sourceType === 'highlight' ? 'Edit annotations' : 'Edit'), () => this.openEditor(card));
        this.addMoreActions(actions, card);
    }

    private renderGridHeader(
        container: HTMLElement,
        card: FlashcardState
    ): { selector: HTMLElement; actions: HTMLElement } {
        const header = container.createDiv({ cls: 'hicard-card-tile-header' });
        const left = header.createDiv({ cls: 'hicard-card-tile-header-left' });
        const selector = left.createDiv({ cls: 'hicard-card-selector' });
        const icon = selector.createSpan({ cls: 'hicard-card-selector-icon' });
        setIcon(icon, 'book-heart');
        this.renderGridSourceName(left, card);

        const actions = header.createDiv({ cls: 'hicard-management-actions' });
        const status = this.getCardStatus(card);
        actions.createSpan({
            cls: `hicard-card-status is-${status}`,
            text: status === 'scheduled'
                ? formatDate(card.nextReview, { month: 'short', day: 'numeric' })
                : t({ paused: 'Paused', new: 'New card', learning: 'Learning', due: 'Due now' }[status])
        });
        return { selector, actions };
    }

    private renderGridSourceName(container: HTMLElement, card: FlashcardState): void {
        const fileName = card.filePath ? this.getSourceFileName(card.filePath) : t('Source');
        const label = container.createSpan({ cls: 'hicard-card-source-name', text: fileName });
        if (card.filePath) {
            label.addClass('is-openable');
            label.setAttribute('data-tooltip', `${card.filePath} · ${t('Open source (double-click)')}`);
            label.addEventListener('dblclick', event => {
                event.preventDefault();
                event.stopPropagation();
                const source = card.sourceId ? this.plugin.highlightRepository.findHighlightById(card.sourceId) : null;
                void this.openCardSource(card, source);
            });
        }
    }

    private renderGridAnnotations(container: HTMLElement, card: FlashcardState, source: HighlightRecord | null): void {
        const section = container.createDiv({ cls: 'hicard-card-annotations' });
        if (source?.comments.length) {
            const comments = [...source.comments].sort((a, b) => b.updatedAt - a.updatedAt);
            for (const comment of comments) {
                const annotation = section.createDiv({ cls: 'hicard-card-side hicard-card-annotation' });
                this.renderSideLabel(annotation, 'A', t('Answer'));
                const body = annotation.createDiv({ cls: 'hicard-card-side-body' });
                body.createDiv({ cls: 'hicard-card-annotation-content', text: comment.content });
                body.createDiv({ cls: 'hicard-card-annotation-time', text: formatDateTime(comment.updatedAt || comment.createdAt) });
            }
            return;
        }
        const annotation = section.createDiv({ cls: `hicard-card-side hicard-card-annotation${card.answer ? '' : ' is-empty'}` });
        this.renderSideLabel(annotation, 'A', t('Answer'));
        const body = annotation.createDiv({ cls: 'hicard-card-side-body' });
        body.createDiv({
            cls: 'hicard-card-annotation-content',
            text: card.answer || t('No annotations')
        });
    }

    private renderSideLabel(container: HTMLElement, letter: 'Q' | 'A', label: string): void {
        container.createSpan({
            cls: `hicard-card-side-label is-${letter.toLowerCase()}`,
            text: letter,
            attr: { 'aria-label': label, title: label }
        });
    }

    private addMoreActions(container: HTMLElement, card: FlashcardState): void {
        const button = container.createEl('button', {
            cls: 'clickable-icon',
            attr: { type: 'button', 'aria-label': t('More actions'), 'aria-haspopup': 'menu' }
        });
        button.setAttribute('data-tooltip', t('More actions'));
        setIcon(button, 'ellipsis');
        button.addEventListener('click', () => {
            const menu = new Menu();
            menu.addItem(item => item
                .setTitle(t(card.suspended ? 'Resume card' : 'Pause card'))
                .setIcon(card.suspended ? 'play' : 'pause')
                .onClick(() => { void this.toggleSuspended(card); }));
            menu.addItem(item => item
                .setTitle(t('Delete'))
                .setIcon('trash-2')
                .setWarning(true)
                .onClick(() => { void this.deleteCard(card); }));
            const rect = button.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
        });
    }

    private getSourceFileName(filePath: string): string {
        return filePath.split('/').pop()?.replace(/\.md$/i, '') || filePath;
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

    private getViewMode(): HiCardManagementViewMode {
        return this.plugin.fsrsManager.getUIState().viewModes?.cards === 'grid' ? 'grid' : 'list';
    }

    private setViewMode(mode: HiCardManagementViewMode): void {
        const uiState = this.plugin.fsrsManager.getUIState();
        this.plugin.fsrsManager.updateUIState({
            viewModes: { ...uiState.viewModes, cards: mode }
        });
        if (this.container) this.render(this.container);
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

    private openEditor(card: FlashcardState): void {
        this.editor?.close();
        this.editor = new HiCardEditorModal(this.plugin, card, () => {
            this.editor = null;
            if (this.container) this.render(this.container);
        });
        this.editor.open();
    }

    private renderBulkActions(container: HTMLElement): void {
        const bar = container.createDiv({ cls: 'multi-select-actions hicard-bulk-bar' });
        const count = bar.createDiv({
            cls: 'selected-count',
            text: String(this.selected.size),
            attr: { 'aria-label': t('Selected {count}').replace('{count}', String(this.selected.size)) }
        });
        count.setAttribute('data-tooltip', t('{count} selected', { count: this.selected.size }));

        createBulkActionButton(bar, {
            icon: 'folder-plus',
            label: t('Add to group…'),
            hasPopup: true,
            action: () => this.openAddToGroupMenu(bar)
        });
        createBulkActionButton(bar, {
            icon: 'pause',
            label: t('Pause'),
            action: () => this.setSelectedSuspended(true)
        });
        createBulkActionButton(bar, {
            icon: 'play',
            label: t('Resume'),
            action: () => this.setSelectedSuspended(false)
        });
        createBulkActionButton(bar, {
            icon: 'trash-2',
            label: t('Delete'),
            destructive: true,
            action: () => this.deleteSelected()
        });
        createBulkActionButton(bar, {
            icon: 'x',
            label: t('Clear selection'),
            action: () => {
                this.selected.clear();
                this.render(container);
            }
        });
    }

    private openAddToGroupMenu(anchor: HTMLElement): void {
        const groups = this.plugin.fsrsManager.getCardGroups().filter(item => !isSystemCardGroup(item.id));
        if (groups.length === 0) {
            new Notice(t('Create a manual group to organize cards here.'));
            return;
        }
        const menu = new Menu();
        for (const group of groups) {
            menu.addItem(item => {
                item.setTitle(group.name).setIcon('folder').onClick(() => {
                    for (const cardId of this.selected) this.plugin.fsrsManager.addCardToGroup(cardId, group.id);
                    new Notice(t('Cards added to group'));
                    if (this.container) this.render(this.container);
                });
            });
        }
        const rect = anchor.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
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

    private async openCardSource(card: FlashcardState, source: HighlightRecord | null): Promise<void> {
        if (!card.filePath) return;
        const file = this.plugin.app.vault.getAbstractFileByPath(card.filePath);
        if (!(file instanceof TFile)) return;

        const leaf = this.plugin.app.workspace.getLeaf();
        await leaf.openFile(file);
        if (!(leaf.view instanceof MarkdownView) || typeof source?.position !== 'number') return;
        const position = leaf.view.editor.offsetToPos(source.position);
        leaf.view.editor.setCursor(position);
        leaf.view.editor.scrollIntoView({ from: position, to: position }, true);
    }
}

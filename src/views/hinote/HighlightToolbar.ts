import { Component, ExtraButtonComponent, Menu } from 'obsidian';
import { t } from '../../i18n';
import type { HighlightCardType, HighlightSort, ViewState } from './ViewState';

interface HighlightToolbarElements {
    toolbar: HTMLElement;
    toolbarTitle: HTMLElement;
    searchField: HTMLElement;
    searchInput: HTMLInputElement;
    actions: HTMLElement;
}

interface HighlightToolbarCallbacks {
    onCurrentDocument: () => Promise<void>;
    onAllDocuments: () => Promise<void>;
    onAddFileComment: () => void | Promise<void>;
    onViewOptionsChanged: () => void;
    onRefresh: () => Promise<void>;
    onExport: () => Promise<void>;
}

interface ToolbarActionPresentation {
    button: ExtraButtonComponent;
    tooltip: string;
    label: string;
}

/** Obsidian-native actions for searching and shaping the highlight view. */
export class HighlightToolbar {
    private searchButton: ExtraButtonComponent;
    private addFileCommentButton: ExtraButtonComponent;
    private filterButton: ExtraButtonComponent;
    private sortButton: ExtraButtonComponent;
    private exportButton: ExtraButtonComponent;
    private actionPresentations: ToolbarActionPresentation[] = [];
    private searchOpen = false;

    constructor(
        private component: Component,
        private state: ViewState,
        private elements: HighlightToolbarElements,
        private callbacks: HighlightToolbarCallbacks
    ) {
        this.searchButton = this.createAction('search', t('Search highlights'), t('Toolbar Search'), () => this.toggleSearch());
        this.addFileCommentButton = this.createAction('message-square-plus', t('Add File Comment'), t('Toolbar Note'), event => {
            // CommentInput installs a document-level outside-click handler as it
            // opens. Do not let the originating toolbar click immediately close it.
            event.preventDefault();
            event.stopPropagation();
            void callbacks.onAddFileComment();
        });
        this.filterButton = this.createAction('list-filter', t('Filter highlights'), t('Toolbar Filter'), event => this.showFilterMenu(event));
        this.sortButton = this.createAction('arrow-up-down', t('Sort highlights'), t('Toolbar Sort'), event => this.showSortMenu(event));
        this.exportButton = this.createAction('file-output', t('Export current document as notes'), t('Toolbar Export'), () => { void callbacks.onExport(); });

        const refresh = () => { void callbacks.onRefresh(); };
        component.registerDomEvent(elements.toolbarTitle, 'click', refresh);
        component.registerDomEvent(elements.toolbarTitle, 'keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            refresh();
        });

        component.registerDomEvent(elements.searchField, 'keydown', (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing) return;
            event.preventDefault();
            event.stopPropagation();
            this.closeSearch();
        });
        component.register(state.subscribe(() => this.update()));
        this.update();
    }

    private createAction(
        icon: string,
        tooltip: string,
        label: string,
        callback: (event: MouseEvent) => void
    ): ExtraButtonComponent {
        const button = new ExtraButtonComponent(this.elements.actions)
            .setIcon(icon)
            .setTooltip(tooltip);
        button.extraSettingsEl.addClass('hinote-toolbar-button');
        button.extraSettingsEl.setAttribute('aria-label', tooltip);
        this.actionPresentations.push({ button, tooltip, label });
        this.component.registerDomEvent(button.extraSettingsEl, 'click', callback);
        return button;
    }

    private toggleSearch(): void {
        if (this.searchOpen) this.closeSearch();
        else this.openSearch();
    }

    private openSearch(): void {
        this.searchOpen = true;
        this.elements.toolbar.addClass('is-searching');
        this.elements.searchField.removeClass('highlight-display-none');
        this.searchButton.extraSettingsEl.setAttribute('aria-expanded', 'true');
        this.update();
        this.elements.searchInput.focus();
    }

    private closeSearch(): void {
        this.searchOpen = false;
        this.elements.searchInput.blur();
        this.elements.toolbar.removeClass('is-searching');
        this.elements.searchField.addClass('highlight-display-none');
        this.searchButton.extraSettingsEl.setAttribute('aria-expanded', 'false');
        this.update();
    }

    private showFilterMenu(event: MouseEvent): void {
        const menu = new Menu();
        const currentScope = this.state.page.kind === 'file' || this.state.page.kind === 'canvas';
        const lockToAllDocuments = !currentScope && this.state.placement === 'main';
        const lockToCurrentDocument = currentScope && this.state.placement === 'main';
        menu.addItem(item => item
            .setTitle(t('Current document'))
            .setIcon('file-text')
            .setChecked(currentScope)
            .setDisabled(lockToAllDocuments)
            .onClick(() => { void this.callbacks.onCurrentDocument(); }));
        menu.addItem(item => item
            .setTitle(t('All documents'))
            .setIcon('files')
            .setChecked(!currentScope)
            .setDisabled(lockToCurrentDocument)
            .onClick(() => { void this.callbacks.onAllDocuments(); }));
        menu.addSeparator();
        this.addCardTypeItem(menu, 'all', t('All cards'));
        this.addCardTypeItem(menu, 'hicard', t('HiCard'));
        this.addCardTypeItem(menu, 'comment', t('Comment'));
        menu.showAtMouseEvent(event);
    }

    private addCardTypeItem(menu: Menu, cardType: HighlightCardType, title: string): void {
        menu.addItem(item => item
            .setTitle(title)
            .setChecked(this.state.cardType === cardType)
            .onClick(() => {
                this.state.setCardType(cardType);
                this.callbacks.onViewOptionsChanged();
            }));
    }

    private showSortMenu(event: MouseEvent): void {
        const menu = new Menu();
        this.addSortItem(menu, 'position', t('Highlight position'));
        this.addSortItem(menu, 'updated-desc', t('Recently updated'));
        this.addSortItem(menu, 'updated-asc', t('Least recently updated'));
        menu.showAtMouseEvent(event);
    }

    private addSortItem(menu: Menu, sort: HighlightSort, title: string): void {
        menu.addItem(item => item
            .setTitle(title)
            .setChecked(this.state.sort === sort)
            .onClick(() => {
                this.state.setSort(sort);
                this.callbacks.onViewOptionsChanged();
            }));
    }

    private update(): void {
        const fileContext = this.state.page.kind === 'file';
        const collectionContext = this.state.page.kind === 'all' || this.state.page.kind === 'favorites';
        this.setDisabled(this.addFileCommentButton, !fileContext);
        this.setDisabled(this.exportButton, !fileContext);
        this.setVisible(this.addFileCommentButton, !collectionContext);
        this.setVisible(this.sortButton, !collectionContext);
        this.setVisible(this.exportButton, !collectionContext);

        this.searchButton.extraSettingsEl.setAttribute('aria-expanded', String(this.searchOpen));
        this.setActive(this.searchButton, this.searchOpen);
        this.setActive(this.filterButton,
            this.state.page.kind === 'all' || this.state.page.kind === 'favorites' || this.state.cardType !== 'all');
        this.setActive(this.sortButton, this.state.sort !== 'position');
        this.updateActionPresentation();

        if (!this.searchOpen) {
            this.elements.searchField.addClass('highlight-display-none');
        }
    }

    private setDisabled(button: ExtraButtonComponent, disabled: boolean): void {
        button.setDisabled(disabled);
        button.extraSettingsEl.toggleClass('is-disabled', disabled);
    }

    private setVisible(button: ExtraButtonComponent, visible: boolean): void {
        button.extraSettingsEl.toggleClass('highlight-display-none', !visible);
    }

    private setActive(button: ExtraButtonComponent, active: boolean): void {
        button.extraSettingsEl.toggleClass('is-active', active);
        button.extraSettingsEl.setAttribute('aria-pressed', String(active));
    }

    private updateActionPresentation(): void {
        const showLabels = this.state.placement === 'main';
        this.actionPresentations.forEach(action => {
            const element = action.button.extraSettingsEl;
            element.querySelectorAll(':scope > .hinote-toolbar-button-label').forEach(label => label.remove());
            element.createSpan({ cls: 'hinote-toolbar-button-label', text: action.label });
            if (showLabels) {
                // Obsidian turns aria-label into a hover tooltip. Visible text is
                // the accessible name in the main view, so the tooltip is redundant.
                element.removeAttribute('aria-label');
                element.removeAttribute('title');
            } else {
                action.button.setTooltip(action.tooltip);
                element.setAttribute('aria-label', action.tooltip);
            }
        });
    }
}

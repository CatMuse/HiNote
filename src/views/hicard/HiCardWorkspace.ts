import { Component, setIcon } from 'obsidian';
import type CommentPlugin from '../../../main';
import { FlashcardComponent } from '../../flashcard';
import { LicenseManager } from '../../services/LicenseManager';
import { t } from '../../i18n';
import { isSystemCardGroup } from '../../flashcard/types/FlashcardGroups';
import { HiCardGroupsPage } from './pages/HiCardGroupsPage';
import { HiCardCardsPage } from './pages/HiCardCardsPage';
import { HiCardAnalyticsPage } from './pages/HiCardAnalyticsPage';
import { HiCardSettingsPage } from './pages/HiCardSettingsPage';
import { HiCardTodayPage } from './pages/HiCardTodayPage';

export type HiCardPageId = 'today' | 'study' | 'groups' | 'cards' | 'analytics' | 'settings';

interface NavigationItem {
    id: HiCardPageId;
    label: string;
    icon: string;
}

const NAVIGATION: NavigationItem[] = [
    { id: 'today', label: 'Today', icon: 'sun' },
    { id: 'groups', label: 'Study groups', icon: 'layers-3' },
    { id: 'cards', label: 'Card management', icon: 'library' },
    { id: 'analytics', label: 'Statistics', icon: 'chart-no-axes-combined' },
    { id: 'settings', label: 'Learning settings', icon: 'settings-2' }
];

export class HiCardWorkspace extends Component {
    private readonly sidebarEl: HTMLElement;
    private readonly contentEl: HTMLElement;
    private currentPage: HiCardPageId = 'today';
    private studyOrigin: Exclude<HiCardPageId, 'study'> = 'today';
    private studyComponent: FlashcardComponent | null = null;
    private pageCleanup: (() => void) | null = null;
    private generation = 0;
    private refreshTimer: number | null = null;
    private checkingStudyExit = false;

    constructor(private rootEl: HTMLElement, private plugin: CommentPlugin) {
        super();
        rootEl.addClass('hicard-workspace');
        const toolbar = rootEl.createDiv({ cls: 'hicard-workspace-toolbar' });
        const titleGroup = toolbar.createDiv({ cls: 'hicard-workspace-title-group' });
        titleGroup.createDiv({ cls: 'hicard-workspace-title', text: 'HICARD' });

        const body = rootEl.createDiv({ cls: 'hicard-workspace-body' });
        this.sidebarEl = body.createEl('nav', {
            cls: 'hicard-workspace-sidebar',
            attr: { 'aria-label': t('HiCard navigation') }
        });
        this.contentEl = body.createDiv({ cls: 'hicard-workspace-content' });
        this.renderNavigation();
        this.registerEvent(plugin.eventManager.on('flashcard:changed', () => {
            if (this.currentPage === 'study' || this.refreshTimer !== null) return;
            const ownerWindow = this.rootEl.ownerDocument.defaultView;
            this.refreshTimer = ownerWindow?.setTimeout(() => {
                this.refreshTimer = null;
                this.refreshCurrentPage();
            }, 50) ?? null;
        }));
    }

    async open(isCurrent: () => boolean = () => true): Promise<void> {
        await this.showPage('today', isCurrent);
    }

    async showStudyGroup(groupId: string): Promise<void> {
        await this.showPage('study', () => true, groupId);
    }

    async showCards(): Promise<void> {
        await this.showPage('cards');
    }

    private async activateStudyGroup(groupId: string): Promise<void> {
        if (!this.studyComponent) return;
        this.studyComponent.setCurrentGroupId(groupId);
        this.studyComponent.refreshCardList();
        this.studyComponent.getRenderer().render();
    }

    close(): void {
        this.generation++;
        if (this.refreshTimer !== null) {
            this.rootEl.ownerDocument.defaultView?.clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.releasePage();
        this.rootEl.removeClass('is-studying');
        this.rootEl.empty();
    }

    onunload(): void {
        this.close();
    }

    private renderNavigation(): void {
        const list = this.sidebarEl.createDiv({ cls: 'hicard-workspace-nav' });
        for (const item of NAVIGATION) {
            const button = list.createEl('button', {
                cls: `hicard-workspace-nav-item${item.id === this.currentPage ? ' is-active' : ''}`,
                attr: { type: 'button', 'data-page': item.id, 'aria-label': t(item.label) }
            });
            const icon = button.createSpan({ cls: 'hicard-workspace-nav-icon' });
            setIcon(icon, item.icon);
            button.createSpan({ cls: 'hicard-workspace-nav-label', text: t(item.label) });
            this.registerDomEvent(button, 'click', () => { void this.showPage(item.id); });
        }
    }

    private async showPage(
        page: HiCardPageId,
        isCurrent: () => boolean = () => true,
        groupId?: string
    ): Promise<void> {
        if (this.studyComponent) {
            if (this.checkingStudyExit) return;
            const component = this.studyComponent;
            const version = this.generation;
            this.checkingStudyExit = true;
            try {
                if (!await component.getRenderer().prepareToLeave()) return;
                if (version !== this.generation || component !== this.studyComponent) return;
                if (component.canStudy()) component.saveState();
            } finally {
                this.checkingStudyExit = false;
            }
        }
        const generation = ++this.generation;
        if (page === 'study' && this.currentPage !== 'study') this.studyOrigin = this.currentPage;
        this.releasePage();
        this.currentPage = page;
        this.updateNavigation();
        this.contentEl.empty();
        this.contentEl.toggleClass('is-study-page', page === 'study');
        this.rootEl.toggleClass('is-studying', page === 'study');
        this.sidebarEl.hidden = page === 'study';
        if (page === 'study') {
            const surface = this.contentEl.createDiv({ cls: 'hicard-study-surface' });
            const bar = surface.createDiv({ cls: 'hicard-study-toolbar' });
            const returnLabel = this.studyOrigin === 'groups' ? t('Back to study groups') : t('Back to today');
            const back = bar.createEl('button', { cls: 'hicard-study-exit', attr: { type: 'button', 'aria-label': t('Exit study') } });
            setIcon(back.createSpan({ cls: 'hicard-study-exit-icon' }), 'arrow-left');
            back.createSpan({ text: t('Exit study') });
            back.addEventListener('click', () => { void this.showPage(this.studyOrigin); });
            const group = groupId ? this.plugin.fsrsManager.getCardGroups().find(item => item.id === groupId) : undefined;
            const groupTitle = group ? (isSystemCardGroup(group.id) ? t(group.name) : group.name) : t('Study');
            bar.createDiv({ cls: 'hicard-study-title', text: groupTitle });
            const progress = bar.createDiv({ cls: 'flashcard-progress-container' });
            const container = surface.createDiv({ cls: 'hicard-study-container' });
            const component = new FlashcardComponent(container, this.plugin);
            component.setProgressContainer(progress);
            component.setStudyExit(() => { void this.showPage(this.studyOrigin); }, returnLabel);
            this.studyComponent = component;
            component.setLicenseManager(new LicenseManager(this.plugin));
            this.addChild(component);
            await component.activate(() => generation === this.generation && isCurrent());
            if (generation !== this.generation || !isCurrent() || component !== this.studyComponent) return;
            if (groupId) await this.activateStudyGroup(groupId);
            if (component.canStudy()) container.focus();
            return;
        }
        this.renderManagementPage(page);
    }

    private renderManagementPage(page: Exclude<HiCardPageId, 'study'>): void {
        if (page === 'today') {
            new HiCardTodayPage(
                this.plugin,
                groupId => this.showPage('study', () => true, groupId),
                () => this.showCards()
            ).render(this.contentEl);
            return;
        }
        if (page === 'groups') {
            const groups = new HiCardGroupsPage(this.plugin, groupId => this.showStudyGroup(groupId));
            groups.render(this.contentEl);
            this.pageCleanup = () => groups.destroy();
            return;
        }
        if (page === 'cards') {
            const cards = new HiCardCardsPage(this.plugin);
            cards.render(this.contentEl);
            this.pageCleanup = () => cards.destroy();
            return;
        }
        if (page === 'analytics') {
            new HiCardAnalyticsPage(this.plugin).render(this.contentEl);
            return;
        }
        const settings = new HiCardSettingsPage(this.plugin);
        settings.render(this.contentEl);
        this.pageCleanup = () => settings.destroy();
    }

    private refreshCurrentPage(): void {
        const page = this.currentPage;
        if (page === 'study') return;
        this.releasePage();
        this.contentEl.empty();
        this.renderManagementPage(page);
    }

    private releasePage(): void {
        this.pageCleanup?.();
        this.pageCleanup = null;
        if (!this.studyComponent) return;
        this.studyComponent.deactivate();
        this.removeChild(this.studyComponent);
        this.studyComponent = null;
    }

    private updateNavigation(): void {
        for (const item of Array.from(this.sidebarEl.querySelectorAll<HTMLElement>('[data-page]'))) {
            item.classList.toggle('is-active', item.dataset.page === this.currentPage);
        }
    }


}

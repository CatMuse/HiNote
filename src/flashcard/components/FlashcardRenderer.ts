import { Platform } from "obsidian";
import { t } from "../../i18n";
import { PAUSED_CARDS_GROUP } from '../types/FlashcardGroups';
import type { FlashcardState } from "../types/FSRSTypes";
import type { FlashcardComponentContext } from "./FlashcardComponentContext";
import {
    FlashcardActivationRenderer,
    FlashcardMarkdownRenderer,
    FlashcardGroupListRenderer,
    FlashcardEmptyStateRenderer,
    FlashcardCardRenderer
} from "./renderers";

/**
 * 闪卡渲染器，负责所有UI渲染相关的功能
 */
export class FlashcardRenderer {
    private component: FlashcardComponentContext;
    private isMobileView: boolean = false;
    private isSmallScreen: boolean = false;
    private showingSidebar: boolean = true;
    private activationRenderer: FlashcardActivationRenderer;
    private markdownRenderer: FlashcardMarkdownRenderer;
    private groupListRenderer: FlashcardGroupListRenderer;
    private emptyStateRenderer: FlashcardEmptyStateRenderer;
    private cardRenderer: FlashcardCardRenderer;
    
    constructor(component: FlashcardComponentContext) {
        this.component = component;
        this.activationRenderer = new FlashcardActivationRenderer(component, () => { void component.activate(); });
        this.markdownRenderer = new FlashcardMarkdownRenderer(component);
        this.groupListRenderer = new FlashcardGroupListRenderer(component);
        this.emptyStateRenderer = new FlashcardEmptyStateRenderer(component);
        this.cardRenderer = new FlashcardCardRenderer(component, this.markdownRenderer);
        this.isSmallScreen = component.getContainer().clientWidth < 768;
        this.isMobileView = Platform.isMobile || this.isSmallScreen;
        this.showingSidebar = this.isMobileView;
    }
    
    /**
     * 渲染激活界面
     */
    public renderActivation() {
        this.dispose();
        this.activationRenderer.render();
    }

    public dispose(): void { this.markdownRenderer.dispose(); }
    
    /**
     * 切换侧边栏和内容区域的显示状态
     */
    public toggleSidebar() {
        this.showingSidebar = !this.showingSidebar;
        this.render();
    }
    
    /**
     * 获取当前侧边栏的显示状态
     */
    public isShowingSidebar(): boolean {
        return this.showingSidebar;
    }
    
    /**
     * 显示侧边栏
     */
    public showSidebar() {
        this.showingSidebar = true;

        const container = this.component.getContainer();
        if (this.isMobileView && this.isSmallScreen) {
            container.addClass('show-sidebar');
            container.removeClass('show-content');
        }

        this.render();
    }
    
    /**
     * 返回上一级
     * 在卡片内容页面时，返回到分组列表
     * 在分组列表页面时，返回到文件列表
     */
    public goBack() {
        if (this.isMobileView && this.isSmallScreen) {
            if (!this.showingSidebar) {
                // 如果当前显示卡片内容，返回到分组列表
                this.showingSidebar = true;
                this.render();
            }
        }
    }
    
    /**
     * 渲染主界面
     */
    public render() {
        if (!this.component.canStudy()) {
            return;
        }
        
        const container = this.component.getContainer();
        container.empty();
        this.markdownRenderer.dispose();
        container.addClass('flashcard-mode');

        this.applyResponsiveClasses(container);
        this.renderProgress(container);

        const mainContainer = container.createDiv({ cls: "flashcard-main-container" });
        const sidebar = mainContainer.createDiv({ cls: "flashcard-sidebar" });
        this.groupListRenderer.render(sidebar, container, {
            isMobileView: this.isMobileView,
            onGroupSelected: () => {
                this.showingSidebar = false;
            },
            rerender: () => this.render()
        });

        const contentArea = mainContainer.createDiv({ cls: "flashcard-content-area" });
        const back = contentArea.createEl('button', { cls: 'flashcard-back-to-groups', text: t('Groups') });
        back.addEventListener('click', () => this.showSidebar());
        const cardContainer = contentArea.createDiv({ cls: "flashcard-container" });

        if (!this.emptyStateRenderer.render(cardContainer)) {
            this.cardRenderer.render(cardContainer, this.getCurrentCard());
        }
        this.renderUndo(cardContainer);
    }

    private applyResponsiveClasses(container: HTMLElement): void {
        this.isSmallScreen = container.clientWidth > 0 && container.clientWidth < 768;
        this.isMobileView = Platform.isMobile || this.isSmallScreen;
        container.classList.toggle('is-mobile', this.isMobileView);
        container.classList.toggle('is-small-screen', this.isSmallScreen);
        container.classList.toggle('show-sidebar', this.showingSidebar);
        container.classList.toggle('show-content', !this.showingSidebar);
    }

    public updateLayout(): void {
        this.applyResponsiveClasses(this.component.getContainer());
    }

    public renderStudyArea(): void {
        if (!this.component.canStudy()) return;
        const container = this.component.getContainer();
        const cardContainer = container.querySelector<HTMLElement>('.flashcard-container');
        if (!cardContainer) { this.render(); return; }
        this.markdownRenderer.dispose();
        cardContainer.empty();
        if (!this.emptyStateRenderer.render(cardContainer)) {
            this.cardRenderer.render(cardContainer, this.getCurrentCard());
        }
        this.renderUndo(cardContainer);
        this.refreshStatistics();
    }

    public refreshStatistics(): void {
        const container = this.component.getContainer();
        this.component.updateProgress();
        const counter = container.querySelector('.flashcard-counter');
        if (counter) counter.textContent = `${t(this.component.getCurrentGroupId() === PAUSED_CARDS_GROUP ? 'Paused cards' : 'Remaining')}: ${this.component.getCards().length}`;
        const sidebar = container.querySelector<HTMLElement>('.flashcard-sidebar');
        if (sidebar) this.groupListRenderer.refreshStats(sidebar);
    }

    private renderUndo(container: HTMLElement): void {
        if (!this.component.getFsrsManager().canUndoReview()) return;
        const actions = container.querySelector<HTMLElement>('.flashcard-study-actions') || container.createDiv({ cls: 'flashcard-study-actions' });
        const button = actions.createEl('button', { text: t('Undo last rating'), cls: 'flashcard-undo' });
        button.addEventListener('click', () => this.component.undoReview());
    }

    private renderProgress(container: HTMLElement): void {
        const progressContainer = container.createDiv({ cls: "flashcard-progress-container" });
        this.component.setProgressContainer(progressContainer);
        this.component.updateProgress();
    }

    private getCurrentCard(): FlashcardState | null {
        const cards = this.component.getCards();
        const currentIndex = this.component.getCurrentIndex();
        return cards.length > 0 && currentIndex < cards.length ? cards[currentIndex] : null;
    }
}

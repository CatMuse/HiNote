import { Platform } from "obsidian";
import type { FlashcardState } from "../types/FSRSTypes";
import type { FlashcardComponentContext } from "./FlashcardComponentContext";
import {
    FlashcardActivationRenderer,
    FlashcardMarkdownRenderer,
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
    private activationRenderer: FlashcardActivationRenderer;
    private markdownRenderer: FlashcardMarkdownRenderer;
    private emptyStateRenderer: FlashcardEmptyStateRenderer;
    private cardRenderer: FlashcardCardRenderer;
    
    constructor(component: FlashcardComponentContext) {
        this.component = component;
        this.activationRenderer = new FlashcardActivationRenderer(component, () => { void component.activate(); });
        this.markdownRenderer = new FlashcardMarkdownRenderer(component);
        this.emptyStateRenderer = new FlashcardEmptyStateRenderer(component);
        this.cardRenderer = new FlashcardCardRenderer(component, this.markdownRenderer);
        this.isSmallScreen = component.getContainer().clientWidth < 768;
        this.isMobileView = Platform.isMobile || this.isSmallScreen;
    }
    
    /**
     * 渲染激活界面
     */
    public renderActivation() {
        this.dispose();
        this.activationRenderer.render();
    }

    public dispose(): void { this.markdownRenderer.dispose(); this.cardRenderer.dispose(); }

    public prepareToLeave(): Promise<boolean> { return this.cardRenderer.prepareToLeave(); }
    
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
        const contentArea = mainContainer.createDiv({ cls: "flashcard-content-area" });
        const cardContainer = contentArea.createDiv({ cls: "flashcard-container" });

        if (!this.emptyStateRenderer.render(cardContainer)) {
            this.cardRenderer.render(cardContainer, this.getCurrentCard());
        }
        if (!this.component.getCards().length) this.cardRenderer.renderActions(cardContainer);
    }

    private applyResponsiveClasses(container: HTMLElement): void {
        this.isSmallScreen = container.clientWidth > 0 && container.clientWidth < 768;
        this.isMobileView = Platform.isMobile || this.isSmallScreen;
        container.classList.toggle('is-mobile', this.isMobileView);
        container.classList.toggle('is-small-screen', this.isSmallScreen);
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
        if (!this.component.getCards().length) this.cardRenderer.renderActions(cardContainer);
        this.refreshStatistics();
    }

    public renderCardFlip(): void {
        if (!this.component.canStudy()) return;
        const container = this.component.getContainer().querySelector<HTMLElement>('.flashcard-container');
        if (!container || !this.cardRenderer.updateFace(container, this.getCurrentCard())) this.renderStudyArea();
    }

    public refreshStatistics(): void {
        this.component.updateProgress();
    }

    private renderProgress(container: HTMLElement): void {
        const current = this.component.getProgressContainer();
        const progressContainer = current?.isConnected
            ? current
            : container.createDiv({ cls: "flashcard-progress-container" });
        if (progressContainer !== current) this.component.setProgressContainer(progressContainer);
        this.component.updateProgress();
    }

    private getCurrentCard(): FlashcardState | null {
        const cards = this.component.getCards();
        const currentIndex = this.component.getCurrentIndex();
        return cards.length > 0 && currentIndex < cards.length ? cards[currentIndex] : null;
    }
}

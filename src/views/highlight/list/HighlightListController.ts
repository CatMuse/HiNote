import { App, Notice, TFile } from "obsidian";
import { t } from "../../../i18n";
import { HighlightInfo } from "../../../types/highlight";
import { ViewState } from "../../hinote/ViewState";
import { HighlightRenderManager } from "../rendering";
import { FlashcardViewManager } from "../flashcards";
import { InfiniteScrollManager } from "./InfiniteScrollManager";
import { GlobalHighlightService, HighlightDataService } from "../../../services/highlight";
import { VirtualHighlightManager } from "../virtual";
import { CanvasHighlightProcessor } from "../canvas";
import { SearchUIManager } from "../../managers";
import { SelectionManager } from "../../selection";

interface HighlightListControllerOptions {
    app: App;
    state: ViewState;
    highlightContainer: HTMLElement;
    loadingIndicator: HTMLElement;
    getSearchInput: () => HTMLInputElement | null;
    getSearchUIManager: () => SearchUIManager | null;
    getHighlightRenderManager: () => HighlightRenderManager | null;
    getFlashcardViewManager: () => FlashcardViewManager | null;
    getInfiniteScrollManager: () => InfiniteScrollManager | null;
    getGlobalHighlightService: () => GlobalHighlightService | null;
    getHighlightDataService: () => HighlightDataService | null;
    getVirtualHighlightManager: () => VirtualHighlightManager | null;
    getCanvasProcessor: () => CanvasHighlightProcessor | null;
    getSelectionManager: () => SelectionManager | null;
}

export class HighlightListController {
    constructor(private options: HighlightListControllerOptions) {}

    renderHighlights(highlightsToRender: HighlightInfo[], append = false): void {
        const highlightRenderManager = this.options.getHighlightRenderManager();
        const flashcardViewManager = this.options.getFlashcardViewManager();
        if (!highlightRenderManager || !flashcardViewManager) return;

        highlightRenderManager.updateState({
            currentFile: this.options.state.currentFile,
            isDraggedToMainView: this.options.state.isDraggedToMainView,
            highlightsWithFlashcards: flashcardViewManager.getFlashcardMarkers(),
            currentBatch: this.options.getInfiniteScrollManager()?.getCurrentBatch() || 0
        });
        highlightRenderManager.renderHighlights(
            highlightsToRender,
            append,
            this.options.getSelectionManager() ?? undefined
        );

        const infiniteScrollManager = this.options.getInfiniteScrollManager();
        if (infiniteScrollManager) {
            infiniteScrollManager.setCurrentBatch(highlightRenderManager.getCurrentBatch());
        }
    }

    async updateAllHighlights(searchTerm: string = '', searchType: string = ''): Promise<void> {
        const infiniteScrollManager = this.options.getInfiniteScrollManager();
        if (infiniteScrollManager) {
            infiniteScrollManager.reset();
        }

        this.options.state.highlights = [];
        this.showLoading();

        try {
            const globalHighlightService = this.options.getGlobalHighlightService();
            if (globalHighlightService) {
                this.options.state.highlights = await globalHighlightService.updateAllHighlights(searchTerm, searchType);
            }

            await this.renderHighlightsPaginated(this.options.state.highlights);
        } catch (error) {
            console.error('[HiNoteView] Error in updateAllHighlights:', error);
            new Notice(t("Error loading all highlights"));
            this.options.highlightContainer.empty();
            this.options.highlightContainer.createDiv({
                cls: "highlight-empty-state",
                text: t("Error loading highlights. Please try again.")
            });
        } finally {
            this.options.loadingIndicator.removeClass('highlight-display-block');
        }
    }

    async refreshView(): Promise<void> {
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
        } else {
            await this.updateHighlights();
        }
    }

    async handleSearch(searchTerm: string, searchType: string): Promise<void> {
        const searchUIManager = this.options.getSearchUIManager();
        if (!searchUIManager) return;

        try {
            const wasGlobalSearch = this.options.state.highlights.some(h => h.isGlobalSearch);

            if (searchTerm === '' && searchType === '') {
                if (wasGlobalSearch && this.options.state.currentFile) {
                    await this.updateHighlights(false, false);
                }

                this.options.state.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                await this.renderSearchResults(this.options.state.highlights);
                return;
            }

            if (wasGlobalSearch && searchType !== 'all' && searchType !== 'path' && this.options.state.currentFile) {
                this.showLoading();
                await this.updateHighlights(false, false);

                this.options.state.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });

                const filteredHighlights = searchUIManager.filterHighlightsByTerm(searchTerm, searchType);
                await this.renderSearchResults(filteredHighlights);
                return;
            }

            if ((searchType === 'all' || searchType === 'path') && this.options.state.currentFile !== null) {
                this.showLoading();
                const originalFile = this.options.state.currentFile;

                try {
                    this.options.state.currentFile = null;
                    await this.updateAllHighlights(searchTerm, searchType);
                    this.options.state.highlights.forEach(highlight => {
                        highlight.isGlobalSearch = true;
                    });
                } finally {
                    this.options.state.currentFile = originalFile;
                }
            } else {
                this.options.state.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });

                const filteredHighlights = searchUIManager.filterHighlightsByTerm(searchTerm, searchType);
                await this.renderSearchResults(filteredHighlights);
            }
        } catch (error) {
            console.error('[高亮搜索] 搜索过程中出错:', error);
        }
    }

    async updateHighlights(isInCanvas: boolean = false, render: boolean = true): Promise<void> {
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
            return;
        }

        if (!this.options.state.currentFile) {
            if (render) {
                this.renderHighlights([]);
            }
            return;
        }

        if (this.options.state.currentFile.extension === 'canvas') {
            await this.handleCanvasFile(this.options.state.currentFile, render);
            return;
        }

        if (this.options.state.currentFile.extension === 'md') {
            const highlightDataService = this.options.getHighlightDataService();
            this.options.state.highlights = highlightDataService
                ? await highlightDataService.loadFileHighlights(this.options.state.currentFile)
                : [];
        } else {
            this.options.state.highlights = [];
        }

        const virtualHighlightManager = this.options.getVirtualHighlightManager();
        if (virtualHighlightManager && this.options.state.currentFile) {
            const virtualHighlights = await virtualHighlightManager.filterVirtualHighlights(
                this.options.state.currentFile,
                this.options.state.highlights
            );
            this.options.state.highlights.unshift(...virtualHighlights);
        }

        if (isInCanvas && this.options.state.currentFile) {
            this.options.state.highlights.forEach(highlight => {
                highlight.isFromCanvas = true;
                highlight.isGlobalSearch = true;
                highlight.fileName = this.options.state.currentFile?.name;
            });
        }

        this.options.getFlashcardViewManager()?.updateFlashcardMarkers(this.options.state.highlights);
        if (render) {
            this.renderWithCurrentSearch();
        }
    }

    isInAllHighlightsView(): boolean {
        return this.options.state.currentFile === null;
    }

    private async renderSearchResults(highlights: HighlightInfo[]): Promise<void> {
        await this.renderHighlightsPaginated(highlights);
    }

    private async renderHighlightsPaginated(highlights: HighlightInfo[]): Promise<void> {
        const infiniteScrollManager = this.options.getInfiniteScrollManager();
        if (!infiniteScrollManager) {
            this.renderHighlights(highlights);
            return;
        }

        infiniteScrollManager.reset();

        if (highlights.length === 0) {
            this.renderHighlights([]);
            return;
        }

        this.showLoading();

        await infiniteScrollManager.loadMoreHighlights(
            highlights,
            async (batch, append) => this.renderHighlights(batch, append),
            false
        );

        await infiniteScrollManager.loadUntilScrollable(
            highlights,
            async (batch, append) => this.renderHighlights(batch, append)
        );

        infiniteScrollManager.setupInfiniteScroll(
            highlights,
            async (batch, append) => this.renderHighlights(batch, append)
        );
    }

    private async handleCanvasFile(file: TFile, render: boolean = true): Promise<void> {
        const canvasProcessor = this.options.getCanvasProcessor();
        if (!canvasProcessor) return;

        this.options.state.highlights = await canvasProcessor.processCanvasFile(file);
        if (render) {
            this.renderHighlights(this.options.state.highlights);
        }
    }

    renderWithCurrentSearch(): void {
        const searchInput = this.options.getSearchInput();
        const searchUIManager = this.options.getSearchUIManager();
        if (searchInput && searchInput.value.trim() !== '' && searchUIManager) {
            const searchValue = searchInput.value.toLowerCase().trim();
            const filteredHighlights = searchUIManager.filterHighlightsByTerm(searchValue, '');
            this.renderHighlights(filteredHighlights);
        } else {
            this.renderHighlights(this.options.state.highlights);
        }
    }

    private showLoading(): void {
        this.options.highlightContainer.empty();
        this.options.highlightContainer.appendChild(this.options.loadingIndicator);
    }
}

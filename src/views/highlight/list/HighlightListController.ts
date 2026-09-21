import { refreshHighlightMetadata } from './HighlightMetadataRefresh';
import { App } from 'obsidian';
import { t } from '../../../i18n';
import { isFileComment, type HighlightInfo } from '../../../types/highlight';
import { ViewState } from '../../hinote/ViewState';
import type { HighlightRenderManager } from '../rendering';
import type { HighlightFlashcardMarkers } from '../flashcards';
import type { InfiniteScrollManager } from './InfiniteScrollManager';
import type { GlobalHighlightService, HighlightDataService } from '../../../services/highlight';
import type { CanvasHighlightProcessor } from '../canvas';
import type { SearchUIManager } from '../../managers';
import type { SelectionManager } from '../../selection';

interface HighlightListControllerOptions {
    app: App;
    state: ViewState;
    highlightContainer: HTMLElement;
    loadingIndicator: HTMLElement;
    getSearchInput: () => HTMLInputElement | null;
    getSearchUIManager: () => SearchUIManager | null;
    getHighlightRenderManager: () => HighlightRenderManager | null;
    getHighlightFlashcardMarkers: () => HighlightFlashcardMarkers | null;
    getInfiniteScrollManager: () => InfiniteScrollManager | null;
    getGlobalHighlightService: () => GlobalHighlightService | null;
    getHighlightDataService: () => HighlightDataService | null;
    getCanvasProcessor: () => CanvasHighlightProcessor | null;
    getSelectionManager: () => SelectionManager | null;
    beforeReplace?: () => void;
}

/** All file, vault, canvas and search results share one request lifetime. */
export class HighlightListController {
    private loadedScope: string | null = null;
    private renderedQuery: string | null = null;
    constructor(private options: HighlightListControllerOptions) {}

    cancelPending(): void {
        this.loadedScope = null;
        this.options.state.invalidate();
        this.options.getInfiniteScrollManager()?.reset();
        this.options.beforeReplace?.();
        this.options.getSelectionManager()?.clearSelection();
        this.options.getSearchUIManager()?.cancelScheduledSearch();
        this.options.getHighlightRenderManager()?.clear();
    }
    renderHighlights(rows: HighlightInfo[], append = false): void {
        const { state } = this.options;
        if (state.disposed) return;
        if (!append) this.options.beforeReplace?.();
        const renderer = this.options.getHighlightRenderManager();
        if (!renderer) return;
        const showFileCommentSection = state.page.kind === 'file';
        const visibleFileComments = showFileCommentSection
            ? this.getVisibleRows().filter(isFileComment)
            : [];
        const visibleFileCommentIds = new Set(visibleFileComments.map(comment => comment.id));
        const openDrafts = showFileCommentSection
            ? state.highlights.filter(comment => isFileComment(comment) && comment.isDraft && !visibleFileCommentIds.has(comment.id))
            : [];
        renderer.updateState({
            currentFile: state.currentFile,
            isDraggedToMainView: state.isDraggedToMainView,
            highlightsWithFlashcards: this.options.getHighlightFlashcardMarkers()?.getFlashcardMarkers(),
            currentBatch: this.options.getInfiniteScrollManager()?.getCurrentBatch() || 0,
            showFileCommentSection,
            fileComments: [...openDrafts, ...visibleFileComments]
        });
        renderer.renderHighlights(rows, append, this.options.getSelectionManager() ?? undefined);
        this.options.getInfiniteScrollManager()?.setCurrentBatch(renderer.getCurrentBatch());
    }
    async updateAllHighlights(): Promise<void> { await this.refreshView(); }
    async updateHighlights(_isInCanvas = false, render = true): Promise<void> { await this.refreshView(render); }
    async handleSearch(_term: string): Promise<void> {
        this.options.state.setSearch(this.options.getSearchInput()?.value || '');
        await this.refreshView(true, true);
    }
    isInAllHighlightsView(): boolean { return this.options.state.isInAllHighlightsView(); }

    async refreshView(render = true, reuse = false, preserveCards = false): Promise<void> {
        const { state } = this.options;
        if (state.disposed) return;
        state.setSearch(this.options.getSearchInput()?.value || '');
        const page = state.page;
        const query = state.search;
        const scope = page.kind === 'favorites' ? 'favorites' : page.kind === 'all' ? 'vault' : 'file' in page ? `${page.kind}:${page.file.path}` : page.kind;
        const token = state.beginRequest();
        const current = () => state.isCurrent(token);
        const canPatch = preserveCards && render && this.loadedScope === scope && this.renderedQuery === query.raw;
        if (!canPatch) {
            this.options.getInfiniteScrollManager()?.reset();
            this.options.beforeReplace?.();
            this.options.getSelectionManager()?.clearSelection();
            if (render) this.showLoading();
        }
        try {
            let rows: HighlightInfo[] = [];
            if (reuse && this.loadedScope === scope) { rows = state.highlights; }
            else if (page.kind === 'favorites') {
                rows = await this.options.getHighlightDataService()?.loadFavoriteHighlights() || [];
            } else if (page.kind === 'all') {
                // Load the underlying scope; filters never replace the selected page.
                rows = await this.options.getGlobalHighlightService()?.updateAllHighlights() || [];
            } else if ('file' in page) {
                if (page.kind === 'canvas') {
                    rows = await this.options.getCanvasProcessor()?.processCanvasFile(page.file) || [];
                } else {
                    rows = await this.options.getHighlightDataService()?.loadFileHighlights(page.file) || [];
                }
            }
            if (!current()) return;
            this.loadedScope = scope;
            const next = rows.map(row => ({ ...row,
                isGlobalSearch: page.kind === 'all' || page.kind === 'favorites' || !!row.isFromCanvas }));
            if (canPatch && refreshHighlightMetadata(state.highlights, next)) {
                this.options.getHighlightRenderManager()?.refreshCardMetadata();
                const filtered = this.getVisibleRows();
                const scroll = this.options.getInfiniteScrollManager();
                if (scroll) {
                    const batch = scroll.getCurrentBatch();
                    scroll.reset();
                    scroll.setCurrentBatch(batch);
                    scroll.setupInfiniteScroll(filtered, async (items, append) => {
                        if (current()) this.renderHighlights(items, append);
                    }, current);
                }
                state.finishRequest(token);
                return;
            }
            if (canPatch) {
                this.options.getInfiniteScrollManager()?.reset();
                this.options.beforeReplace?.();
                this.options.getSelectionManager()?.clearSelection();
            }
            state.highlights = next;
            this.options.getHighlightFlashcardMarkers()?.updateFlashcardMarkers(state.highlights);
            const filtered = this.getVisibleRows();
            if (render) {
                await this.renderPaginated(filtered, current);
                if (current()) this.renderedQuery = query.raw;
            }
            state.finishRequest(token);
        } catch (error) {
            if (!current()) return;
            this.loadedScope = null;
            state.highlights = [];
            state.finishRequest(token, true);
            console.error('[HiNote] Could not load current view:', error);
            this.options.highlightContainer.empty();
            this.options.highlightContainer.createDiv({ cls: 'highlight-empty-state', text: t('Error loading highlights. Please try again.') });
        } finally {
            if (current()) this.options.loadingIndicator.addClass('highlight-display-none');
        }
    }

    async renderWithCurrentSearch(): Promise<void> {
        // Reuse the loaded rows, but go through the normal refresh path so the
        // previous sentinel/batch is reset before the first page is rendered.
        // Rendering every row directly while leaving the old observer alive
        // lets that observer append page one again, producing duplicate cards.
        await this.refreshView(true, true);
    }
    private getVisibleRows(): HighlightInfo[] {
        const { state } = this.options;
        const filtered = this.options.getSearchUIManager()?.filterHighlightsByTerm(state.search.term) || state.highlights;
        return [...filtered].sort((left, right) => this.compareHighlights(left, right));
    }
    private compareHighlights(left: HighlightInfo, right: HighlightInfo): number {
        const sort = this.options.state.sort;
        if (sort === 'updated-desc' || sort === 'updated-asc') {
            const leftTime = left.updatedAt ?? left.createdAt ?? 0;
            const rightTime = right.updatedAt ?? right.createdAt ?? 0;
            const difference = leftTime - rightTime;
            if (difference !== 0) return sort === 'updated-desc' ? -difference : difference;
        }
        const pathDifference = (left.filePath || '').localeCompare(right.filePath || '');
        if (pathDifference !== 0) return pathDifference;
        if (isFileComment(left) !== isFileComment(right)) return isFileComment(left) ? -1 : 1;
        const positionDifference = (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
        if (positionDifference !== 0) return positionDifference;
        return (left.id || '').localeCompare(right.id || '');
    }
    private async renderPaginated(rows: HighlightInfo[], current: () => boolean): Promise<void> {
        if (!rows.length && this.options.state.page.kind === 'favorites') {
            if (current()) {
                this.options.getHighlightRenderManager()?.clear();
                this.options.highlightContainer.empty();
                this.options.highlightContainer.createDiv({ cls: 'highlight-empty-state', text: t(
                    this.options.state.search.raw ? 'No matching favorites.' : 'No favorites yet. Select the star on a highlight card to save it here.'
                ) });
            }
            return;
        }
        const scroll = this.options.getInfiniteScrollManager();
        const render = async (batch: HighlightInfo[], append: boolean) => { if (current()) this.renderHighlights(batch, append); };
        if (!scroll || !rows.length) { if (current()) this.renderHighlights(rows); return; }
        await scroll.loadMoreHighlights(rows, render, false, current);
        if (!current()) return;
        await scroll.loadUntilScrollable(rows, render, current);
        if (current()) scroll.setupInfiniteScroll(rows, render, current);
    }
    private showLoading(): void {
        this.options.getHighlightRenderManager()?.clear();
        this.options.highlightContainer.empty();
        this.options.highlightContainer.appendChild(this.options.loadingIndicator);
        this.options.loadingIndicator.removeClass('highlight-display-none');
    }
}

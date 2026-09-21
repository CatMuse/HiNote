import type { SearchComponent, TFile } from 'obsidian';
import type { HighlightInfo } from '../../types/highlight';
import type CommentPlugin from '../../../main';
import { SearchService } from '../../services/search';
import type { ViewState } from '../hinote/ViewState';

export class SearchUIManager {
    private timer: number | null = null;
    private version = 0;
    private disposed = false;
    private service: SearchService;
    private onSearch: (term: string) => Promise<void>;
    private getHighlights: () => HighlightInfo[];
    private getFile: () => TFile | null;
    private input = () => {
        if (this.disposed) return;
        this.cancelScheduledSearch();
        // Invalidate in-flight results now, not 200ms later when debounce fires.
        this.state.setSearch(this.searchInput.value);
        this.timer = window.setTimeout(() => { this.timer = null; void this.performSearch(); }, 200);
    };
    constructor(plugin: CommentPlugin, private searchComponent: SearchComponent, private indicator: HTMLElement, private state: ViewState) {
        this.service = new SearchService(plugin);
    }
    private get searchInput(): HTMLInputElement { return this.searchComponent.inputEl; }
    setCallbacks(onSearch: (term: string) => Promise<void>, getHighlights: () => HighlightInfo[], getFile: () => TFile | null): void {
        this.onSearch = onSearch; this.getHighlights = getHighlights; this.getFile = getFile;
    }
    initialize(): void { this.searchComponent.onChange(this.input); }
    cancelScheduledSearch(): void {
        this.version++;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        this.setLoading(false);
    }
    destroy(): void {
        this.disposed = true; this.cancelScheduledSearch();
    }
    private async performSearch(): Promise<void> {
        if (this.disposed) return;
        const version = ++this.version;
        this.state.setSearch(this.searchInput.value);
        this.setLoading(true);
        try { await this.onSearch?.(this.state.search.term); }
        catch (error) { if (!this.disposed) console.error('[HiNote] Search failed:', error); }
        finally { if (!this.disposed && version === this.version) this.setLoading(false); }
    }
    filterHighlightsByTerm(term: string): HighlightInfo[] {
        return this.service.filterHighlights(this.getHighlights(), term, this.state.cardType, this.getFile());
    }
    private setLoading(loading: boolean): void {
        this.searchInput.toggleClass('is-searching', loading);
        this.indicator.toggleClass('highlight-display-none', !loading);
        this.indicator.toggleClass('highlight-display-flex', loading);
    }
    getSearchValue(): string { return this.searchInput.value.trim(); }
    hasSearchTerm(): boolean { return !!this.getSearchValue(); }
}

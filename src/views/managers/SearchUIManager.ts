import type { TFile } from 'obsidian';
import type { HighlightInfo } from '../../types/highlight';
import type CommentPlugin from '../../../main';
import { SearchUIHelper } from './SearchUIHelper';
import { SearchService } from '../../services/search';
import type { ViewState } from '../hinote/ViewState';

export class SearchUIManager {
    private timer: number | null = null;
    private version = 0;
    private disposed = false;
    private uiHelper: SearchUIHelper;
    private service: SearchService;
    private onSearch: (term: string, type: string) => Promise<void>;
    private getHighlights: () => HighlightInfo[];
    private getFile: () => TFile | null;
    private focus = () => this.uiHelper.showSearchPrefixHints();
    private input = () => {
        if (this.disposed) return;
        this.cancelScheduledSearch();
        // Invalidate in-flight results now, not 200ms later when debounce fires.
        this.state.setSearch(this.searchInput.value);
        this.timer = window.setTimeout(() => { this.timer = null; void this.performSearch(); }, this.state.search.scope === 'vault' ? 500 : 200);
    };
    constructor(plugin: CommentPlugin, private searchInput: HTMLInputElement, private indicator: HTMLElement, private state: ViewState) {
        this.uiHelper = new SearchUIHelper(searchInput);
        this.service = new SearchService(plugin);
    }
    setCallbacks(onSearch: (term: string, type: string) => Promise<void>, getHighlights: () => HighlightInfo[], getFile: () => TFile | null): void {
        this.onSearch = onSearch; this.getHighlights = getHighlights; this.getFile = getFile;
    }
    initialize(): void { this.searchInput.addEventListener('focus', this.focus); this.searchInput.addEventListener('input', this.input); }
    cancelScheduledSearch(): void {
        this.version++;
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        this.setLoading(false);
    }
    destroy(): void {
        this.disposed = true; this.cancelScheduledSearch(); this.uiHelper.destroy();
        this.searchInput.removeEventListener('focus', this.focus);
        this.searchInput.removeEventListener('input', this.input);
    }
    private async performSearch(): Promise<void> {
        if (this.disposed || this.state.isFlashcardMode) return;
        const version = ++this.version;
        this.state.setSearch(this.searchInput.value);
        this.setLoading(true);
        try { await this.onSearch?.(this.state.search.term, this.state.search.type); }
        catch (error) { if (!this.disposed) console.error('[HiNote] Search failed:', error); }
        finally { if (!this.disposed && version === this.version) this.setLoading(false); }
    }
    filterHighlightsByTerm(term: string, type = ''): HighlightInfo[] {
        return this.service.filterHighlights(this.getHighlights(), term, type, this.state.search.scope === 'vault' ? null : this.getFile());
    }
    private setLoading(loading: boolean): void {
        this.searchInput.toggleClass('is-searching', loading);
        this.indicator.toggleClass('highlight-display-none', !loading);
        this.indicator.toggleClass('highlight-display-flex', loading);
    }
    getSearchValue(): string { return this.searchInput.value.trim(); }
    hasSearchTerm(): boolean { return !!this.getSearchValue(); }
}

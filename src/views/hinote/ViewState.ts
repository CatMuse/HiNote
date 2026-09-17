import type { TFile } from 'obsidian';
import type { HighlightInfo } from '../../types/highlight';
import { parseHighlightQuery, type HighlightQuery } from '../../services/search/HighlightQuery';

export type HiNotePage = { kind: 'empty' | 'all' | 'hicard' } | { kind: 'file' | 'canvas'; file: TFile };
export interface ViewSession {
    page: HiNotePage;
    mainPage: HiNotePage | null;
    search: string;
    drafts: Map<string, string>;
}

/** One instance per view. Layout/selection managers read this state, not copies. */
export class ViewState {
    private pageValue: HiNotePage = { kind: 'empty' };
    private placementValue: 'sidebar' | 'main' = 'sidebar';
    private queryValue: HighlightQuery = parseHighlightQuery('');
    highlights: HighlightInfo[] = [];
    isMobileView = false;
    isSmallScreen = false;
    navigationOpen = false;
    loading: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
    readonly drafts = new Map<string, string>();
    mainPage: HiNotePage | null = null;
    private revision = 0;
    private closed = false;
    private listeners = new Set<() => void>();

    get page(): HiNotePage { return this.pageValue; }
    get placement(): 'sidebar' | 'main' { return this.placementValue; }
    get search(): HighlightQuery { return this.queryValue; }
    get currentFile(): TFile | null { return 'file' in this.page ? this.page.file : null; }
    get isFlashcardMode(): boolean { return this.page.kind === 'hicard'; }
    get isDraggedToMainView(): boolean { return this.placementValue === 'main'; }
    get isShowingFileList(): boolean { return this.navigationOpen; }
    get disposed(): boolean { return this.closed; }
    isInAllHighlightsView(): boolean { return this.page.kind === 'all'; }

    static filePage(file: TFile | null): HiNotePage {
        if (!file) return { kind: 'empty' };
        return file.extension === 'md' ? { kind: 'file', file } :
            file.extension === 'canvas' ? { kind: 'canvas', file } : { kind: 'empty' };
    }
    navigate(page: HiNotePage): void {
        this.invalidate();
        this.pageValue = page;
        if (this.placementValue === 'main') this.mainPage = page;
        this.navigationOpen = false;
        this.highlights = [];
        this.notify();
    }
    setSearch(raw: string): void {
        if (this.search.raw === raw) return;
        this.invalidate();
        this.queryValue = parseHighlightQuery(raw);
        this.notify();
    }
    setPlacement(placement: 'sidebar' | 'main'): void {
        if (this.placementValue === placement) return;
        if (this.placementValue === 'main') this.mainPage = this.page;
        this.placementValue = placement;
        this.invalidate();
        this.notify();
    }
    setViewport(mobile: boolean, narrow: boolean): void {
        this.isMobileView = mobile;
        this.isSmallScreen = narrow;
        this.notify();
    }
    setNavigationOpen(open: boolean): void { this.navigationOpen = open; this.notify(); }
    invalidate(): void { this.revision++; this.loading = 'idle'; }
    beginRequest(): number { this.revision++; this.loading = 'loading'; this.notify(); return this.revision; }
    isCurrent(token: number): boolean { return !this.closed && token === this.revision; }
    finishRequest(token: number, failed = false): void {
        if (!this.isCurrent(token)) return;
        this.loading = failed ? 'error' : 'ready'; this.notify();
    }
    subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    notify(): void { if (!this.closed) this.listeners.forEach(listener => listener()); }
    dispose(): void { this.closed = true; this.invalidate(); this.listeners.clear(); }
    resetHighlights(): void { this.highlights = []; }
    snapshot(): ViewSession { return { page: this.page, mainPage: this.mainPage, search: this.search.raw, drafts: new Map(this.drafts) }; }
    restore(session: ViewSession): void {
        this.pageValue = session.page; this.mainPage = session.mainPage;
        this.queryValue = parseHighlightQuery(session.search);
        session.drafts.forEach((value, key) => this.drafts.set(key, value));
        this.invalidate(); this.notify();
    }
}

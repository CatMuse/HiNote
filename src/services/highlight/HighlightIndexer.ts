import { App, TFile } from 'obsidian';
import type { ScannedHighlight } from '../../types/highlight';
import { HighlightExtractor } from './HighlightExtractor';
import { HighlightIndexStore } from './HighlightIndexStore';
import { HighlightIndexFileWatcher } from './HighlightIndexFileWatcher';
import { ObsidianInternals } from '../../utils/ObsidianInternals';

/** Shared, versioned index. Every read also checks the current exclusion rules. */
export class HighlightIndexer {
    private indexStore = new HighlightIndexStore();
    private fileWatcher: HighlightIndexFileWatcher;
    private buildPromise: Promise<void> | null = null;
    private indexBuildTimer: number | null = null;
    private generation = 0;
    private disposed = false;
    private fileVersions = new Map<string, number>();

    constructor(private app: App, private extractor: HighlightExtractor) {
        this.fileWatcher = new HighlightIndexFileWatcher({
            app, extractor,
            updateFileInIndex: file => { void this.updateFileInIndex(file).catch(error => this.report(error)); },
            removeFileFromIndex: path => this.removeFileFromIndex(path)
        });
    }
    async initialize(): Promise<void> {
        this.fileWatcher.register();
        this.scheduleBuild(ObsidianInternals.isMobile(this.app) ? 10000 : 3000);
    }
    invalidateExclusions(): void {
        if (this.disposed) return;
        this.generation++;
        this.indexStore.reset();
        // Coalesce textarea edits. An explicit reader can request the build sooner.
        this.scheduleBuild(300);
    }
    destroy(): void {
        this.disposed = true;
        this.generation++;
        this.fileWatcher.unregister();
        this.cancelScheduledBuild();
        this.indexStore.reset();
        this.fileVersions.clear();
        this.extractor.clearContentCache();
    }
    private cancelScheduledBuild(): void {
        if (this.indexBuildTimer !== null) window.clearTimeout(this.indexBuildTimer);
        this.indexBuildTimer = null;
    }
    private scheduleBuild(delay: number): void {
        this.cancelScheduledBuild();
        this.indexBuildTimer = window.setTimeout(() => {
            this.indexBuildTimer = null;
            void this.buildFileIndex().catch(error => this.report(error));
        }, delay);
    }
    buildFileIndex(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        this.cancelScheduledBuild();
        if (this.buildPromise) return this.buildPromise;
        const pending = this.buildLatestIndex().finally(() => {
            if (this.buildPromise === pending) this.buildPromise = null;
        });
        this.buildPromise = pending;
        return pending;
    }
    private async buildLatestIndex(): Promise<void> {
        while (!this.disposed) {
            const generation = this.generation;
            let groups: { file: TFile; highlights: ScannedHighlight[] }[];
            try { groups = await this.extractor.getAllHighlights(); }
            catch (error) {
                if (this.disposed) return;
                if (generation !== this.generation) continue;
                throw error;
            }
            if (this.disposed) return;
            if (generation !== this.generation) continue;
            const words = new Map<string, Set<string>>();
            const files = new Map<string, ScannedHighlight[]>();
            for (const { file, highlights } of groups) {
                if (!this.extractor.shouldProcessFile(file)) continue;
                files.set(file.path, highlights);
                this.indexStore.addKeywordsToIndex(this.indexStore.extractKeywordsFromHighlights(highlights), file.path, words);
            }
            this.indexStore.replace(words, files);
            return;
        }
    }
    getAllHighlightsFromCache(): ScannedHighlight[] | null {
        if (this.disposed) return null;
        if (this.indexStore.isExpired()) {
            if (this.indexBuildTimer === null) void this.buildFileIndex().catch(error => this.report(error));
            return null;
        }
        // An empty, completed index is still valid and must not trigger a rescan.
        return this.allowedHighlights();
    }
    async getAllHighlights(): Promise<{ file: TFile; highlights: ScannedHighlight[] }[]> {
        if (this.indexStore.isExpired()) await this.buildFileIndex();
        if (this.disposed) return [];
        const groups: { file: TFile; highlights: ScannedHighlight[] }[] = [];
        for (const [path, highlights] of this.indexStore.fileToHighlights) {
            const file = this.allowedFile(path);
            if (file) groups.push({ file, highlights });
        }
        return groups;
    }
    removeFileFromIndex(path: string): void {
        this.fileVersions.set(path, (this.fileVersions.get(path) || 0) + 1);
        if (this.buildPromise) this.generation++;
        this.indexStore.removeFile(path);
    }
    async updateFileInIndex(file: TFile): Promise<void> {
        if (this.disposed) return;
        if (this.buildPromise) {
            this.generation++;
            await this.buildPromise;
            return;
        }
        if (this.indexStore.isExpired()) { await this.buildFileIndex(); return; }
        const path = file.path;
        const generation = this.generation;
        this.removeFileFromIndex(path);
        const fileVersion = this.fileVersions.get(path);
        if (!this.extractor.shouldProcessFile(file)) return;
        const content = await this.app.vault.read(file);
        if (this.disposed || generation !== this.generation || this.fileVersions.get(path) !== fileVersion ||
            file.path !== path || !this.allowedFile(path)) return;
        const highlights = this.extractor.extractHighlights(content, file);
        if (highlights.length) this.indexStore.setFileHighlights(path, highlights);
    }
    async searchHighlightsFromIndex(term: string): Promise<ScannedHighlight[]> {
        if (this.indexStore.isExpired()) await this.buildFileIndex();
        if (this.disposed) return [];
        const terms = this.indexStore.tokenizeText(term);
        if (!terms.length) return this.allowedHighlights();
        let paths: Set<string> | null = null;
        for (const term of terms) {
            const matching = new Set<string>();
            for (const [word, files] of this.indexStore.wordToFiles) {
                if (word.includes(term)) files.forEach(file => matching.add(file));
            }
            paths = paths === null ? matching : new Set([...paths].filter(path => matching.has(path)));
        }
        const result: ScannedHighlight[] = [];
        for (const path of paths || []) {
            if (!this.allowedFile(path)) continue;
            for (const highlight of this.indexStore.fileToHighlights.get(path) || []) {
                if (terms.every(term => highlight.text.toLowerCase().includes(term))) result.push(highlight);
            }
        }
        return result;
    }
    private allowedFile(path: string): TFile | null {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile && this.extractor.shouldProcessFile(file) ? file : null;
    }
    private allowedHighlights(): ScannedHighlight[] {
        const result: ScannedHighlight[] = [];
        for (const [path, highlights] of this.indexStore.fileToHighlights) {
            if (this.allowedFile(path)) result.push(...highlights);
        }
        return result;
    }
    private report(error: unknown): void { if (!this.disposed) console.error('[HiNote] Highlight index update failed:', error); }
}

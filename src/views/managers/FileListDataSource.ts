import { TFile } from "obsidian";
import CommentPlugin from "../../../main";
import { HighlightService } from "../../services/HighlightService";

export class FileListDataSource {
    private cachedFiles: TFile[] | null = null;
    private cachedFileCounts: Map<string, number> | null = null;
    private cacheTimestamp = 0;
    private readonly cacheExpiry = 60000;
    private exclusions = '';
    private generation = 0;

    private syncExclusions(): void {
        const rules = this.plugin.settings.excludePatterns || '';
        if (rules !== this.exclusions) { this.exclusions = rules; this.invalidateCache(); }
    }

    constructor(
        private plugin: CommentPlugin,
        private highlightService: HighlightService
    ) {}

    invalidateCache(): void {
        this.generation++;
        this.cachedFiles = null;
        this.cachedFileCounts = null;
        this.cacheTimestamp = 0;
    }

    async getFilesWithHighlights(): Promise<TFile[]> {
        this.syncExclusions();
        const now = Date.now();
        const generation = this.generation;
        if (this.cachedFiles && (now - this.cacheTimestamp) < this.cacheExpiry) {
            return this.cachedFiles.filter(file => this.highlightService.shouldProcessFile(file));
        }

        const cachedHighlights = this.highlightService.getAllHighlightsFromCache();
        if (cachedHighlights !== null) {
            const filePathsSet = new Set<string>();
            const countsMap = new Map<string, number>();
            const eligibility = new Map<string, boolean>();

            for (const highlight of cachedHighlights) {
                if (!highlight.filePath) continue;
                if (!eligibility.has(highlight.filePath)) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                    eligibility.set(highlight.filePath, file instanceof TFile && this.highlightService.shouldProcessFile(file));
                }
                if (!eligibility.get(highlight.filePath)) continue;

                filePathsSet.add(highlight.filePath);
                countsMap.set(
                    highlight.filePath,
                    (countsMap.get(highlight.filePath) || 0) + 1
                );
            }

            const files: TFile[] = [];
            for (const filePath of filePathsSet) {
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    files.push(file);
                }
            }

            this.cachedFiles = files;
            this.cachedFileCounts = countsMap;
            this.cacheTimestamp = now;
            return files;
        }

        // Join the shared index build instead of starting a second vault scan.
        const groups = await this.highlightService.getAllHighlights();
        this.syncExclusions();
        if (generation !== this.generation) return this.getFilesWithHighlights();
        const files: TFile[] = [];
        const counts = new Map<string, number>();
        for (const { file, highlights } of groups) {
            if (!this.highlightService.shouldProcessFile(file) || !highlights.length) continue;
            files.push(file);
            counts.set(file.path, highlights.length);
        }
        this.cachedFiles = files;
        this.cachedFileCounts = counts;
        this.cacheTimestamp = Date.now();
        return files;
    }

    async getFileHighlightsCount(file: TFile): Promise<number> {
        this.syncExclusions();
        if (!this.highlightService.shouldProcessFile(file)) return 0;
        if (this.cachedFileCounts && this.cachedFileCounts.has(file.path)) {
            return this.cachedFileCounts.get(file.path)!;
        }

        const content = await this.plugin.app.vault.read(file);
        if (!this.highlightService.shouldProcessFile(file)) return 0;
        const count = this.highlightService.extractHighlights(content, file).length;

        if (!this.cachedFileCounts) {
            this.cachedFileCounts = new Map();
        }
        this.cachedFileCounts.set(file.path, count);

        return count;
    }

    getTotalHighlightsCount(): number {
        this.syncExclusions();
        const cachedHighlights = this.highlightService.getAllHighlightsFromCache();
        if (cachedHighlights) {
            const allowed = new Map<string, boolean>();
            return cachedHighlights.filter(highlight => {
                if (!allowed.has(highlight.filePath)) {
                    const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                    allowed.set(highlight.filePath, file instanceof TFile && this.highlightService.shouldProcessFile(file));
                }
                return allowed.get(highlight.filePath);
            }).length;
        }

        if (this.cachedFileCounts) {
            let total = 0;
            for (const [path, count] of this.cachedFileCounts) {
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile && this.highlightService.shouldProcessFile(file)) total += count;
            }
            return total;
        }

        return 0;
    }

}

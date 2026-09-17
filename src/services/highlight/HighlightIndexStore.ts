import { ScannedHighlight } from "../../types/highlight";

export interface FileHighlightIndex {
    wordToFiles: Map<string, Set<string>>;
    fileToHighlights: Map<string, ScannedHighlight[]>;
    lastUpdated: number;
}

export class HighlightIndexStore {
    private static readonly INDEX_EXPIRY_TIME = 3600000;
    private static readonly MIN_WORD_LENGTH = 2;

    private index: FileHighlightIndex = HighlightIndexStore.createEmptyIndex();

    get wordToFiles(): Map<string, Set<string>> {
        return this.index.wordToFiles;
    }

    get fileToHighlights(): Map<string, ScannedHighlight[]> {
        return this.index.fileToHighlights;
    }

    get lastUpdated(): number {
        return this.index.lastUpdated;
    }

    reset(): void {
        this.index = HighlightIndexStore.createEmptyIndex();
    }

    replace(wordToFiles: Map<string, Set<string>>, fileToHighlights: Map<string, ScannedHighlight[]>): void {
        this.index = {
            wordToFiles,
            fileToHighlights,
            lastUpdated: Date.now()
        };
    }

    ensureInitialized(): void {
        if (this.index.lastUpdated !== 0) return;

        this.index = {
            wordToFiles: new Map(),
            fileToHighlights: new Map(),
            lastUpdated: Date.now()
        };
    }

    isExpired(): boolean {
        return this.index.lastUpdated === 0 ||
            Date.now() - this.index.lastUpdated > HighlightIndexStore.INDEX_EXPIRY_TIME;
    }

    getAllHighlights(): ScannedHighlight[] {
        const allHighlights: ScannedHighlight[] = [];
        for (const highlights of this.index.fileToHighlights.values()) {
            allHighlights.push(...highlights);
        }
        return allHighlights;
    }

    tokenizeText(text: string): string[] {
        if (!text) return [];

        return text
            .toLowerCase()
            .split(/\s+/)
            .filter(word => word.length >= HighlightIndexStore.MIN_WORD_LENGTH)
            .map(word => word.replace(/[.,;:!?()[\]{}'"`~]/g, ""))
            .filter(word => word.length >= HighlightIndexStore.MIN_WORD_LENGTH);
    }

    extractKeywordsFromHighlights(highlights: ScannedHighlight[]): Set<string> {
        const keywords = new Set<string>();

        for (const highlight of highlights) {
            this.tokenizeText(highlight.text).forEach(word => keywords.add(word));


        }

        return keywords;
    }

    addKeywordsToIndex(keywords: Set<string>, filePath: string, wordToFiles: Map<string, Set<string>>): void {
        for (const word of keywords) {
            if (!wordToFiles.has(word)) {
                wordToFiles.set(word, new Set());
            }
            wordToFiles.get(word)!.add(filePath);
        }
    }

    setFileHighlights(filePath: string, highlights: ScannedHighlight[]): void {
        this.index.fileToHighlights.set(filePath, highlights);
        const keywords = this.extractKeywordsFromHighlights(highlights);
        this.addKeywordsToIndex(keywords, filePath, this.index.wordToFiles);
    }

    removeFile(filePath: string): void {
        if (this.isExpired()) {
            return;
        }

        if (!this.index.fileToHighlights.has(filePath)) {
            return;
        }

        for (const [word, files] of this.index.wordToFiles.entries()) {
            files.delete(filePath);
            if (files.size === 0) {
                this.index.wordToFiles.delete(word);
            }
        }

        this.index.fileToHighlights.delete(filePath);
    }

    private static createEmptyIndex(): FileHighlightIndex {
        return {
            wordToFiles: new Map(),
            fileToHighlights: new Map(),
            lastUpdated: 0
        };
    }
}

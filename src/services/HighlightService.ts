import { getHighlightScan } from './highlight/HighlightScan';
import { getHighlightSource } from '../models/HighlightModels';
import { HighlightColor } from './highlight/HighlightColor';
import { recolorHighlightSource } from './highlight/HighlightColorEdit';
import { App, TFile } from "obsidian";
import { HighlightInfo, ScannedHighlight } from '../types/highlight';
import { HighlightRecord as HiNote } from '../types/highlight';
import { HighlightRepository } from '../repositories/HighlightRepository';
import type { PluginSettings } from '../types/settings';
import {
    HighlightBatchOps,
    HighlightExtractor,
    HighlightIndexer,
    HighlightMatcher
} from './highlight';

/**
 * 高亮服务 - Facade 门面模式
 * 
 * 将所有高亮相关功能委托给专门的子模块：
 * - HighlightExtractor: 提取高亮文本、文件排除判断、颜色提取、文件内容缓存
 * - HighlightMatcher: 高亮与评论的匹配合并逻辑
 * - HighlightIndexer: 全局索引构建、搜索、文件事件监听
 * - HighlightBatchOps: 批量删除高亮标记
 * 
 * 所有外部调用方仍通过 HighlightService 访问，无需修改导入路径。
 */
export class HighlightService {
    private extractor: HighlightExtractor;
    private matcher: HighlightMatcher;
    private indexer: HighlightIndexer;
    private batchOps: HighlightBatchOps;

    constructor(
        private app: App,
        getSettings?: () => PluginSettings | undefined,
        private getHighlightRepository?: () => HighlightRepository | undefined
    ) {
        this.extractor = new HighlightExtractor(app, getSettings);
        this.matcher = new HighlightMatcher(getHighlightRepository);
        this.indexer = new HighlightIndexer(app, this.extractor);
        this.batchOps = new HighlightBatchOps(app, this.extractor);
    }

    async changeHighlightColor(highlight: HighlightInfo, color: HighlightColor | null): Promise<ScannedHighlight> {
        return (await this.changeFileColors([highlight], color)).get(highlight)!;
    }

    canChangeHighlightColor(highlight: HighlightInfo): boolean {
        return !highlight.sourceUnavailable && !highlight.isVirtual && !highlight.isFromCanvas && !!highlight.filePath?.endsWith('.md') &&
            ['markdown', 'html'].includes(highlight.syntax || '');
    }

    async batchChangeHighlightColors(highlights: HighlightInfo[], color: HighlightColor | null) {
        const updated = new Map<HighlightInfo, ScannedHighlight>();
        const groups = new Map<string, HighlightInfo[]>();
        let skipped = 0, failed = 0;
        for (const highlight of new Set(highlights)) {
            if (!this.canChangeHighlightColor(highlight)) { skipped++; continue; }
            const group = groups.get(highlight.filePath!) || [];
            group.push(highlight);
            groups.set(highlight.filePath!, group);
        }
        for (const group of groups.values()) {
            try {
                const changes = await this.changeFileColors(group, color);
                changes.forEach((scan, view) => updated.set(view, scan));
            } catch (error) {
                failed += group.length;
                console.error('[HiNote] Could not recolor selected highlights:', error);
            }
        }
        return { updated, skipped, failed };
    }

    private async changeFileColors(highlights: HighlightInfo[], color: HighlightColor | null): Promise<Map<HighlightInfo, ScannedHighlight>> {
        const file = this.app.vault.getAbstractFileByPath(highlights[0]?.filePath || '');
        if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('Highlight file is unavailable.');
        const edits = highlights.map(highlight => {
            const source = getHighlightSource(highlight);
            const snapshot = getHighlightScan(highlight)?.sourceContent;
            if (!this.canChangeHighlightColor(highlight) || !source || snapshot === undefined || source.filePath !== file.path) {
                throw new Error('Highlight source is unavailable. Refresh the highlights.');
            }
            return { highlight, source, snapshot, position: source.position, replacement: '' };
        }).sort((a, b) => a.source.position - b.source.position);
        const content = await this.app.vault.process(file, current => {
            let delta = 0;
            for (let i = 0; i < edits.length; i++) {
                const edit = edits[i];
                if (current !== edit.snapshot) throw new Error('Highlight source has changed. Refresh the highlights.');
                if (i && edits[i - 1].source.position + edits[i - 1].source.originalLength > edit.source.position) {
                    throw new Error('Overlapping highlight sources.');
                }
                edit.replacement = recolorHighlightSource(current.slice(edit.source.position,
                    edit.source.position + edit.source.originalLength), color);
                edit.position = edit.source.position + delta;
                delta += edit.replacement.length - edit.source.originalLength;
            }
            // Apply from the end so all offsets refer to the same original snapshot.
            for (const edit of [...edits].reverse()) {
                current = current.slice(0, edit.source.position) + edit.replacement +
                    current.slice(edit.source.position + edit.source.originalLength);
            }
            return current;
        });
        this.extractor.invalidateContentCache(file.path);
        const scanned = this.extractor.extractHighlights(content, file);
        const repository = this.getHighlightRepository?.();
        if (repository) this.matcher.mergeHighlightsWithComments(scanned, repository.getCachedHighlights(file.path) || [], file);
        const updated = new Map<HighlightInfo, ScannedHighlight>();
        for (const edit of edits) {
            const match = scanned.find(item => item.position === edit.position && item.text === edit.source.text);
            if (!match) throw new Error('Updated highlight was not found.');
            updated.set(edit.highlight, match);
        }
        return updated;
    }

    // ==================== 生命周期 ====================
    
    async initialize(): Promise<void> {
        return this.indexer.initialize();
    }
    
    destroy(): void {
        this.indexer.destroy();
    }

    invalidateExclusions(): void {
        this.indexer.invalidateExclusions();
    }

    // ==================== 提取 (委托给 HighlightExtractor) ====================
    
    shouldProcessFile(file: TFile): boolean {
        return this.extractor.shouldProcessFile(file);
    }

    extractHighlights(content: string, file: TFile): ScannedHighlight[] {
        return this.extractor.extractHighlights(content, file);
    }

    async getFilesWithHighlights(): Promise<TFile[]> {
        return this.extractor.getFilesWithHighlights();
    }

    async getAllHighlights(): Promise<{ file: TFile, highlights: ScannedHighlight[] }[]> {
        return this.indexer.getAllHighlights();
    }

    public async createBlockIdForHighlight(file: TFile, position: number, length?: number): Promise<string> {
        return this.extractor.createBlockIdForHighlight(file, position, length);
    }

    // ==================== 索引与搜索 (委托给 HighlightIndexer) ====================
    
    public getAllHighlightsFromCache(): ScannedHighlight[] | null {
        return this.indexer.getAllHighlightsFromCache();
    }

    async searchHighlightsFromIndex(searchTerm: string): Promise<ScannedHighlight[]> {
        return this.indexer.searchHighlightsFromIndex(searchTerm);
    }

    // ==================== 匹配与合并 (委托给 HighlightMatcher) ====================
    
    public findMatchingHighlight(file: TFile, highlight: HighlightInfo, highlightRepository: HighlightRepository): HiNote | null {
        return this.matcher.findMatchingHighlight(file, highlight, highlightRepository);
    }

    public mergeHighlightsWithComments(
        highlights: ScannedHighlight[],
        storedComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        return this.matcher.mergeHighlightsWithComments(highlights, storedComments, file);
    }

    // ==================== 批量操作 (委托给 HighlightBatchOps) ====================
    
    public async batchRemoveHighlightMarks(highlights: Array<{ text: string; position?: number; filePath: string; originalLength?: number }>): Promise<{ success: number; failed: number }> {
        return this.batchOps.batchRemoveHighlightMarks(highlights);
    }
}

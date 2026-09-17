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
        const source = getHighlightSource(highlight);
        const snapshot = getHighlightScan(highlight)?.sourceContent;
        const file = this.app.vault.getAbstractFileByPath(highlight.filePath || '');
        if (!(file instanceof TFile) || file.extension !== 'md' || highlight.isVirtual || highlight.isFromCanvas ||
            !source || snapshot === undefined || source.filePath !== file.path ||
            !['markdown', 'html'].includes(source.syntax || '')) {
            throw new Error('Highlight source is unavailable. Refresh the highlights.');
        }
        const content = await this.app.vault.process(file, current => {
            // Validate against the scan, not a text search: repeated text must never be guessed.
            if (current !== snapshot) throw new Error('Highlight source has changed. Refresh the highlights.');
            const end = source.position + source.originalLength;
            const replacement = recolorHighlightSource(current.slice(source.position, end), color);
            return current.slice(0, source.position) + replacement + current.slice(end);
        });
        this.extractor.invalidateContentCache(file.path);
        const scanned = this.extractor.extractHighlights(content, file);
        const updated = scanned.find(item => item.position === source.position && item.text === source.text);
        if (!updated) throw new Error('Updated highlight was not found.');
        const repository = this.getHighlightRepository?.();
        if (repository) this.matcher.mergeHighlightsWithComments(scanned, repository.getCachedHighlights(file.path) || [], file);
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

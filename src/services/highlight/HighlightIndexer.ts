import { App, TFile } from "obsidian";
import { ScannedHighlight } from '../../types/highlight';
import { HighlightExtractor } from './HighlightExtractor';
import { HighlightIndexStore } from "./HighlightIndexStore";
import { HighlightIndexFileWatcher } from "./HighlightIndexFileWatcher";
import { ObsidianInternals } from "../../utils/ObsidianInternals";

/**
 * 高亮索引器
 * 职责：
 * 1. 构建和维护全局高亮索引
 * 2. 注册文件事件监听器实现索引自动更新
 * 3. 基于索引的关键词搜索
 * 4. 索引的增量更新和过期管理
 */
export class HighlightIndexer {
    private indexStore = new HighlightIndexStore();
    private fileWatcher: HighlightIndexFileWatcher;
    
    // 是否正在构建索引
    private isIndexing: boolean = false;
    private indexBuildTimer: number | null = null;
    
    constructor(
        private app: App,
        private extractor: HighlightExtractor
    ) {
        this.fileWatcher = new HighlightIndexFileWatcher({
            app,
            extractor,
            updateFileInIndex: (file) => {
                void this.updateFileInIndex(file);
            },
            removeFileFromIndex: (filePath) => this.removeFileFromIndex(filePath)
        });
    }

    /**
     * 初始化索引器，包括构建索引和注册文件事件监听器
     */
    async initialize(): Promise<void> {
        // 注册文件事件监听器，实现索引的自动更新
        this.fileWatcher.register();
        
        // 根据设备类型调整索引构建策略
        // 移动端延迟更长时间，避免影响启动性能
        const isMobile = ObsidianInternals.isMobile(this.app);
        const delay = isMobile ? 10000 : 3000; // 移动端10秒，桌面端3秒
        
        this.indexBuildTimer = window.setTimeout(() => {
            this.indexBuildTimer = null;
            void this.buildFileIndex();
        }, delay);
    }
    
    /**
     * 销毁索引器，清理资源
     */
    destroy(): void {
        // 注销文件事件监听器
        this.fileWatcher.unregister();

        if (this.indexBuildTimer !== null) {
            window.clearTimeout(this.indexBuildTimer);
            this.indexBuildTimer = null;
        }
        
        // 清空索引
        this.indexStore.reset();
        
        // 清空文件内容缓存
        this.extractor.clearContentCache();
    }
    
    /**
     * 构建文件级高亮索引
     * 只对包含高亮的文件建立索引，而不是对每个高亮单独建立索引
     */
    async buildFileIndex(): Promise<void> {
        // 如果已经在构建索引，则跳过
        if (this.isIndexing) {
            return;
        }
        
        this.isIndexing = true;
        try {
            // 获取所有高亮
            const allHighlights = await this.extractor.getAllHighlights();
            
            // 创建新索引
            const newWordToFiles = new Map<string, Set<string>>();
            const newFileToHighlights = new Map<string, ScannedHighlight[]>();
            
            // 填充索引
            for (const { file, highlights } of allHighlights) {
                // Preserve source occurrences and their scan provenance.
                const highlightsWithFileInfo = highlights;
                
                // 添加到文件映射
                newFileToHighlights.set(file.path, highlightsWithFileInfo);
                
                // 提取关键词并添加到索引
                const fileWords = this.indexStore.extractKeywordsFromHighlights(highlights);
                this.indexStore.addKeywordsToIndex(fileWords, file.path, newWordToFiles);
            }
            
            // 更新索引
            this.indexStore.replace(newWordToFiles, newFileToHighlights);
            
        } catch {
            // 忽略索引构建错误
        } finally {
            this.isIndexing = false;
        }
    }
    
    /**
     * 从索引中获取所有高亮（公共方法，供外部调用）
     * 如果索引可用，直接从缓存返回，避免重新读取文件
     * 如果索引未构建，触发按需构建（但本次返回 null）
     * @returns 所有高亮数组，如果索引未构建则返回 null
     */
    public getAllHighlightsFromCache(): ScannedHighlight[] | null {
        // 如果索引从未构建过，触发按需构建
        if (this.indexStore.lastUpdated === 0 && !this.isIndexing) {
            void this.buildFileIndex();
        }
        
        // 检查索引是否可用
        if (!this.indexStore.isExpired() && this.indexStore.fileToHighlights.size > 0) {
            return this.indexStore.getAllHighlights();
        }
        return null;
    }
    
    /**
     * 从索引中移除文件
     * @param filePath 要移除的文件路径
     */
    removeFileFromIndex(filePath: string): void {
        // 如果索引未初始化或过期，则跳过
        this.indexStore.removeFile(filePath);
    }
    
    /**
     * 增量更新文件的索引
     * @param file 要更新的文件
     */
    async updateFileInIndex(file: TFile): Promise<void> {
        // 如果索引正在构建中，跳过增量更新
        if (this.isIndexing) {
            return;
        }
        
        // 如果索引未初始化，初始化空索引结构
        this.indexStore.ensureInitialized();
        
        // 如果索引已过期，触发完整重建（异步，不阻塞当前更新）
        if (this.indexStore.isExpired()) {
            // 异步触发重建，但不等待
            void this.buildFileIndex();
            return;
        }
        
        try {
            // 先从索引中移除该文件的所有关联
            this.removeFileFromIndex(file.path);
            
            // 重新索引该文件
            if (this.extractor.shouldProcessFile(file)) {
                const content = await this.app.vault.read(file);
                const highlights = this.extractor.extractHighlights(content, file);
                
                if (highlights.length > 0) {
                    // Keep scans source-only; UI metadata is projected after matching.
                    const highlightsWithFileInfo = highlights;
                    
                    // 添加到文件映射
                    this.indexStore.setFileHighlights(file.path, highlightsWithFileInfo);
                }
            }
        } catch {
            // 忽略更新索引错误
        }
    }
    
    /**
     * 使用文件级索引搜索高亮
     * @param searchTerm 搜索词
     * @returns 匹配的高亮数组
     */
    async searchHighlightsFromIndex(searchTerm: string): Promise<ScannedHighlight[]> {
        // 检查索引是否需要重建
        if (this.indexStore.isExpired() || this.indexStore.fileToHighlights.size === 0) {
            await this.buildFileIndex();
        }
        
        // 如果搜索词为空，返回所有高亮
        if (!searchTerm.trim()) {
            return this.indexStore.getAllHighlights();
        }
        
        // 分词搜索
        const terms = this.indexStore.tokenizeText(searchTerm);
        if (terms.length === 0) {
            return this.indexStore.getAllHighlights();
        }
        
        // 对每个词找到匹配的文件
        const matchingFileSets: Set<string>[] = [];
        for (const term of terms) {
            const matchingFiles = new Set<string>();
            
            // 查找包含该词的所有文件
            for (const [word, files] of this.indexStore.wordToFiles.entries()) {
                if (word.includes(term)) {
                    for (const filePath of files) {
                        matchingFiles.add(filePath);
                    }
                }
            }
            
            matchingFileSets.push(matchingFiles);
        }
        
        // 取交集（所有词都匹配的文件）
        let resultFilePaths: Set<string>;
        if (matchingFileSets.length > 0) {
            resultFilePaths = matchingFileSets[0];
            for (let i = 1; i < matchingFileSets.length; i++) {
                resultFilePaths = new Set([...resultFilePaths].filter(path => matchingFileSets[i].has(path)));
            }
        } else {
            resultFilePaths = new Set();
        }
        
        // 从匹配的文件中获取高亮
        const results: ScannedHighlight[] = [];
        for (const filePath of resultFilePaths) {
            const fileHighlights = this.indexStore.fileToHighlights.get(filePath) || [];
            
            // 进一步过滤高亮，只保留包含所有搜索词的高亮
            for (const highlight of fileHighlights) {
                const highlightText = highlight.text.toLowerCase();
                
                // This source index contains highlight text; comments belong to records.
                const allTermsFound = terms.every(term => {
                    return highlightText.includes(term);
                });
                
                if (allTermsFound) {
                    results.push(highlight);
                }
            }
        }
        
        return results;
    }
}

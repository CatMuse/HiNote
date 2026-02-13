import { App, TFile, EventRef } from "obsidian";
import { HighlightInfo } from '../../types';
import { HighlightExtractor } from './HighlightExtractor';

/**
 * 文件级高亮索引接口，用于加速全局搜索
 */
interface FileHighlightIndex {
    // 关键词到文件路径的映射
    wordToFiles: Map<string, Set<string>>;
    // 文件路径到文件高亮信息的映射
    fileToHighlights: Map<string, HighlightInfo[]>;
    // 最后更新时间
    lastUpdated: number;
}

/**
 * 高亮索引器
 * 职责：
 * 1. 构建和维护全局高亮索引
 * 2. 注册文件事件监听器实现索引自动更新
 * 3. 基于索引的关键词搜索
 * 4. 索引的增量更新和过期管理
 */
export class HighlightIndexer {
    // 常量定义
    private static readonly INDEX_EXPIRY_TIME = 3600000; // 1小时（毫秒）
    private static readonly MIN_WORD_LENGTH = 2; // 最小词长度
    
    // 文件级高亮索引
    private fileIndex: FileHighlightIndex = {
        wordToFiles: new Map(),
        fileToHighlights: new Map(),
        lastUpdated: 0
    };
    
    // 是否正在构建索引
    private isIndexing: boolean = false;
    
    // 文件事件监听器
    private fileCreateEventRef!: EventRef;
    private fileModifyEventRef!: EventRef;
    private fileDeleteEventRef!: EventRef;
    private fileRenameEventRef!: EventRef;

    constructor(
        private app: App,
        private extractor: HighlightExtractor
    ) {}

    /**
     * 初始化索引器，包括构建索引和注册文件事件监听器
     */
    async initialize(): Promise<void> {
        // 注册文件事件监听器，实现索引的自动更新
        this.registerFileEventHandlers();
        
        // 根据设备类型调整索引构建策略
        // 移动端延迟更长时间，避免影响启动性能
        const isMobile = (this.app as any).isMobile;
        const delay = isMobile ? 10000 : 3000; // 移动端10秒，桌面端3秒
        
        setTimeout(() => {
            this.buildFileIndex();
        }, delay);
    }
    
    /**
     * 销毁索引器，清理资源
     */
    destroy(): void {
        // 注销文件事件监听器
        this.unregisterFileEventHandlers();
        
        // 清空索引
        this.fileIndex = {
            wordToFiles: new Map(),
            fileToHighlights: new Map(),
            lastUpdated: 0
        };
        
        // 清空文件内容缓存
        this.extractor.clearContentCache();
    }
    
    /**
     * 注册文件事件监听器，用于自动更新索引
     */
    registerFileEventHandlers(): void {
        // 文件创建事件
        this.fileCreateEventRef = this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.updateFileInIndex(file);
            }
        });
        
        // 文件修改事件
        this.fileModifyEventRef = this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 使文件内容缓存失效
                this.extractor.invalidateContentCache(file.path);
                this.updateFileInIndex(file);
            }
        });
        
        // 文件删除事件
        this.fileDeleteEventRef = this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 清除缓存
                this.extractor.invalidateContentCache(file.path);
                this.removeFileFromIndex(file.path);
            }
        });
        
        // 文件重命名事件
        this.fileRenameEventRef = this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 清除旧路径的缓存
                this.extractor.invalidateContentCache(oldPath);
                this.removeFileFromIndex(oldPath);
                this.updateFileInIndex(file);
            }
        });
    }
    
    /**
     * 注销文件事件监听器
     */
    unregisterFileEventHandlers(): void {
        this.app.vault.offref(this.fileCreateEventRef);
        this.app.vault.offref(this.fileModifyEventRef);
        this.app.vault.offref(this.fileDeleteEventRef);
        this.app.vault.offref(this.fileRenameEventRef);
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
        const startTime = Date.now();
        
        try {
            // 获取所有高亮
            const allHighlights = await this.extractor.getAllHighlights();
            
            // 创建新索引
            const newWordToFiles = new Map<string, Set<string>>();
            const newFileToHighlights = new Map<string, HighlightInfo[]>();
            
            // 填充索引
            for (const { file, highlights } of allHighlights) {
                // 为每个文件中的高亮添加文件信息
                const highlightsWithFileInfo = highlights.map(h => ({
                    ...h,
                    fileName: file.basename,
                    filePath: file.path
                }));
                
                // 添加到文件映射
                newFileToHighlights.set(file.path, highlightsWithFileInfo);
                
                // 提取关键词并添加到索引
                const fileWords = this.extractKeywordsFromHighlights(highlights);
                this.addKeywordsToIndex(fileWords, file.path, newWordToFiles);
            }
            
            // 更新索引
            this.fileIndex = {
                wordToFiles: newWordToFiles,
                fileToHighlights: newFileToHighlights,
                lastUpdated: Date.now()
            };
            
        } catch (error) {
            // 忽略索引构建错误
        } finally {
            this.isIndexing = false;
        }
    }
    
    /**
     * 将文本分词，用于构建索引
     * @param text 要分词的文本
     * @returns 分词结果
     */
    private tokenizeText(text: string): string[] {
        if (!text) return [];
        
        // 将文本转为小写并按空白字符分词
        const words = text.toLowerCase().split(/\s+/);
        
        // 过滤掉太短的词和标点符号
        return words
            .filter(word => word.length >= HighlightIndexer.MIN_WORD_LENGTH)
            .map(word => word.replace(/[.,;:!?()\[\]{}'"`~]/g, ''))
            .filter(word => word.length >= HighlightIndexer.MIN_WORD_LENGTH);
    }
    
    /**
     * 检查索引是否过期
     * @returns 如果索引过期或未初始化则返回 true
     */
    private isIndexExpired(): boolean {
        return this.fileIndex.lastUpdated === 0 || 
               Date.now() - this.fileIndex.lastUpdated > HighlightIndexer.INDEX_EXPIRY_TIME;
    }
    
    /**
     * 从索引中获取所有高亮（公共方法，供外部调用）
     * 如果索引可用，直接从缓存返回，避免重新读取文件
     * 如果索引未构建，触发按需构建（但本次返回 null）
     * @returns 所有高亮数组，如果索引未构建则返回 null
     */
    public getAllHighlightsFromCache(): HighlightInfo[] | null {
        // 如果索引从未构建过，触发按需构建
        if (this.fileIndex.lastUpdated === 0 && !this.isIndexing) {
            this.buildFileIndex();
        }
        
        // 检查索引是否可用
        if (!this.isIndexExpired() && this.fileIndex.fileToHighlights.size > 0) {
            return this.getAllHighlightsFromIndex();
        }
        return null;
    }
    
    /**
     * 从索引中获取所有高亮（内部方法）
     * @returns 所有高亮数组
     */
    private getAllHighlightsFromIndex(): HighlightInfo[] {
        const allHighlights: HighlightInfo[] = [];
        for (const highlights of this.fileIndex.fileToHighlights.values()) {
            allHighlights.push(...highlights);
        }
        return allHighlights;
    }
    
    /**
     * 从高亮数组中提取所有关键词
     * @param highlights 高亮数组
     * @returns 关键词集合
     */
    private extractKeywordsFromHighlights(highlights: HighlightInfo[]): Set<string> {
        const keywords = new Set<string>();
        
        for (const highlight of highlights) {
            // 从高亮文本中提取关键词
            const words = this.tokenizeText(highlight.text);
            words.forEach(word => keywords.add(word));
            
            // 从评论中提取关键词
            if (highlight.comments?.length) {
                for (const comment of highlight.comments) {
                    const commentWords = this.tokenizeText(comment.content);
                    commentWords.forEach(word => keywords.add(word));
                }
            }
        }
        
        return keywords;
    }
    
    /**
     * 将关键词添加到索引中
     * @param keywords 关键词集合
     * @param filePath 文件路径
     * @param wordToFiles 词到文件的映射
     */
    private addKeywordsToIndex(keywords: Set<string>, filePath: string, wordToFiles: Map<string, Set<string>>): void {
        for (const word of keywords) {
            if (!wordToFiles.has(word)) {
                wordToFiles.set(word, new Set());
            }
            wordToFiles.get(word)!.add(filePath);
        }
    }
    
    /**
     * 从索引中移除文件
     * @param filePath 要移除的文件路径
     */
    removeFileFromIndex(filePath: string): void {
        // 如果索引未初始化或过期，则跳过
        if (this.isIndexExpired()) {
            return;
        }
        
        try {
            // 从索引中移除该文件的所有关联
            if (this.fileIndex.fileToHighlights.has(filePath)) {
                // 从词到文件的映射中移除
                for (const [word, files] of this.fileIndex.wordToFiles.entries()) {
                    files.delete(filePath);
                    // 如果没有文件了，删除这个词条
                    if (files.size === 0) {
                        this.fileIndex.wordToFiles.delete(word);
                    }
                }
                
                // 从文件到高亮的映射中移除
                this.fileIndex.fileToHighlights.delete(filePath);
            }
        } catch (error) {
            // 忽略移除索引错误
        }
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
        if (this.fileIndex.lastUpdated === 0) {
            this.fileIndex = {
                wordToFiles: new Map(),
                fileToHighlights: new Map(),
                lastUpdated: Date.now()
            };
        }
        
        // 如果索引已过期，触发完整重建（异步，不阻塞当前更新）
        if (this.isIndexExpired()) {
            // 异步触发重建，但不等待
            this.buildFileIndex();
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
                    // 为高亮添加文件信息
                    const highlightsWithFileInfo = highlights.map(h => ({
                        ...h,
                        fileName: file.basename,
                        filePath: file.path
                    }));
                    
                    // 添加到文件映射
                    this.fileIndex.fileToHighlights.set(file.path, highlightsWithFileInfo);
                    
                    // 提取关键词并添加到索引
                    const fileWords = this.extractKeywordsFromHighlights(highlights);
                    this.addKeywordsToIndex(fileWords, file.path, this.fileIndex.wordToFiles);
                }
            }
        } catch (error) {
            // 忽略更新索引错误
        }
    }
    
    /**
     * 使用文件级索引搜索高亮
     * @param searchTerm 搜索词
     * @returns 匹配的高亮数组
     */
    async searchHighlightsFromIndex(searchTerm: string): Promise<HighlightInfo[]> {
        // 检查索引是否需要重建
        if (this.isIndexExpired() || this.fileIndex.fileToHighlights.size === 0) {
            await this.buildFileIndex();
        }
        
        // 如果搜索词为空，返回所有高亮
        if (!searchTerm.trim()) {
            return this.getAllHighlightsFromIndex();
        }
        
        // 分词搜索
        const terms = this.tokenizeText(searchTerm);
        if (terms.length === 0) {
            return this.getAllHighlightsFromIndex();
        }
        
        // 对每个词找到匹配的文件
        const matchingFileSets: Set<string>[] = [];
        for (const term of terms) {
            const matchingFiles = new Set<string>();
            
            // 查找包含该词的所有文件
            for (const [word, files] of this.fileIndex.wordToFiles.entries()) {
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
        const results: HighlightInfo[] = [];
        for (const filePath of resultFilePaths) {
            const fileHighlights = this.fileIndex.fileToHighlights.get(filePath) || [];
            
            // 进一步过滤高亮，只保留包含所有搜索词的高亮
            for (const highlight of fileHighlights) {
                const highlightText = highlight.text.toLowerCase();
                const commentTexts = highlight.comments?.map(c => c.content.toLowerCase()) || [];
                
                // 检查是否所有搜索词都在高亮文本或评论中
                const allTermsFound = terms.every(term => {
                    return highlightText.includes(term) || 
                           commentTexts.some(commentText => commentText.includes(term));
                });
                
                if (allTermsFound) {
                    results.push(highlight);
                }
            }
        }
        
        return results;
    }
}

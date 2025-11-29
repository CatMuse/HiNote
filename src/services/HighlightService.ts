import { App, TFile, normalizePath, EventRef } from "obsidian";
import { HighlightInfo, PluginSettings } from '../types';
import { HiNote, CommentStore } from '../CommentStore';
import { t } from '../i18n';
import { ExcludePatternMatcher } from './ExcludePatternMatcher';
import { BlockIdService } from './BlockIdService';

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

export class HighlightService {
    // 常量定义
    private static readonly INDEX_EXPIRY_TIME = 3600000; // 1小时（毫秒）
    private static readonly INDEX_BUILD_DELAY = 3000; // 3秒（毫秒）
    private static readonly DUPLICATE_POSITION_THRESHOLD = 10; // 位置差异阈值
    private static readonly MIN_WORD_LENGTH = 2; // 最小词长度
    
    // 批量删除相关常量
    private static readonly POSITION_SEARCH_OFFSET_BEFORE = 10; // 位置搜索前偏移量
    private static readonly POSITION_SEARCH_OFFSET_AFTER = 50; // 位置搜索后偏移量
    
    private blockIdService: BlockIdService;
    // 文件内容缓存
    private contentCache = new Map<string, {content: string, mtime: number}>();
    
    // 文件级高亮索引
    private fileIndex: FileHighlightIndex = {
        wordToFiles: new Map(),
        fileToHighlights: new Map(),
        lastUpdated: 0
    };
    
    // 是否正在构建索引
    private isIndexing: boolean = false;
    
    // 文件事件监听器
    private fileCreateEventRef: EventRef;
    private fileModifyEventRef: EventRef;
    private fileDeleteEventRef: EventRef;
    private fileRenameEventRef: EventRef;

    // 默认的文本提取正则（可以被用户自定义替换）
    // 使用更严格的模式：==后面和前面不能是=或换行符，避免匹配URL中的==
    private static readonly DEFAULT_HIGHLIGHT_PATTERN = 
        /==([^=\n](?:[^=\n]|=[^=\n])*?[^=\n])==|<mark[^>]*>([\s\S]*?)<\/mark>|<span[^>]*>([\s\S]*?)<\/span>/g;
    
    private settings: PluginSettings;

    constructor(private app: App) {
        const plugins = (app as any).plugins;
        const plugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        this.settings = plugin?.settings;
        this.blockIdService = new BlockIdService(app);
    }
    
    /**
     * 初始化高亮服务，包括构建索引和注册文件事件监听器
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
     * 销毁高亮服务，清理资源
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
        this.contentCache.clear();
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
                this.contentCache.delete(file.path);
                this.updateFileInIndex(file);
            }
        });
        
        // 文件删除事件
        this.fileDeleteEventRef = this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 清除缓存
                this.contentCache.delete(file.path);
                this.removeFileFromIndex(file.path);
            }
        });
        
        // 文件重命名事件
        this.fileRenameEventRef = this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 清除旧路径的缓存
                this.contentCache.delete(oldPath);
                this.removeFileFromIndex(oldPath);
                this.updateFileInIndex(file);
            }
        });
    }
    
    /**
     * 注销文件事件监听器
     */
    unregisterFileEventHandlers(): void {
        // 注销所有事件监听器
        this.app.vault.offref(this.fileCreateEventRef);
        this.app.vault.offref(this.fileModifyEventRef);
        this.app.vault.offref(this.fileDeleteEventRef);
        this.app.vault.offref(this.fileRenameEventRef);
    }

    /**
     * 检查文件是否应该被处理（不在排除列表中）
     * @param file 要检查的文件
     * @returns 如果文件应该被处理则返回 true
     */
    shouldProcessFile(file: TFile): boolean {
        return !ExcludePatternMatcher.shouldExclude(file, this.settings?.excludePatterns || '');
    }

    /**
     * 从文本中提取所有高亮
     * @param content 文本内容
     * @param file 文件对象
     * @returns 高亮信息数组
     */
    extractHighlights(content: string, file: TFile): HighlightInfo[] {
        const highlights: HighlightInfo[] = [];
        
        // 如果使用自定义规则且有规则配置
        if (this.settings.useCustomPattern && this.settings.regexRules?.length > 0) {
            // 遍历所有启用的规则
            for (const rule of this.settings.regexRules.filter(r => r.enabled)) {
                try {
                    const pattern = new RegExp(rule.pattern, 'g');
                    this.processRegexMatches(content, pattern, highlights, file, rule.color);
                } catch (error) {
                    // 忽略正则规则错误
                }
            }
        } else {
            // 使用默认规则
            this.processRegexMatches(
                content, 
                HighlightService.DEFAULT_HIGHLIGHT_PATTERN, 
                highlights, 
                file, 
                '#ffeb3b' // 使用固定的默认黄色
            );
        }
        
        // 按位置排序
        return highlights.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }
    
    /**
     * 处理正则表达式匹配
     * @param content 文本内容
     * @param pattern 正则表达式
     * @param highlights 高亮数组
     * @param file 文件对象
     * @param backgroundColor 背景颜色
     */
    private processRegexMatches(
        content: string, 
        pattern: RegExp, 
        highlights: HighlightInfo[], 
        file: TFile, 
        backgroundColor: string
    ): void {
        // 优先用 Obsidian 的 metadataCache.sections 获取代码块区间
        let codeBlockRanges: Array<[number, number]> = [];
        if (file) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.sections) {
                const codeSections = cache.sections.filter(sec =>
                    ["code", "codeblock", "fenced_code", "pre"].includes(sec.type)
                );
                codeBlockRanges = codeSections.map(sec => [
                    sec.position.start.offset,
                    sec.position.end.offset
                ]);
            }
        }
        
        // 判断高亮区间是否与任意代码块区间有重叠
        function isInCodeBlockRange(start: number, end: number, ranges: Array<[number, number]>): boolean {
            return ranges.some(([blockStart, blockEnd]) =>
                Math.max(start, blockStart) < Math.min(end, blockEnd)
            );
        }
        
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
            const safeMatch = match as RegExpExecArray; // 类型断言，因为在循环中 match 一定不为 null
            const fullMatch = safeMatch[0];
            const matchStart = safeMatch.index;
            const matchEnd = matchStart + fullMatch.length;
            
            // 检查当前高亮是否在代码块内
            if (isInCodeBlockRange(matchStart, matchEnd, codeBlockRanges)) {
                continue; // 跳过代码块内的高亮
            }
            
            // 额外检查：如果匹配的是 == 格式，确保前后没有额外的 = 符号
            // 这可以防止 ===text=== 或 URL 中的 == 被误匹配
            if (fullMatch.startsWith('==') && fullMatch.endsWith('==')) {
                const beforeMatch = matchStart > 0 ? content.charAt(matchStart - 1) : '';
                const afterMatch = matchEnd < content.length ? content.charAt(matchEnd) : '';
                if (beforeMatch === '=' || afterMatch === '=') {
                    continue; // 跳过被额外 = 符号包围的匹配
                }
            }
            
            // 找到第一个非空的捕获组作为文本内容
            // 如果没有捕获组，则使用全部匹配内容
            let text = safeMatch.slice(1).find(group => group !== undefined);
            if (!text) {
                text = fullMatch; // 如果没有捕获组，则使用全部匹配内容
            }
            
            // 尝试提取颜色（内联逻辑）
            let extractedColor = null;
            if (fullMatch.includes('style=')) {
                extractedColor = this.extractColorFromElement(fullMatch);
            }

            // 检查是否已存在相同位置的高亮
            const isDuplicate = highlights.some(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - safeMatch.index) < HighlightService.DUPLICATE_POSITION_THRESHOLD && 
                h.text === text
            );

            if (!isDuplicate && text) {
                // 检查是否包含挖空格式 {{}}
                const isCloze = /\{\{([^{}]+)\}\}/.test(text);
                
                // 创建高亮对象（只包含提取阶段必需的字段）
                const highlight = {
                    text,
                    position: safeMatch.index,
                    backgroundColor: extractedColor || backgroundColor,
                    isCloze: isCloze,
                    filePath: file.path,
                    originalLength: fullMatch.length
                };
                
                highlights.push(highlight);
            }
        }
    }
    
    /**
     * 获取段落偏移量
     * @param content 完整文本内容
     * @param position 高亮位置
     * @returns 段落偏移量
     */
    private getParagraphOffset(content: string, position: number): number {
        const beforeText = content.substring(0, position);
        
        // 使用正则表达式找到最后一个段落分隔符（一个或多个空行）
        const paragraphs = beforeText.split(/\n\s*\n/);
        const currentParagraphStart = beforeText.length - paragraphs[paragraphs.length - 1].length;
        
        // 返回段落的起始位置作为偏移量
        return currentParagraphStart;
    }

    /**
     * 获取包含高亮的所有文件
     * @returns 包含高亮的文件数组
     */
    async getFilesWithHighlights(): Promise<TFile[]> {
        const files = this.app.vault.getMarkdownFiles();
        const filesWithHighlights: TFile[] = [];
        let totalHighlights = 0;

        for (const file of files) {
            // 检查文件是否应该被排除
            if (!this.shouldProcessFile(file)) {
                continue;
            }

            // 使用缓存读取文件内容
            const content = await this.getCachedFileContent(file);
            const highlights = this.extractHighlights(content, file);
            if (highlights.length > 0) {
                filesWithHighlights.push(file);
                totalHighlights += highlights.length;
            }
        }

        return filesWithHighlights;
    }

    /**
     * 获取所有包含高亮内容的文件及其高亮内容
     */
    async getAllHighlights(): Promise<{ file: TFile, highlights: HighlightInfo[] }[]> {
        const files = this.app.vault.getMarkdownFiles();
        const result: { file: TFile, highlights: HighlightInfo[] }[] = [];
        for (const file of files) {
            if (!this.shouldProcessFile(file)) continue;
            // 使用缓存读取文件内容
            const content = await this.getCachedFileContent(file);
            const highlights = this.extractHighlights(content, file);
            if (highlights.length > 0) {
                result.push({ file, highlights });
            }
        }
        return result;
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
            const allHighlights = await this.getAllHighlights();
            
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
            .filter(word => word.length >= HighlightService.MIN_WORD_LENGTH)
            .map(word => word.replace(/[.,;:!?()\[\]{}'"`~]/g, ''))
            .filter(word => word.length >= HighlightService.MIN_WORD_LENGTH);
    }
    
    /**
     * 检查索引是否过期
     * @returns 如果索引过期或未初始化则返回 true
     */
    private isIndexExpired(): boolean {
        return this.fileIndex.lastUpdated === 0 || 
               Date.now() - this.fileIndex.lastUpdated > HighlightService.INDEX_EXPIRY_TIME;
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
            if (this.shouldProcessFile(file)) {
                const content = await this.app.vault.read(file);
                const highlights = this.extractHighlights(content, file);
                
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

    /**
     * 为高亮创建 Block ID（用于拖拽和导出场景）
     * 这是一个公共方法，可以被插件的其他部分调用
     * 
     * @param file 文件
     * @param position 高亮起始位置
     * @param length 高亮长度（可选）
     * @returns Promise<string> 返回创建的 Block ID 引用（文件名#^BlockID）
     */
    public async createBlockIdForHighlight(file: TFile, position: number, length?: number): Promise<string> {
        try {
            // 检查是否已有 Block ID
            const existingId = this.blockIdService.getParagraphBlockId(file, position);
            if (existingId) {
                return existingId;
            }
            
            // 计算高亮结束位置（如果提供了长度）
            const endPosition = length ? position + length : position;
            
            // 强制创建并返回 Block ID 引用，传递起始和结束位置
            return await this.blockIdService.createParagraphBlockId(file, position, endPosition);
        } catch (error) {
            throw error;
        }
    }

    /**
     * 批量删除高亮标记（从文件中移除高亮格式）
     * 这个方法会一次性处理多个高亮的删除，避免多次文件读写
     * 
     * @param highlights 要删除的高亮数组
     * @returns Promise<{ success: number, failed: number }> 返回成功和失败的数量
     */
    public async batchRemoveHighlightMarks(highlights: Array<{ text: string; position?: number; filePath: string; originalLength?: number }>): Promise<{ success: number; failed: number }> {
        let successCount = 0;
        let failedCount = 0;
        
        // 按文件分组
        const highlightsByFile = new Map<string, typeof highlights>();
        for (const highlight of highlights) {
            if (!highlightsByFile.has(highlight.filePath)) {
                highlightsByFile.set(highlight.filePath, []);
            }
            highlightsByFile.get(highlight.filePath)!.push(highlight);
        }
        
        // 对每个文件处理其所有高亮
        for (const [filePath, fileHighlights] of highlightsByFile) {
            try {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!file || !(file instanceof TFile)) {
                    failedCount += fileHighlights.length;
                    continue;
                }
                
                // 按位置从后往前排序，这样删除时不会影响前面高亮的位置
                const sortedHighlights = [...fileHighlights].sort((a, b) => {
                    const posA = a.position ?? Infinity;
                    const posB = b.position ?? Infinity;
                    return posB - posA; // 降序
                });
                
                // 读取文件内容一次
                let content = await this.app.vault.read(file);
                
                // 依次删除每个高亮（从后往前）
                for (const highlight of sortedHighlights) {
                    try {
                        content = this.removeHighlightMarkFromContent(content, highlight);
                        successCount++;
                    } catch (error) {
                        failedCount++;
                    }
                }
                
                // 写入文件一次
                await this.app.vault.modify(file, content);
                
            } catch (error) {
                failedCount += fileHighlights.length;
            }
        }
        
        return { success: successCount, failed: failedCount };
    }
    
    /**
     * 从内容中移除单个高亮标记
     * 
     * @param content 文件内容
     * @param highlight 高亮信息
     * @returns 移除高亮后的内容
     */
    private removeHighlightMarkFromContent(
        content: string, 
        highlight: { text: string; position?: number; originalLength?: number }
    ): string {
        const escapedText = this.escapeRegExp(highlight.text);
        
        // 如果有位置信息，尝试精确定位
        if (typeof highlight.position === 'number') {
            const position = highlight.position;
            const highlightText = highlight.text;
            
            // 尝试多种高亮格式
            const possibleFormats = [
                `==${highlightText}==`,
                `== ${highlightText} ==`,
                `<mark>${highlightText}</mark>`,
                `<span class="highlight">${highlightText}</span>`
            ];
            
            // 在位置附近查找匹配
            for (const format of possibleFormats) {
                const startPos = Math.max(0, position - HighlightService.POSITION_SEARCH_OFFSET_BEFORE);
                const endPos = Math.min(content.length, position + highlightText.length + HighlightService.POSITION_SEARCH_OFFSET_AFTER);
                const searchRange = content.substring(startPos, endPos);
                
                if (searchRange.includes(format)) {
                    // 找到匹配，替换为纯文本
                    const beforeMatch = content.substring(0, startPos);
                    const afterMatch = content.substring(endPos);
                    const replacedRange = searchRange.replace(format, highlightText);
                    return beforeMatch + replacedRange + afterMatch;
                }
            }
        }
        
        // 如果没有位置信息或精确定位失败，使用正则表达式全局查找
        // 注意：这里只替换第一个匹配，避免误删其他相同文本
        const patterns = [
            new RegExp(`==\\s*(${escapedText})\\s*==`),
            new RegExp(`<mark[^>]*>(${escapedText})</mark>`),
            new RegExp(`<span[^>]*class="highlight"[^>]*>(${escapedText})</span>`)
        ];
        
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                return content.replace(pattern, highlight.text);
            }
        }
        
        // 如果都没找到，返回原内容（可能高亮已被手动删除）
        return content;
    }
    
    /**
     * 转义正则表达式特殊字符
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    /**
     * 从 HTML 元素中提取颜色（内联方法）
     */
    private extractColorFromElement(element: string): string | null {
        const styleMatch = element.match(/style=["']([^"']*)["']/);
        if (!styleMatch) return null;
        
        const bgColorMatch = styleMatch[1].match(
            /background(?:-color)?:\s*((?:rgba?\(.*?\)|#[0-9a-fA-F]{3,8}|var\(--[^)]+\)))/
        );
        
        return bgColorMatch ? bgColorMatch[1] : null;
    }
    
    /**
     * 获取缓存的文件内容（内联方法）
     */
    private async getCachedFileContent(file: TFile): Promise<string> {
        const cached = this.contentCache.get(file.path);
        if (cached && cached.mtime === file.stat.mtime) {
            return cached.content;
        }
        
        const content = await this.app.vault.read(file);
        this.contentCache.set(file.path, {content, mtime: file.stat.mtime});
        return content;
    }
    
    // ==================== 高亮匹配功能（从 HighlightMatchingService 合并） ====================
    
    /**
     * 查找与给定高亮最匹配的存储高亮
     * 使用多种策略进行匹配：精确匹配、位置匹配、模糊文本匹配
     */
    public findMatchingHighlight(file: TFile, highlight: HiNote, commentStore: CommentStore): HiNote | null {
        const fileHighlights = commentStore.getFileComments(file);
        if (!fileHighlights || fileHighlights.length === 0) {
            return null;
        }
        
        // 1. 首先尝试精确匹配（文本和位置）
        let matchingHighlight = fileHighlights.find(h => {
            if (h.text !== highlight.text) return false;
            if (typeof h.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(h.position - highlight.position) < 10;
            }
            return false;
        });
        
        if (matchingHighlight) return matchingHighlight;
        
        // 2. 如果没有精确匹配，尝试只匹配位置（允许文本有变化）
        if (highlight.position !== undefined) {
            matchingHighlight = fileHighlights.find(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - highlight.position) < 50
            );
            if (matchingHighlight) return matchingHighlight;
        }
        
        return null;
    }
    
    /**
     * 批量合并高亮和评论数据（统一的匹配逻辑）
     */
    public mergeHighlightsWithComments(
        highlights: HighlightInfo[],
        storedComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        if (storedComments.length === 0) {
            return highlights.map(h => this.createHighlightInfo(h, file));
        }
        
        // 构建索引
        const idIndex = new Map<string, HiNote>();
        const textIndex = new Map<string, HiNote[]>();
        const positionIndex = new Map<number, HiNote[]>();
        
        for (const comment of storedComments) {
            if (comment.id) idIndex.set(comment.id, comment);
            if (comment.text) {
                if (!textIndex.has(comment.text)) textIndex.set(comment.text, []);
                textIndex.get(comment.text)!.push(comment);
            }
            if (comment.position !== undefined) {
                const bucket = Math.floor(comment.position / 50);
                if (!positionIndex.has(bucket)) positionIndex.set(bucket, []);
                positionIndex.get(bucket)!.push(comment);
            }
        }
        
        const usedCommentIds = new Set<string>();
        
        // 合并高亮和评论数据
        const mergedHighlights = highlights.map(highlight => {
            // 策略 1: ID 精确匹配
            if (highlight.id && idIndex.has(highlight.id)) {
                const storedComment = idIndex.get(highlight.id)!;
                if (storedComment.id && !usedCommentIds.has(storedComment.id)) {
                    usedCommentIds.add(storedComment.id);
                    return this.createMergedHighlight(highlight, storedComment, file);
                }
            }
            
            // 策略 2: 文本+位置组合匹配
            if (highlight.text && textIndex.has(highlight.text)) {
                const candidates = textIndex.get(highlight.text)!;
                for (const candidate of candidates) {
                    if (candidate.id && 
                        !usedCommentIds.has(candidate.id) &&
                        highlight.position !== undefined &&
                        candidate.position !== undefined &&
                        Math.abs(candidate.position - highlight.position) < 100) {
                        usedCommentIds.add(candidate.id);
                        return this.createMergedHighlight(highlight, candidate, file);
                    }
                }
            }
            
            // 策略 3: 位置模糊匹配
            if (highlight.position !== undefined) {
                const bucket = Math.floor(highlight.position / 50);
                for (let b = bucket - 1; b <= bucket + 1; b++) {
                    if (positionIndex.has(b)) {
                        const candidates = positionIndex.get(b)!;
                        for (const candidate of candidates) {
                            if (candidate.id &&
                                !usedCommentIds.has(candidate.id) &&
                                candidate.position !== undefined &&
                                Math.abs(candidate.position - highlight.position) < 50) {
                                usedCommentIds.add(candidate.id);
                                return this.createMergedHighlight(highlight, candidate, file);
                            }
                        }
                    }
                }
            }
            
            return this.createHighlightInfo(highlight, file);
        });

        // 添加虚拟高亮
        const virtualHighlights = storedComments
            .filter(c => c.id && c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id))
            .map(vh => this.createHighlightInfo(vh, file));
        
        return [...virtualHighlights, ...mergedHighlights];
    }
    
    /**
     * 创建合并后的高亮信息
     */
    private createMergedHighlight(highlight: HighlightInfo, storedComment: HiNote, file: TFile): HighlightInfo {
        return {
            ...highlight,
            id: storedComment.id,
            comments: storedComment.comments || [],
            createdAt: storedComment.createdAt,
            updatedAt: storedComment.updatedAt,
            fileName: file.basename,
            filePath: file.path,
            fileIcon: 'file-text'
        };
    }
    
    /**
     * 创建高亮信息对象
     */
    private createHighlightInfo(highlight: HighlightInfo | HiNote, file: TFile): HighlightInfo {
        return {
            ...highlight,
            comments: highlight.comments || [],
            fileName: file.basename,
            filePath: file.path,
            fileIcon: 'file-text',
            position: highlight.position || 0
        };
    }
}

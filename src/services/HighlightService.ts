import { App, TFile, normalizePath, EventRef } from "obsidian";
import { HighlightInfo, PluginSettings } from '../types';
import { t } from '../i18n';
import { ExcludePatternMatcher } from './ExcludePatternMatcher';
import { ColorExtractorService } from './ColorExtractorService';
import { BlockIdService } from './BlockIdService';
import { FileContentCache } from './FileContentCache';

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
    
    private colorExtractor: ColorExtractorService;
    private blockIdService: BlockIdService;
    private fileContentCache: FileContentCache;
    
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
        this.colorExtractor = new ColorExtractorService();
        this.blockIdService = new BlockIdService(app);
        this.fileContentCache = new FileContentCache(app);
    }
    
    /**
     * 初始化高亮服务，包括构建索引和注册文件事件监听器
     */
    async initialize(): Promise<void> {
        // 注册文件事件监听器，实现索引的自动更新
        this.registerFileEventHandlers();
        
        // 立即开始异步构建索引，不阻塞插件加载
        // 使用 Promise.resolve().then() 确保在下一个微任务中执行，避免阻塞当前调用栈
        Promise.resolve().then(() => {
            this.buildFileIndex();
        });
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
        this.fileContentCache.clear();
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
                this.fileContentCache.invalidate(file.path);
                this.updateFileInIndex(file);
            }
        });
        
        // 文件删除事件
        this.fileDeleteEventRef = this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 清除缓存
                this.fileContentCache.invalidate(file.path);
                this.removeFileFromIndex(file.path);
            }
        });
        
        // 文件重命名事件
        this.fileRenameEventRef = this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && file.extension === 'md') {
                // 清除旧路径的缓存
                this.fileContentCache.invalidate(oldPath);
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
                    console.error(`[HighlightService] 正则规则 "${rule.name}" 错误:`, error);
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
            
            // 尝试提取颜色（如果HTML元素中包含样式）
            let extractedColor = null;
            if (fullMatch.includes('style=')) {
                extractedColor = this.colorExtractor.extractColorFromElement(fullMatch);
            }

            // 检查是否已存在相同位置的高亮
            const isDuplicate = highlights.some(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - safeMatch.index) < HighlightService.DUPLICATE_POSITION_THRESHOLD && 
                h.text === text
            );

            if (!isDuplicate && text) {
                // 获取当前文件的元数据缓存
                if (file) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.sections) {
                        // 找到对应的段落
                        const section = cache.sections.find(section => 
                            section.position.start.offset <= safeMatch.index &&
                            section.position.end.offset >= safeMatch.index
                        );
                        
                        // 只存储纯 BlockID，不存储完整路径
                        let blockId = section?.id;
                        
                        // 如果没有直接的 section.id，尝试使用 BlockIdService 获取
                        if (!blockId) {
                            const paragraphIdRef = this.blockIdService.getParagraphBlockId(file, safeMatch.index);
                            if (paragraphIdRef) {
                                // 使用与 BlockIdService 一致的正则表达式提取 BlockID
                                const match = paragraphIdRef.match(/#\^([a-zA-Z0-9-]+)/);
                                if (match && match[1]) {
                                    blockId = match[1];
                                }
                            }
                        }
                        
                        // 检查是否包含挖空格式 {{}}
                        // 直接使用正则表达式而不是引用常量
                        const isCloze = /\{\{([^{}]+)\}\}/.test(text);
                        
                        // 创建高亮对象
                        const highlight = {
                            text,
                            position: safeMatch.index,
                            paragraphOffset: this.getParagraphOffset(content, safeMatch.index),
                            backgroundColor: extractedColor || backgroundColor,
                            id: `highlight-${Date.now()}-${safeMatch.index}`,
                            comments: [],
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            originalLength: fullMatch.length,
                            blockId: blockId,
                            isCloze: isCloze, // 如果包含挖空格式，标记为 true
                            filePath: file.path // 添加文件路径
                        };
                        
                        highlights.push(highlight);
                    }
                }
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
            const content = await this.fileContentCache.getFileContent(file);
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
            const content = await this.fileContentCache.getFileContent(file);
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
            console.error('构建索引时出错:', error);
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
     * @returns 所有高亮数组，如果索引未构建则返回 null
     */
    public getAllHighlightsFromCache(): HighlightInfo[] | null {
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
            console.error(`[HighlightService] 移除文件 ${filePath} 索引时出错:`, error);
        }
    }
    
    /**
     * 增量更新文件的索引
     * @param file 要更新的文件
     */
    async updateFileInIndex(file: TFile): Promise<void> {
        // 如果索引未初始化或过期，则跳过增量更新，等待完整重建
        if (this.isIndexExpired()) {
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
            console.error(`更新文件 ${file.path} 的索引时出错:`, error);
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
            console.error('[HighlightService] Error creating block ID for highlight:', error);
            throw error; // 重新抛出错误，让调用者处理
        }
    }
}

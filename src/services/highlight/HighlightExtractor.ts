import { App, TFile } from "obsidian";
import { HighlightInfo, PluginSettings } from '../../types';
import { ExcludePatternMatcher } from '../ExcludePatternMatcher';
import { BlockIdService } from '../BlockIdService';

/**
 * 高亮提取器
 * 职责：
 * 1. 从文件内容中提取高亮文本
 * 2. 处理正则匹配和去重
 * 3. 文件排除判断
 * 4. 颜色提取
 * 5. 文件内容缓存
 */
export class HighlightExtractor {
    // 常量定义
    private static readonly DUPLICATE_POSITION_THRESHOLD = 10; // 位置差异阈值

    // 默认的文本提取正则（可以被用户自定义替换）
    // 使用更严格的模式：==后面和前面不能是=或换行符，避免匹配URL中的==
    private static readonly DEFAULT_HIGHLIGHT_PATTERN = 
        /==([^=\n](?:[^=\n]|=[^=\n])*?[^=\n])==|<mark[^>]*>([\s\S]*?)<\/mark>|<span[^>]*>([\s\S]*?)<\/span>/g;

    private blockIdService: BlockIdService;
    private settings: PluginSettings;
    
    // 文件内容缓存
    private contentCache = new Map<string, {content: string, mtime: number}>();

    constructor(private app: App) {
        const plugins = (app as any).plugins;
        const plugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        this.settings = plugin?.settings;
        this.blockIdService = new BlockIdService(app);
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
                HighlightExtractor.DEFAULT_HIGHLIGHT_PATTERN, 
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
                Math.abs(h.position - safeMatch.index) < HighlightExtractor.DUPLICATE_POSITION_THRESHOLD && 
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
    getParagraphOffset(content: string, position: number): number {
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
     * 为高亮创建 Block ID（用于拖拽和导出场景）
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
     * 获取缓存的文件内容
     */
    async getCachedFileContent(file: TFile): Promise<string> {
        const cached = this.contentCache.get(file.path);
        if (cached && cached.mtime === file.stat.mtime) {
            return cached.content;
        }
        
        const content = await this.app.vault.read(file);
        this.contentCache.set(file.path, {content, mtime: file.stat.mtime});
        return content;
    }

    /**
     * 使文件内容缓存失效
     */
    invalidateContentCache(filePath: string): void {
        this.contentCache.delete(filePath);
    }

    /**
     * 清空所有文件内容缓存
     */
    clearContentCache(): void {
        this.contentCache.clear();
    }

    /**
     * 转义正则表达式特殊字符
     */
    escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

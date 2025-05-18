import { TFile, App } from 'obsidian';
import { HighlightInfo, PluginSettings } from '../types';
import { t } from '../i18n';
import { ExcludePatternMatcher } from './ExcludePatternMatcher';
import { ColorExtractorService } from './ColorExtractorService';
import { EventManager } from './EventManager';
import { BlockIdService } from './BlockIdService';

type RegexMatch = [
    string,      // 完整匹配
    string,      // 双等号匹配
    string,      // mark 背景色
    string,      // mark 文本
    string,      // span 背景色
    string,      // span 文本
] & { index: number };     // 匹配位置

export class HighlightService {
    private colorExtractor: ColorExtractorService;
    private eventManager: EventManager;
    private blockIdService: BlockIdService;

    // 默认的文本提取正则（可以被用户自定义替换）
    private static readonly DEFAULT_HIGHLIGHT_PATTERN = 
        /==\s*([\s\S]*?)\s*==|<mark[^>]*>([\s\S]*?)<\/mark>|<span[^>]*>([\s\S]*?)<\/span>/g;
    
    // 已移除挖空格式的正则表达式，现在使用 Create HiCard 按钮手动创建闪卡


    private settings: PluginSettings;

    constructor(private app: App) {
        // 获取插件实例
        // 使用类型安全的方式获取插件实例
        // 通过类型断言访问内部属性
        const plugins = (app as any).plugins;
        const plugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        this.settings = plugin?.settings;
        this.colorExtractor = new ColorExtractorService();
        this.eventManager = new EventManager(app);
        this.blockIdService = new BlockIdService(app);

        // 调试输出当前设置
        console.debug('[HighlightService] Current settings:', this.settings);
        console.debug('[HighlightService] Exclude patterns:', this.settings?.excludePatterns);
    }

    /**
     * 检查文本是否包含高亮
     * @param content 要检查的文本内容
     * @returns 是否包含高亮
     */
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
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
            const safeMatch = match as RegExpExecArray; // 类型断言，因为在循环中 match 一定不为 null
            const fullMatch = safeMatch[0];
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
                Math.abs(h.position - safeMatch.index) < 10 && 
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
                        
                        // 挖空格式的自动处理已移除
                        // 现在用户需要点击 "Create HiCard" 按钮才能创建闪卡
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

            const content = await this.app.vault.read(file);
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
            const content = await this.app.vault.read(file);
            const highlights = this.extractHighlights(content, file);
            if (highlights.length > 0) {
                result.push({ file, highlights });
            }
        }
        return result;
    }

    /**
     * 为指定位置创建 Block ID
     * 采用懒加载策略，只在特定场景下才实际创建 Block ID
     * 
     * @param file 文件
     * @param position 位置
     * @param forceCreate 是否强制创建 Block ID（用于拖拽和导出场景）
     * @returns 纯 BlockID 或 undefined（如果不强制创建）
     */
    private createBlockIdForPosition(file: TFile, position: number, forceCreate: boolean = false): string | undefined {
        try {
            // 检查是否已有 Block ID
            const existingIdRef = this.blockIdService.getParagraphBlockId(file, position);
            if (existingIdRef) {
                // 使用与 BlockIdService 一致的正则表达式提取 BlockID
                const match = existingIdRef.match(/#\^([a-zA-Z0-9-]+)/);
                if (match && match[1]) {
                    return match[1];
                }
                return undefined;
            }
            
            // 如果强制创建（拖拽或导出场景），则创建并返回 Block ID
            if (forceCreate) {
                // 这里使用 Promise，但返回 undefined
                // 实际创建会在后台进行，不阻塞当前操作
                this.blockIdService.createParagraphBlockId(file, position)
                    .then(blockIdRef => {
                        // 使用与 BlockIdService 一致的正则表达式提取 BlockID
                        let blockId;
                        const match = blockIdRef.match(/#\^([a-zA-Z0-9-]+)/);
                        if (match && match[1]) {
                            blockId = match[1];
                        }
                        console.debug(`[HighlightService] Created block ID: ${blockId}`);
                        return blockId;
                    })
                    .catch(error => {
                        console.error('[HighlightService] Error creating block ID:', error);
                        return undefined;
                    });
            }
            
            // 默认情况下不创建，返回 undefined
            return undefined;
        } catch (error) {
            console.error('[HighlightService] Error in createBlockIdForPosition:', error);
            return undefined;
        }
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

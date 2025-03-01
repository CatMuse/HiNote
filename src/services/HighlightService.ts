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
        /==\s*(.*?)\s*==|<mark[^>]*>(.*?)<\/mark>|<span[^>]*>(.*?)<\/span>/g;


    private settings: PluginSettings;

    constructor(private app: App) {
        // 获取插件实例
        const plugin = (app as any).plugins.plugins['hi-note'];
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
     * @returns 高亮信息数组
     */
    extractHighlights(content: string): HighlightInfo[] {
        const highlights: HighlightInfo[] = [];
        const pattern = this.settings.useCustomPattern 
            ? new RegExp(this.settings.highlightPattern, 'g')
            : HighlightService.DEFAULT_HIGHLIGHT_PATTERN;

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(content)) !== null) {
            const safeMatch = match as RegExpExecArray; // 类型断言，因为在循环中 match 一定不为 null
            const fullMatch = safeMatch[0];
            // 找到第一个非空的捕获组作为文本内容
            const text = safeMatch.slice(1).find(group => group !== undefined);
            
            // 尝试提取颜色
            let backgroundColor = null;
            if (fullMatch.includes('style=')) {
                backgroundColor = this.colorExtractor.extractColorFromElement(fullMatch);
            }

            // 检查是否已存在相同位置的高亮
            const isDuplicate = highlights.some(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - safeMatch.index) < 10 && 
                h.text === text
            );

            if (!isDuplicate && text) {
                // 获取当前文件的元数据缓存
                const file = this.app.workspace.getActiveFile();
                if (file) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.sections) {
                        // 找到对应的段落
                        const section = cache.sections.find(section => 
                            section.position.start.offset <= safeMatch.index &&
                            section.position.end.offset >= safeMatch.index
                        );
                        
                        // 使用现有的 Block ID，如果存在的话
                        const paragraphId = section?.id ? 
                            `${file.path}#^${section.id}` : 
                            this.blockIdService.getParagraphBlockId(file, safeMatch.index);
                            
                        highlights.push({
                            text,
                            position: safeMatch.index,
                            paragraphOffset: this.getParagraphOffset(content, safeMatch.index),
                            backgroundColor: backgroundColor || this.settings.defaultHighlightColor,
                            id: `highlight-${Date.now()}-${safeMatch.index}`,
                            comments: [],
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            originalLength: fullMatch.length,
                            // 只使用现有的 Block ID，不创建新的
                            paragraphId: paragraphId
                        });
                    }
                }
            }
        }

        // 按位置排序
        return highlights.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
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
                console.debug(`[HighlightService] Skipping excluded file: ${file.path}`);
                continue;
            }

            const content = await this.app.vault.read(file);
            const highlights = this.extractHighlights(content);
            if (highlights.length > 0) {
                filesWithHighlights.push(file);
                totalHighlights += highlights.length;
                console.debug(`[HighlightService] Found ${highlights.length} highlights in ${file.path}`);
            }
        }

        console.info(`[HighlightService] Found ${totalHighlights} highlights in ${filesWithHighlights.length} files`);
        return filesWithHighlights;
    }
    
    /**
     * 为指定位置创建 Block ID
     * 采用懒加载策略，只在特定场景下才实际创建 Block ID
     * 
     * @param file 文件
     * @param position 位置
     * @param forceCreate 是否强制创建 Block ID（用于拖拽和导出场景）
     * @returns 段落 ID 引用或 undefined（如果不强制创建）
     */
    private createBlockIdForPosition(file: TFile, position: number, forceCreate: boolean = false): string | undefined {
        try {
            // 检查是否已有 Block ID
            const existingId = this.blockIdService.getParagraphBlockId(file, position);
            if (existingId) {
                return existingId;
            }
            
            // 如果强制创建（拖拽或导出场景），则创建并返回 Block ID
            if (forceCreate) {
                // 这里使用 Promise，但返回 undefined
                // 实际创建会在后台进行，不阻塞当前操作
                this.blockIdService.createParagraphBlockId(file, position)
                    .then(blockId => {
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
     * @param position 高亮位置
     * @returns Promise<string> 返回创建的 Block ID
     */
    public async createBlockIdForHighlight(file: TFile, position: number): Promise<string> {
        try {
            // 检查是否已有 Block ID
            const existingId = this.blockIdService.getParagraphBlockId(file, position);
            if (existingId) {
                return existingId;
            }
            
            // 强制创建并返回 Block ID
            return await this.blockIdService.createParagraphBlockId(file, position);
        } catch (error) {
            console.error('[HighlightService] Error creating block ID for highlight:', error);
            throw error; // 重新抛出错误，让调用者处理
        }
    }
}

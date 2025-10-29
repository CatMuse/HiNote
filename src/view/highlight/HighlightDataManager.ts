import { TFile, App } from 'obsidian';
import { HighlightInfo } from '../../types';
import { HiNote } from '../../CommentStore';
import { HighlightService } from '../../services/HighlightService';
import { CommentStore } from '../../CommentStore';
import { IdGenerator } from '../../utils/IdGenerator';
import { HighlightMatchingService } from '../../services/HighlightMatchingService';
import CommentPlugin from '../../../main';

/**
 * 高亮数据管理器
 * 负责高亮数据的加载、处理和匹配
 */
export class HighlightDataManager {
    private app: App;
    private plugin: CommentPlugin;
    private highlightService: HighlightService;
    private commentStore: CommentStore;
    private highlightMatchingService: HighlightMatchingService;
    
    constructor(
        app: App,
        plugin: CommentPlugin,
        highlightService: HighlightService,
        commentStore: CommentStore
    ) {
        this.app = app;
        this.plugin = plugin;
        this.highlightService = highlightService;
        this.commentStore = commentStore;
        // 使用统一的高亮匹配服务
        this.highlightMatchingService = new HighlightMatchingService(app, commentStore);
    }
    
    /**
     * 加载单个文件的高亮数据
     */
    async loadFileHighlights(file: TFile): Promise<HighlightInfo[]> {
        // 检查文件是否应该被处理
        if (!this.highlightService.shouldProcessFile(file)) {
            return [];
        }

        const content = await this.app.vault.read(file);
        const highlights = this.highlightService.extractHighlights(content, file);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(file);
        
        // 合并高亮和评论数据
        return this.mergeHighlightsWithComments(highlights, storedComments, file);
    }
    
    /**
     * 加载所有文件的高亮数据
     */
    async loadAllHighlights(searchTerm: string = '', searchType: string = ''): Promise<HighlightInfo[]> {
        const allHighlights: HighlightInfo[] = [];
        
        // 如果是路径搜索，先获取所有高亮然后按路径过滤
        if (searchType === 'path') {
            const highlightResults = await this.highlightService.getAllHighlights();
            
            // 创建所有文件的批注映射
            const fileCommentsMap = new Map<string, HiNote[]>();
            
            // 获取所有文件
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // 预先加载所有文件的批注
            for (const file of allFiles) {
                const fileComments = this.commentStore.getFileComments(file);
                if (fileComments && fileComments.length > 0) {
                    fileCommentsMap.set(file.path, fileComments);
                }
            }
            
            // 处理所有高亮
            for (const { file, highlights } of highlightResults) {
                // 如果有搜索词，先检查文件路径是否匹配
                if (searchTerm && !file.path.toLowerCase().includes(searchTerm.toLowerCase())) {
                    continue;
                }
                
                // 获取当前文件的所有批注
                const fileComments = fileCommentsMap.get(file.path) || [];
                
                // 合并高亮和评论
                const mergedHighlights = this.mergeHighlightsWithComments(highlights, fileComments, file);
                allHighlights.push(...mergedHighlights);
            }
        } else {
            // 常规全局搜索
            const highlightResults = await this.highlightService.getAllHighlights();
            
            for (const { file, highlights } of highlightResults) {
                const fileComments = this.commentStore.getFileComments(file);
                const mergedHighlights = this.mergeHighlightsWithComments(highlights, fileComments, file);
                
                // 如果有搜索词，过滤高亮
                if (searchTerm) {
                    const filtered = mergedHighlights.filter(h => 
                        h.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        h.comments?.some(c => c.content.toLowerCase().includes(searchTerm.toLowerCase()))
                    );
                    allHighlights.push(...filtered);
                } else {
                    allHighlights.push(...mergedHighlights);
                }
            }
        }
        
        return allHighlights;
    }
    
    /**
     * 合并高亮和评论数据
     * 使用统一的 HighlightMatchingService 进行匹配
     */
    private mergeHighlightsWithComments(
        highlights: HighlightInfo[],
        storedComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        // 使用统一的匹配服务，避免重复代码
        return this.highlightMatchingService.mergeHighlightsWithComments(highlights, storedComments, file);
    }
    
    /**
     * 标记高亮为全局搜索结果
     */
    markAsGlobalSearch(highlights: HighlightInfo[], isGlobal: boolean = true): HighlightInfo[] {
        return highlights.map(h => ({
            ...h,
            isGlobalSearch: isGlobal
        }));
    }
    
    /**
     * 标记高亮为 Canvas 来源
     */
    markAsCanvasSource(highlights: HighlightInfo[], canvasFile: TFile): HighlightInfo[] {
        return highlights.map(h => ({
            ...h,
            isFromCanvas: true,
            isGlobalSearch: true,
            canvasSource: canvasFile.path
        }));
    }
}

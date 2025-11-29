import { TFile, App } from 'obsidian';
import { HighlightInfo } from '../../types';
import { HiNote, CommentStore } from '../../CommentStore';
import { HighlightService } from '../../services/HighlightService';

/**
 * 全局高亮管理器
 * 负责加载和处理所有文件的高亮
 */
export class AllHighlightsManager {
    private app: App;
    private highlightService: HighlightService;
    private commentStore: CommentStore;
    
    constructor(
        app: App,
        highlightService: HighlightService,
        commentStore: CommentStore
    ) {
        this.app = app;
        this.highlightService = highlightService;
        this.commentStore = commentStore;
    }
    
    /**
     * 更新所有高亮
     */
    async updateAllHighlights(searchTerm: string = '', searchType: string = ''): Promise<HighlightInfo[]> {
        // 如果是路径搜索
        if (searchType === 'path') {
            return await this.loadHighlightsByPath(searchTerm);
        }
        
        // 如果有搜索词，使用索引搜索
        if (searchTerm) {
            return await this.searchHighlightsFromIndex(searchTerm);
        }
        
        // 否则加载所有高亮
        return await this.loadAllHighlights();
    }
    
    /**
     * 按路径加载高亮
     * 优先使用缓存，避免重复读取文件
     */
    private async loadHighlightsByPath(searchTerm: string): Promise<HighlightInfo[]> {
        // 尝试从缓存获取
        const cachedHighlights = this.highlightService.getAllHighlightsFromCache();
        
        if (cachedHighlights) {
            // 使用缓存数据，按路径过滤
            return this.filterCachedHighlightsByPath(cachedHighlights, searchTerm);
        }
        
        // 缓存不可用，从文件读取
        const allHighlights = await this.highlightService.getAllHighlights();
        const result: HighlightInfo[] = [];
        
        for (const { file, highlights } of allHighlights) {
            // 如果有搜索词，检查文件路径是否匹配
            if (searchTerm && !file.path.toLowerCase().includes(searchTerm.toLowerCase())) {
                continue;
            }
            
            const fileComments = this.commentStore.getFileComments(file);
            const processedHighlights = this.processFileHighlights(highlights, fileComments, file);
            result.push(...processedHighlights);
            
            // 添加虚拟高亮
            const virtualHighlights = this.getVirtualHighlights(fileComments, file);
            result.push(...virtualHighlights);
        }
        
        return result;
    }
    
    /**
     * 从缓存的高亮中按路径过滤
     */
    private filterCachedHighlightsByPath(cachedHighlights: HighlightInfo[], searchTerm: string): HighlightInfo[] {
        const result: HighlightInfo[] = [];
        
        // 按文件分组处理
        const highlightsByFile = new Map<string, HighlightInfo[]>();
        for (const highlight of cachedHighlights) {
            const filePath = highlight.filePath || '';
            
            // 如果有搜索词，检查文件路径是否匹配
            if (searchTerm && !filePath.toLowerCase().includes(searchTerm.toLowerCase())) {
                continue;
            }
            
            if (!highlightsByFile.has(filePath)) {
                highlightsByFile.set(filePath, []);
            }
            highlightsByFile.get(filePath)!.push(highlight);
        }
        
        // 处理每个文件的高亮
        for (const [filePath, highlights] of highlightsByFile.entries()) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) continue;
            
            const fileComments = this.commentStore.getFileComments(file);
            const processedHighlights = this.processFileHighlights(highlights, fileComments, file);
            result.push(...processedHighlights);
            
            // 添加虚拟高亮
            const virtualHighlights = this.getVirtualHighlights(fileComments, file);
            result.push(...virtualHighlights);
        }
        
        return result;
    }
    
    /**
     * 从索引搜索高亮
     */
    private async searchHighlightsFromIndex(searchTerm: string): Promise<HighlightInfo[]> {
        const searchResults = await this.highlightService.searchHighlightsFromIndex(searchTerm);
        
        return searchResults.map(highlight => ({
            ...highlight,
            comments: highlight.comments || [],
            fileName: highlight.fileName || this.extractFileNameFromPath(highlight.filePath),
            filePath: highlight.filePath || '',
            fileIcon: 'file-text'
        }));
    }
    
    /**
     * 加载所有高亮
     * 优先使用缓存，避免重复读取文件
     */
    private async loadAllHighlights(): Promise<HighlightInfo[]> {
        // 尝试从缓存获取
        const cachedHighlights = this.highlightService.getAllHighlightsFromCache();
        
        if (cachedHighlights) {
            // 使用缓存数据，快速返回
            return this.processCachedHighlights(cachedHighlights);
        }
        
        // 缓存不可用，从文件读取
        const allHighlights = await this.highlightService.getAllHighlights();
        const result: HighlightInfo[] = [];
        
        for (const { file, highlights } of allHighlights) {
            const fileComments = this.commentStore.getFileComments(file);
            const processedHighlights = this.processFileHighlights(highlights, fileComments, file);
            result.push(...processedHighlights);
            
            // 添加虚拟高亮
            const virtualHighlights = this.getVirtualHighlights(fileComments, file);
            result.push(...virtualHighlights);
        }
        
        return result;
    }
    
    /**
     * 处理缓存的高亮数据
     * 直接使用索引中的数据，合并评论信息
     */
    private processCachedHighlights(cachedHighlights: HighlightInfo[]): HighlightInfo[] {
        const result: HighlightInfo[] = [];
        
        // 按文件分组处理
        const highlightsByFile = new Map<string, HighlightInfo[]>();
        for (const highlight of cachedHighlights) {
            const filePath = highlight.filePath || '';
            if (!highlightsByFile.has(filePath)) {
                highlightsByFile.set(filePath, []);
            }
            highlightsByFile.get(filePath)!.push(highlight);
        }
        
        // 处理每个文件的高亮
        for (const [filePath, highlights] of highlightsByFile.entries()) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) continue;
            
            const fileComments = this.commentStore.getFileComments(file);
            const processedHighlights = this.processFileHighlights(highlights, fileComments, file);
            result.push(...processedHighlights);
            
            // 添加虚拟高亮
            const virtualHighlights = this.getVirtualHighlights(fileComments, file);
            result.push(...virtualHighlights);
        }
        
        return result;
    }
    
    /**
     * 处理文件的高亮
     */
    private processFileHighlights(
        highlights: HighlightInfo[],
        fileComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        return this.highlightService.mergeHighlightsWithComments(highlights, fileComments, file);
    }
    
    /**
     * 获取虚拟高亮（已废弃，由 mergeHighlightsWithComments 统一处理）
     * 保留此方法以兼容现有代码，但实际上不再使用
     */
    private getVirtualHighlights(fileComments: HiNote[], file: TFile): HighlightInfo[] {
        // 虚拟高亮现在由 mergeHighlightsWithComments 统一处理
        return [];
    }
    
    /**
     * 从路径提取文件名
     */
    private extractFileNameFromPath(filePath?: string): string {
        if (!filePath) return '';
        return filePath.split('/').pop()?.replace('.md', '') || '';
    }
}

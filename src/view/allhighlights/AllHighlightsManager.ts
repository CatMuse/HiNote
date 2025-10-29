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
     */
    private async loadHighlightsByPath(searchTerm: string): Promise<HighlightInfo[]> {
        const allHighlights = await this.highlightService.getAllHighlights();
        const fileCommentsMap = this.createFileCommentsMap();
        const result: HighlightInfo[] = [];
        
        for (const { file, highlights } of allHighlights) {
            // 如果有搜索词，检查文件路径是否匹配
            if (searchTerm && !file.path.toLowerCase().includes(searchTerm.toLowerCase())) {
                continue;
            }
            
            const fileComments = fileCommentsMap.get(file.path) || [];
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
     */
    private async loadAllHighlights(): Promise<HighlightInfo[]> {
        const allHighlights = await this.highlightService.getAllHighlights();
        const fileCommentsMap = this.createFileCommentsMap();
        const result: HighlightInfo[] = [];
        
        for (const { file, highlights } of allHighlights) {
            const fileComments = fileCommentsMap.get(file.path) || [];
            const processedHighlights = this.processFileHighlights(highlights, fileComments, file);
            result.push(...processedHighlights);
            
            // 添加虚拟高亮
            const virtualHighlights = this.getVirtualHighlights(fileComments, file);
            result.push(...virtualHighlights);
        }
        
        return result;
    }
    
    /**
     * 创建文件评论映射
     */
    private createFileCommentsMap(): Map<string, HiNote[]> {
        const fileCommentsMap = new Map<string, HiNote[]>();
        const allFiles = this.app.vault.getMarkdownFiles();
        
        for (const file of allFiles) {
            const fileComments = this.commentStore.getFileComments(file);
            if (fileComments && fileComments.length > 0) {
                fileCommentsMap.set(file.path, fileComments);
            }
        }
        
        return fileCommentsMap;
    }
    
    /**
     * 处理文件的高亮
     */
    private processFileHighlights(
        highlights: HighlightInfo[],
        fileComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        const usedCommentIds = new Set<string>();
        
        return highlights.map(highlight => {
            // 尝试匹配评论
            let storedComment = this.findMatchingComment(highlight, fileComments, usedCommentIds);
            
            if (storedComment) {
                usedCommentIds.add(storedComment.id);
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
            
            return {
                ...highlight,
                comments: highlight.comments || [],
                fileName: file.basename,
                filePath: file.path,
                fileIcon: 'file-text'
            };
        });
    }
    
    /**
     * 查找匹配的评论
     */
    private findMatchingComment(
        highlight: HighlightInfo,
        fileComments: HiNote[],
        usedCommentIds: Set<string>
    ): HiNote | undefined {
        // 1. 尝试 ID 匹配
        let storedComment = fileComments.find(c => 
            !usedCommentIds.has(c.id) && c.id === highlight.id
        );
        
        if (storedComment) return storedComment;
        
        // 2. 尝试文本匹配
        storedComment = fileComments.find(c => {
            if (usedCommentIds.has(c.id)) return false;
            
            const textMatch = c.text === highlight.text;
            if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                return Math.abs(c.position - highlight.position) < 1000;
            }
            return textMatch;
        });
        
        if (storedComment) return storedComment;
        
        // 3. 尝试位置匹配
        if (highlight.position !== undefined) {
            const highlightPos = highlight.position;
            storedComment = fileComments.find(c => 
                !usedCommentIds.has(c.id) && 
                c.position !== undefined && 
                Math.abs(c.position - highlightPos) < 50
            );
        }
        
        return storedComment;
    }
    
    /**
     * 获取虚拟高亮
     */
    private getVirtualHighlights(fileComments: HiNote[], file: TFile): HighlightInfo[] {
        const usedCommentIds = new Set<string>();
        
        // 收集已使用的评论 ID
        fileComments.forEach(c => {
            if (!c.isVirtual) {
                usedCommentIds.add(c.id);
            }
        });
        
        const virtualHighlights = fileComments
            .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
        
        return virtualHighlights.map(vh => ({
            ...vh,
            fileName: file.basename,
            filePath: file.path,
            fileIcon: 'file-text',
            position: vh.position || 0
        }));
    }
    
    /**
     * 从路径提取文件名
     */
    private extractFileNameFromPath(filePath?: string): string {
        if (!filePath) return '';
        return filePath.split('/').pop()?.replace('.md', '') || '';
    }
}

import { TFile } from "obsidian";
import { HighlightInfo } from "../../types";
import CommentPlugin from "../../../main";

/**
 * 搜索服务
 * 负责搜索相关的业务逻辑
 * 
 * 职责：
 * - 解析搜索输入（前缀识别）
 * - 过滤高亮数据
 * - 搜索匹配逻辑
 */
export class SearchService {
    private plugin: CommentPlugin;
    
    constructor(plugin: CommentPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 解析搜索输入，提取搜索词和搜索类型
     */
    parseSearchInput(searchInput: string): { searchTerm: string; searchType: string } {
        const normalizedInput = searchInput.toLowerCase().trim();
        
        const isGlobalSearch = normalizedInput.startsWith('all:');
        const isHiCardSearch = normalizedInput.startsWith('hicard:');
        const isCommentSearch = normalizedInput.startsWith('comment:');
        const isPathSearch = normalizedInput.startsWith('path:');
        
        let searchType = '';
        let searchTerm = normalizedInput;
        
        if (isGlobalSearch) {
            searchType = 'all';
            searchTerm = normalizedInput.substring(4).trim();
        } else if (isHiCardSearch) {
            searchType = 'hicard';
            searchTerm = normalizedInput.substring(7).trim();
        } else if (isCommentSearch) {
            searchType = 'comment';
            searchTerm = normalizedInput.substring(8).trim();
        } else if (isPathSearch) {
            searchType = 'path';
            searchTerm = normalizedInput.substring(5).trim();
        }
        
        return { searchTerm, searchType };
    }
    
    /**
     * 根据搜索词和搜索类型过滤高亮
     */
    filterHighlights(
        highlights: HighlightInfo[],
        searchTerm: string,
        searchType: string = '',
        currentFile: TFile | null
    ): HighlightInfo[] {
        // 如果是按路径搜索
        if (searchType === 'path') {
            return this.filterByPath(highlights, searchTerm);
        }
        
        // 如果是搜索闪卡
        if (searchType === 'hicard') {
            return this.filterByFlashcard(highlights, searchTerm, currentFile);
        }
        
        // 如果是搜索批注
        if (searchType === 'comment') {
            return this.filterByComment(highlights, searchTerm, currentFile);
        }
        
        // 常规搜索逻辑
        return this.filterByGeneral(highlights, searchTerm, currentFile);
    }
    
    /**
     * 按路径过滤高亮
     */
    private filterByPath(highlights: HighlightInfo[], searchTerm: string): HighlightInfo[] {
        // 确保所有高亮都有文件名和路径信息
        highlights.forEach(highlight => {
            if (highlight.filePath && !highlight.fileName) {
                const pathParts = highlight.filePath.split('/');
                highlight.fileName = pathParts[pathParts.length - 1];
            }
        });
        
        // 如果搜索词为空，返回所有有文件路径的高亮
        if (!searchTerm || searchTerm.trim() === '') {
            return highlights.filter(highlight => !!highlight.filePath);
        }
        
        // 如果有搜索词，过滤出路径匹配的高亮
        return highlights.filter(highlight => {
            if (!highlight.filePath) {
                return false;
            }
            const filePath = highlight.filePath.toLowerCase();
            return filePath.includes(searchTerm.toLowerCase());
        });
    }
    
    /**
     * 按闪卡过滤高亮
     */
    private filterByFlashcard(
        highlights: HighlightInfo[],
        searchTerm: string,
        currentFile: TFile | null
    ): HighlightInfo[] {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            return [];
        }
        
        return highlights.filter(highlight => {
            // 检查高亮是否已转化为闪卡
            const hasFlashcard = highlight.id ? 
                fsrsManager.findCardsBySourceId(highlight.id, 'highlight').length > 0 : 
                false;
            
            if (!hasFlashcard) {
                return false;
            }
            
            // 如果有搜索词，还需要匹配搜索词
            if (searchTerm) {
                return this.matchesSearchTerm(highlight, searchTerm, currentFile);
            }
            
            return true;
        });
    }
    
    /**
     * 按批注过滤高亮
     */
    private filterByComment(
        highlights: HighlightInfo[],
        searchTerm: string,
        currentFile: TFile | null
    ): HighlightInfo[] {
        return highlights.filter(highlight => {
            // 检查高亮是否包含批注
            const hasComments = highlight.comments && highlight.comments.length > 0;
            
            if (!hasComments) {
                return false;
            }
            
            // 如果有搜索词，还需要匹配搜索词
            if (searchTerm) {
                return this.matchesSearchTerm(highlight, searchTerm, currentFile);
            }
            
            return true;
        });
    }
    
    /**
     * 常规搜索过滤
     */
    private filterByGeneral(
        highlights: HighlightInfo[],
        searchTerm: string,
        currentFile: TFile | null
    ): HighlightInfo[] {
        return highlights.filter(highlight => {
            return this.matchesSearchTerm(highlight, searchTerm, currentFile);
        });
    }
    
    /**
     * 检查高亮是否匹配搜索词
     */
    private matchesSearchTerm(
        highlight: HighlightInfo,
        searchTerm: string,
        currentFile: TFile | null
    ): boolean {
        const lowerSearchTerm = searchTerm.toLowerCase();
        
        // 搜索高亮文本
        if (highlight.text.toLowerCase().includes(lowerSearchTerm)) {
            return true;
        }
        
        // 搜索评论内容
        if (highlight.comments?.some(comment => 
            comment.content.toLowerCase().includes(lowerSearchTerm)
        )) {
            return true;
        }
        
        // 在全部视图中也搜索文件名
        if (currentFile === null && highlight.fileName?.toLowerCase().includes(lowerSearchTerm)) {
            return true;
        }
        
        return false;
    }
}

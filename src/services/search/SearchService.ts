import { TFile } from "obsidian";
import { HighlightInfo } from "../../types/highlight";
import CommentPlugin from "../../../main";
import type { HighlightCardType } from '../../views/hinote/ViewState';

/**
 * 搜索服务
 * 负责搜索相关的业务逻辑
 * 
 * 职责：
 * - 按独立的卡片类型状态过滤高亮数据
 * - 搜索匹配逻辑
 */
export class SearchService {
    private plugin: CommentPlugin;
    
    constructor(plugin: CommentPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 根据纯文本搜索词和卡片类型过滤高亮
     */
    filterHighlights(
        highlights: HighlightInfo[],
        searchTerm: string,
        cardType: HighlightCardType = 'all',
        currentFile: TFile | null
    ): HighlightInfo[] {
        // 如果是搜索闪卡
        if (cardType === 'hicard') {
            return this.filterByFlashcard(highlights, searchTerm, currentFile);
        }
        
        // 如果是搜索批注
        if (cardType === 'comment') {
            return this.filterByComment(highlights, searchTerm, currentFile);
        }
        
        // 常规搜索逻辑
        return this.filterByGeneral(highlights, searchTerm, currentFile);
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
            const hasComments = highlight.kind === 'file-comment' || !!highlight.comments?.length;
            
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

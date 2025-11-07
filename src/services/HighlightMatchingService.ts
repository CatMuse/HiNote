import { App, TFile } from "obsidian";
import { CommentStore, HiNote } from "../CommentStore";
import { HighlightInfo } from "../types";

/**
 * 高亮匹配服务 - 提供统一的高亮文本匹配和恢复功能
 * 所有高亮与评论的匹配逻辑都应该使用这个服务
 */
export class HighlightMatchingService {
    constructor(
        private app: App,
        private commentStore: CommentStore
    ) {
    }
    
    /**
     * 查找与给定高亮最匹配的存储高亮
     * 使用多种策略进行匹配：精确匹配、位置匹配、模糊文本匹配
     */
    public findMatchingHighlight(file: TFile, highlight: HiNote): HiNote | null {
        // 获取文件中所有的高亮
        const fileHighlights = this.commentStore.getFileComments(file);
        if (!fileHighlights || fileHighlights.length === 0) {
            return null;
        }
        
        // 1. 首先尝试精确匹配（文本和位置）- 改进版
        let matchingHighlight = fileHighlights.find(h => {
            // 文本必须相同
            if (h.text !== highlight.text) return false;
            
            // 如果两者都有位置信息，则位置必须接近
            if (typeof h.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(h.position - highlight.position) < 10;
            }
            
            // 如果有blockId，则blockId必须相同
            if (h.blockId && highlight.blockId) {
                return h.blockId === highlight.blockId;
            }
            
            // 如果没有位置信息也没有blockId，则不认为是同一个高亮
            // 这样可以避免相同文本在不同位置被视为同一个高亮
            return false;
        });
        
        if (matchingHighlight) {
            return matchingHighlight;
        }
        
        // 2. 如果没有精确匹配，尝试只匹配位置（允许文本有变化）
        if (highlight.position !== undefined) {
            matchingHighlight = fileHighlights.find(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - highlight.position) < 30
            );
            
            if (matchingHighlight) {
                return matchingHighlight;
            }
        }
        
        // 3. 如果所有匹配都失败，尝试使用块ID匹配
        if (highlight.blockId) {
            const blockHighlights = fileHighlights.filter(h => h.blockId === highlight.blockId);
            if (blockHighlights.length > 0) {
                return blockHighlights[0];
            }
        }
        
        return null;
    }
    
    /**
     * 尝试恢复丢失的高亮
     * 当用户修改了高亮文本但保留了批注时使用
     */
    public async recoverHighlight(file: TFile, originalHighlight: HiNote, newText: string): Promise<HiNote | null> {
        // 创建一个新的高亮对象，保留原始高亮的评论和元数据
        const recoveredHighlight: HiNote = {
            ...originalHighlight,
            text: newText,
            updatedAt: Date.now()
        };
        
        // 保存恢复的高亮
        await this.commentStore.addComment(file, recoveredHighlight);
        
        return recoveredHighlight;
    }
    
    /**
     * 批量合并高亮和评论数据（统一的匹配逻辑）
     * 这是所有高亮匹配的核心方法，使用多种策略进行匹配
     * 
     * @param highlights 从文件中提取的高亮数组
     * @param storedComments 已存储的评论数组
     * @param file 文件对象
     * @returns 合并后的高亮数组
     */
    public mergeHighlightsWithComments(
        highlights: HighlightInfo[],
        storedComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
        const usedCommentIds = new Set<string>();
        
        // 合并高亮和评论数据
        const mergedHighlights = highlights.map(highlight => {
            // 1. 首先尝试 ID 精确匹配
            let storedComment = storedComments.find(c => 
                !usedCommentIds.has(c.id) && c.id === highlight.id
            );
            
            if (storedComment) {
                usedCommentIds.add(storedComment.id);
                return this.createMergedHighlight(highlight, storedComment, file);
            }
            
            // 2. 尝试文本和位置组合匹配
            storedComment = storedComments.find(c => {
                if (usedCommentIds.has(c.id)) return false;
                
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return textMatch;
            });
            
            if (storedComment) {
                usedCommentIds.add(storedComment.id);
                return this.createMergedHighlight(highlight, storedComment, file);
            }
            
            // 3. 尝试位置匹配（允许文本有小幅变化）
            if (highlight.position !== undefined) {
                const highlightPos = highlight.position;
                storedComment = storedComments.find(c => 
                    !usedCommentIds.has(c.id) && 
                    c.position !== undefined && 
                    Math.abs(c.position - highlightPos) < 50
                );
                
                if (storedComment) {
                    usedCommentIds.add(storedComment.id);
                    return this.createMergedHighlight(highlight, storedComment, file);
                }
            }
            
            // 4. 如果所有匹配都失败，返回原始高亮
            return this.createHighlightInfo(highlight, file);
        });

        // 添加虚拟高亮（只有评论没有高亮的情况）
        const virtualHighlights = storedComments
            .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id))
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

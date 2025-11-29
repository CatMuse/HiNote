import { App, TFile } from "obsidian";
import { CommentStore, HiNote } from "../CommentStore";
import { HighlightInfo } from "../types";

/**
 * 索引结构 - 用于加速高亮匹配
 */
interface HighlightIndexes {
    idIndex: Map<string, HiNote>;           // ID 索引: O(1) 查找
    textIndex: Map<string, HiNote[]>;       // 文本索引: O(k) 查找
    positionIndex: Map<number, HiNote[]>;   // 位置索引: O(k) 查找 (按桶分组)
}

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
        
        // 1. 首先尝试精确匹配（文本和位置）
        let matchingHighlight = fileHighlights.find(h => {
            // 文本必须相同
            if (h.text !== highlight.text) return false;
            
            // 如果两者都有位置信息，则位置必须接近
            if (typeof h.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(h.position - highlight.position) < 10;
            }
            
            // 如果没有位置信息，则不认为是同一个高亮
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
                Math.abs(h.position - highlight.position) < 50
            );
            
            if (matchingHighlight) {
                return matchingHighlight;
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
     * 构建索引 - 将评论数组转换为高效的查找结构
     * @param storedComments 已存储的评论数组
     * @returns 索引结构
     */
    private buildIndexes(storedComments: HiNote[]): HighlightIndexes {
        const idIndex = new Map<string, HiNote>();
        const textIndex = new Map<string, HiNote[]>();
        const positionIndex = new Map<number, HiNote[]>();
        
        for (const comment of storedComments) {
            // 1. ID 索引 - 用于 O(1) 精确匹配
            if (comment.id) {
                idIndex.set(comment.id, comment);
            }
            
            // 2. 文本索引 - 用于文本+位置组合匹配
            if (comment.text) {
                if (!textIndex.has(comment.text)) {
                    textIndex.set(comment.text, []);
                }
                textIndex.get(comment.text)!.push(comment);
            }
            
            // 3. 位置索引 - 用于位置模糊匹配
            // 按 50 字符分桶,减少需要检查的候选项
            if (comment.position !== undefined) {
                const bucket = Math.floor(comment.position / 50);
                if (!positionIndex.has(bucket)) {
                    positionIndex.set(bucket, []);
                }
                positionIndex.get(bucket)!.push(comment);
            }
        }
        
        return { idIndex, textIndex, positionIndex };
    }
    
    /**
     * 批量合并高亮和评论数据（统一的匹配逻辑）- 使用索引优化
     * 这是所有高亮匹配的核心方法，使用多种策略进行匹配
     * 
     * 性能优化:
     * - ID 匹配: O(n²) → O(1)
     * - 文本+位置匹配: O(n²) → O(k) (k为相同文本的评论数)
     * - 位置匹配: O(n²) → O(k) (k为相邻桶的评论数)
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
        // 如果没有存储的评论,直接返回高亮列表
        if (storedComments.length === 0) {
            return highlights.map(h => this.createHighlightInfo(h, file));
        }
        
        // 构建索引 - O(n) 时间复杂度,但后续查找变为 O(1) 或 O(k)
        const { idIndex, textIndex, positionIndex } = this.buildIndexes(storedComments);
        
        // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
        const usedCommentIds = new Set<string>();
        
        // 合并高亮和评论数据
        const mergedHighlights = highlights.map(highlight => {
            // 策略 1: ID 精确匹配 - O(1)
            if (highlight.id && idIndex.has(highlight.id)) {
                const storedComment = idIndex.get(highlight.id)!;
                if (storedComment.id && !usedCommentIds.has(storedComment.id)) {
                    usedCommentIds.add(storedComment.id);
                    return this.createMergedHighlight(highlight, storedComment, file);
                }
            }
            
            // 策略 2: 文本+位置组合匹配 - O(k), k为相同文本的评论数
            if (highlight.text && textIndex.has(highlight.text)) {
                const candidates = textIndex.get(highlight.text)!;
                for (const candidate of candidates) {
                    if (candidate.id && 
                        !usedCommentIds.has(candidate.id) &&
                        highlight.position !== undefined &&
                        candidate.position !== undefined &&
                        Math.abs(candidate.position - highlight.position) < 100) {
                        usedCommentIds.add(candidate.id);
                        return this.createMergedHighlight(highlight, candidate, file);
                    }
                }
            }
            
            // 策略 3: 位置模糊匹配 - O(k), k为相邻桶的评论数
            if (highlight.position !== undefined) {
                const bucket = Math.floor(highlight.position / 50);
                
                // 检查当前桶和相邻桶 (前后各一个桶)
                for (let b = bucket - 1; b <= bucket + 1; b++) {
                    if (positionIndex.has(b)) {
                        const candidates = positionIndex.get(b)!;
                        for (const candidate of candidates) {
                            if (candidate.id &&
                                !usedCommentIds.has(candidate.id) &&
                                candidate.position !== undefined &&
                                Math.abs(candidate.position - highlight.position) < 50) {
                                usedCommentIds.add(candidate.id);
                                return this.createMergedHighlight(highlight, candidate, file);
                            }
                        }
                    }
                }
            }
            
            // 策略 4: 如果所有匹配都失败，返回原始高亮
            return this.createHighlightInfo(highlight, file);
        });

        // 添加虚拟高亮（只有评论没有高亮的情况）
        const virtualHighlights = storedComments
            .filter(c => c.id && c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id))
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

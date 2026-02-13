import { App, TFile } from "obsidian";
import { HighlightInfo } from '../../types';
import { HighlightInfo as HiNote } from '../../types';
import { HighlightRepository } from '../../repositories/HighlightRepository';

/**
 * 高亮匹配器
 * 职责：
 * 1. 将从文件中提取的高亮与存储的评论数据进行匹配合并
 * 2. 使用多种策略（ID、文本+位置、纯文本、位置模糊）进行匹配
 * 3. 匹配成功后异步更新存储中的 position，防止偏移累积
 */
export class HighlightMatcher {
    constructor(private app: App) {}

    /**
     * 查找与给定高亮最匹配的存储高亮
     * 使用多种策略进行匹配：精确匹配、位置匹配、模糊文本匹配
     */
    public findMatchingHighlight(file: TFile, highlight: HiNote, highlightRepository: HighlightRepository): HiNote | null {
        const fileHighlights = highlightRepository.getCachedHighlights(file.path) || [];
        if (!fileHighlights || fileHighlights.length === 0) {
            return null;
        }
        
        // 1. 首先尝试精确匹配（文本和位置）
        let matchingHighlight = fileHighlights.find((h: HiNote) => {
            if (h.text !== highlight.text) return false;
            if (typeof h.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(h.position - highlight.position) < 10;
            }
            return false;
        });
        
        if (matchingHighlight) return matchingHighlight;
        
        // 2. 文本+位置组合匹配（容差 500，适应较大编辑偏移）
        if (highlight.text && highlight.position !== undefined) {
            const textCandidates = fileHighlights
                .filter((h: HiNote) => h.text === highlight.text && typeof h.position === 'number')
                .sort((a, b) => 
                    Math.abs((a.position ?? 0) - (highlight.position ?? 0)) -
                    Math.abs((b.position ?? 0) - (highlight.position ?? 0))
                );
            if (textCandidates.length > 0 && 
                Math.abs((textCandidates[0].position ?? 0) - (highlight.position ?? 0)) < 500) {
                return textCandidates[0];
            }
        }
        
        // 3. 纯文本精确匹配（当该文本只有唯一候选时）
        if (highlight.text) {
            const textOnlyCandidates = fileHighlights.filter((h: HiNote) => h.text === highlight.text);
            if (textOnlyCandidates.length === 1) {
                return textOnlyCandidates[0];
            }
        }
        
        // 4. 位置模糊匹配（允许文本有变化）
        if (highlight.position !== undefined) {
            matchingHighlight = fileHighlights.find((h: HiNote) => 
                typeof h.position === 'number' && 
                Math.abs(h.position - highlight.position) < 50
            );
            if (matchingHighlight) return matchingHighlight;
        }
        
        return null;
    }
    
    /**
     * 批量合并高亮和评论数据（统一的匹配逻辑）
     */
    public mergeHighlightsWithComments(
        highlights: HighlightInfo[],
        storedComments: HiNote[],
        file: TFile
    ): HighlightInfo[] {
        if (storedComments.length === 0) {
            return highlights.map(h => this.createHighlightInfo(h, file));
        }
        
        // 构建索引
        const idIndex = new Map<string, HiNote>();
        const textIndex = new Map<string, HiNote[]>();
        const positionIndex = new Map<number, HiNote[]>();
        
        for (const comment of storedComments) {
            if (comment.id) idIndex.set(comment.id, comment);
            if (comment.text) {
                if (!textIndex.has(comment.text)) textIndex.set(comment.text, []);
                textIndex.get(comment.text)!.push(comment);
            }
            if (comment.position !== undefined) {
                const bucket = Math.floor(comment.position / 50);
                if (!positionIndex.has(bucket)) positionIndex.set(bucket, []);
                positionIndex.get(bucket)!.push(comment);
            }
        }
        
        const usedCommentIds = new Set<string>();
        // 收集需要更新 position 的高亮，在合并完成后批量异步更新存储
        const positionUpdates: { id: string; newPosition: number }[] = [];
        
        // 合并高亮和评论数据
        const mergedHighlights = highlights.map(highlight => {
            // 策略 1: ID 精确匹配
            if (highlight.id && idIndex.has(highlight.id)) {
                const storedComment = idIndex.get(highlight.id)!;
                if (storedComment.id && !usedCommentIds.has(storedComment.id)) {
                    usedCommentIds.add(storedComment.id);
                    this.trackPositionUpdate(positionUpdates, storedComment, highlight);
                    return this.createMergedHighlight(highlight, storedComment, file);
                }
            }
            
            // 策略 2: 文本+位置组合匹配（容差 500，适应较大编辑偏移）
            if (highlight.text && textIndex.has(highlight.text)) {
                const candidates = textIndex.get(highlight.text)!;
                // 按位置差异排序，优先匹配最近的
                const sortedCandidates = candidates
                    .filter(c => c.id && !usedCommentIds.has(c.id) &&
                        highlight.position !== undefined &&
                        c.position !== undefined)
                    .sort((a, b) => 
                        Math.abs((a.position ?? 0) - (highlight.position ?? 0)) -
                        Math.abs((b.position ?? 0) - (highlight.position ?? 0))
                    );
                for (const candidate of sortedCandidates) {
                    if (Math.abs((candidate.position ?? 0) - (highlight.position ?? 0)) < 500) {
                        usedCommentIds.add(candidate.id!);
                        this.trackPositionUpdate(positionUpdates, candidate, highlight);
                        return this.createMergedHighlight(highlight, candidate, file);
                    }
                }
            }
            
            // 策略 3: 纯文本精确匹配（当该文本只有唯一候选时，无需位置验证）
            if (highlight.text && textIndex.has(highlight.text)) {
                const candidates = textIndex.get(highlight.text)!
                    .filter(c => c.id && !usedCommentIds.has(c.id));
                if (candidates.length === 1) {
                    usedCommentIds.add(candidates[0].id!);
                    this.trackPositionUpdate(positionUpdates, candidates[0], highlight);
                    return this.createMergedHighlight(highlight, candidates[0], file);
                }
            }
            
            // 策略 4: 位置模糊匹配
            if (highlight.position !== undefined) {
                const bucket = Math.floor(highlight.position / 50);
                for (let b = bucket - 1; b <= bucket + 1; b++) {
                    if (positionIndex.has(b)) {
                        const candidates = positionIndex.get(b)!;
                        for (const candidate of candidates) {
                            if (candidate.id &&
                                !usedCommentIds.has(candidate.id) &&
                                candidate.position !== undefined &&
                                Math.abs(candidate.position - highlight.position) < 50) {
                                usedCommentIds.add(candidate.id);
                                this.trackPositionUpdate(positionUpdates, candidate, highlight);
                                return this.createMergedHighlight(highlight, candidate, file);
                            }
                        }
                    }
                }
            }
            
            return this.createHighlightInfo(highlight, file);
        });

        // 添加虚拟高亮
        const virtualHighlights = storedComments
            .filter(c => c.id && c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id))
            .map(vh => this.createHighlightInfo(vh, file));
        
        // 异步更新存储中的 position，防止偏移累积
        if (positionUpdates.length > 0) {
            this.applyPositionUpdates(file.path, storedComments, positionUpdates);
        }
        
        return [...virtualHighlights, ...mergedHighlights];
    }
    
    /**
     * 记录需要更新 position 的高亮
     */
    private trackPositionUpdate(
        updates: { id: string; newPosition: number }[],
        storedComment: HiNote,
        highlight: HighlightInfo
    ): void {
        if (storedComment.id &&
            highlight.position !== undefined &&
            storedComment.position !== undefined &&
            highlight.position !== storedComment.position) {
            updates.push({ id: storedComment.id, newPosition: highlight.position });
        }
    }
    
    /**
     * 异步批量更新存储中的 position，防止偏移累积导致匹配失败
     */
    private applyPositionUpdates(
        filePath: string,
        storedComments: HiNote[],
        updates: { id: string; newPosition: number }[]
    ): void {
        // 使用 setTimeout 异步执行，不阻塞合并流程
        setTimeout(async () => {
            try {
                const updateMap = new Map(updates.map(u => [u.id, u.newPosition]));
                let changed = false;
                
                for (const comment of storedComments) {
                    if (comment.id && updateMap.has(comment.id)) {
                        comment.position = updateMap.get(comment.id)!;
                        changed = true;
                    }
                }
                
                if (changed) {
                    // 获取 HighlightRepository 实例并保存
                    const plugins = (this.app as any).plugins;
                    const plugin = plugins?.plugins?.['hi-note'];
                    if (plugin?.highlightRepository) {
                        await plugin.highlightRepository.saveFileHighlights(filePath, storedComments);
                    }
                }
            } catch (error) {
                // 静默处理，position 更新失败不影响主流程
            }
        }, 100);
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

import { TFile } from "obsidian";
import { HighlightInfo } from '../../types/highlight';
import { HighlightRepository } from '../../repositories/HighlightRepository';
import {
    canUpdateStoredHighlight,
    findStoredHighlightMatch
} from './HighlightMatchStrategies';
import type { HighlightMatchConfidence } from './HighlightMatchStrategies';

type HiNote = HighlightInfo;

interface StoredHighlightUpdate {
    id: string;
    patch: Partial<HiNote>;
}

/**
 * 高亮匹配器
 * 职责：
 * 1. 将从文件中提取的高亮与存储的评论数据进行匹配合并
 * 2. 使用统一策略（ID、block+text、文本+位置、上下文、唯一文本）进行匹配
 * 3. 高置信匹配成功后异步更新存储中的定位锚点，防止偏移累积
 */
export class HighlightMatcher {
    constructor(
        private getHighlightRepository?: () => HighlightRepository | undefined
    ) {}

    /**
     * 使用多种策略匹配高亮和候选评论。
     */
    static findMatch(
        target: HiNote,
        candidates: HiNote[]
    ): HiNote | null {
        return findStoredHighlightMatch(target, candidates)?.highlight || null;
    }

    /**
     * 使用统一匹配策略查找候选高亮。
     */
    static findExactMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
        return findStoredHighlightMatch(target, candidates)?.highlight || null;
    }

    /**
     * 查找与给定高亮最匹配的存储高亮
     * 使用统一策略进行匹配，禁止纯位置匹配。
     */
    public findMatchingHighlight(file: TFile, highlight: HiNote, highlightRepository: HighlightRepository): HiNote | null {
        const fileHighlights = highlightRepository.getCachedHighlights(file.path) || [];
        return findStoredHighlightMatch(highlight, fileHighlights)?.highlight || null;
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
        
        const usedCommentIds = new Set<string>();
        // 收集需要更新定位锚点的高亮，在合并完成后批量异步更新存储
        const highlightUpdates: StoredHighlightUpdate[] = [];
        
        // 合并高亮和评论数据
        const mergedHighlights = highlights.map(highlight => {
            const match = findStoredHighlightMatch(highlight, storedComments, { usedIds: usedCommentIds });
            const storedComment = match?.highlight;
            if (storedComment?.id && match) {
                usedCommentIds.add(storedComment.id);
                this.trackStoredHighlightUpdate(highlightUpdates, storedComment, highlight, match.confidence);
                return this.createMergedHighlight(highlight, storedComment, file);
            }

            return this.createHighlightInfo(highlight, file);
        });

        // 添加虚拟高亮
        const virtualHighlights = storedComments
            .filter(c => c.id && c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id))
            .map(vh => this.createHighlightInfo(vh, file));
        
        // 异步更新存储中的定位锚点，防止偏移累积
        if (highlightUpdates.length > 0) {
            this.applyStoredHighlightUpdates(file.path, storedComments, highlightUpdates);
        }
        
        return [...virtualHighlights, ...mergedHighlights];
    }
    
    /**
     * 记录需要更新定位锚点的高亮
     */
    private trackStoredHighlightUpdate(
        updates: StoredHighlightUpdate[],
        storedComment: HiNote,
        highlight: HighlightInfo,
        confidence: HighlightMatchConfidence
    ): void {
        if (!storedComment.id || !canUpdateStoredHighlight(confidence)) {
            return;
        }

        const patch: Partial<HiNote> = {};
        if (highlight.syntax && highlight.syntax !== storedComment.syntax) {
            patch.syntax = highlight.syntax;
        }
        if (highlight.backgroundColor !== storedComment.backgroundColor) {
            patch.backgroundColor = highlight.backgroundColor;
        }
        if (highlight.position !== undefined && highlight.position !== storedComment.position) {
            patch.position = highlight.position;
        }
        if (highlight.text && highlight.text !== storedComment.text) {
            patch.text = highlight.text;
        }
        if (highlight.contextBefore && highlight.contextBefore !== storedComment.contextBefore) {
            patch.contextBefore = highlight.contextBefore;
        }
        if (highlight.contextAfter && highlight.contextAfter !== storedComment.contextAfter) {
            patch.contextAfter = highlight.contextAfter;
        }
        if (highlight.textFingerprint && highlight.textFingerprint !== storedComment.textFingerprint) {
            patch.textFingerprint = highlight.textFingerprint;
        }
        if (highlight.blockId && highlight.blockId !== storedComment.blockId) {
            patch.blockId = highlight.blockId;
        }
        if (Object.keys(patch).length > 0) {
            updates.push({ id: storedComment.id, patch });
        }
    }
    
    /**
     * 异步批量更新存储中的定位锚点，防止偏移累积导致匹配失败
     */
    private applyStoredHighlightUpdates(
        filePath: string,
        storedComments: HiNote[],
        updates: StoredHighlightUpdate[]
    ): void {
        // 使用 setTimeout 异步执行，不阻塞合并流程
        window.setTimeout(() => {
            void this.saveStoredHighlightUpdates(filePath, storedComments, updates);
        }, 100);
    }

    private async saveStoredHighlightUpdates(
        filePath: string,
        storedComments: HiNote[],
        updates: StoredHighlightUpdate[]
    ): Promise<void> {
        try {
            const updateMap = new Map(updates.map(u => [u.id, u.patch]));
            let changed = false;

            for (const comment of storedComments) {
                if (comment.id && updateMap.has(comment.id)) {
                    Object.assign(comment, updateMap.get(comment.id)!);
                    comment.updatedAt = Date.now();
                    changed = true;
                }
            }

            if (changed) {
                const highlightRepository = this.getHighlightRepository?.();
                if (highlightRepository) {
                    await highlightRepository.saveFileHighlights(filePath, storedComments);
                }
            }
        } catch {
            // 静默处理，定位锚点更新失败不影响主流程
        }
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
    private createHighlightInfo(highlight: HighlightInfo, file: TFile): HighlightInfo {
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

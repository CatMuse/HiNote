import { TFile } from 'obsidian';
import { HiNote } from '../CommentStore';

/**
 * 高亮匹配工具类
 * 提供精确匹配和位置匹配策略
 */
export class HighlightMatcher {
    /**
     * 使用多种策略匹配高亮和评论
     * @param target 目标高亮对象
     * @param candidates 候选高亮列表
     * @returns 匹配到的高亮对象，如果没有匹配到则返回 null
     */
    static findMatch(
        target: HiNote,
        candidates: HiNote[]
    ): HiNote | null {
        if (!candidates || candidates.length === 0) return null;
        
        // 策略 1: 精确匹配文本和位置
        let match = this.exactMatch(target, candidates);
        if (match) return match;
        
        // 策略 2: 只匹配位置（允许文本有变化）
        match = this.positionMatch(target, candidates);
        if (match) return match;
        
        return null;
    }
    
    /**
     * 精确匹配：文本相同且位置接近
     */
    private static exactMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
        return candidates.find(h => 
            h.text === target.text && 
            (typeof h.position !== 'number' || 
             typeof target.position !== 'number' || 
             Math.abs(h.position - target.position) < 10)
        ) || null;
    }
    
    /**
     * 位置匹配：只匹配位置，允许文本有变化
     */
    private static positionMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
        if (typeof target.position !== 'number') return null;
        
        return candidates.find(h => 
            typeof h.position === 'number' && 
            Math.abs(h.position - target.position) < 30
        ) || null;
    }
    
    /**
     * 精确匹配高亮（简化版，只匹配文本和位置）
     */
    static findExactMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
        return candidates.find(h => 
            h.text === target.text && 
            (typeof h.position !== 'number' || 
             typeof target.position !== 'number' || 
             Math.abs(h.position - target.position) < 10)
        ) || null;
    }
}

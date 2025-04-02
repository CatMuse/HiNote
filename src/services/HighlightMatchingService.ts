import { App, TFile } from "obsidian";
import { CommentStore, HiNote } from "../CommentStore";
import { TextSimilarityService } from "./TextSimilarityService";

/**
 * 高亮匹配服务 - 提供高亮文本匹配和恢复功能
 */
export class HighlightMatchingService {
    private textSimilarityService: TextSimilarityService;
    
    constructor(
        private app: App,
        private commentStore: CommentStore
    ) {
        this.textSimilarityService = new TextSimilarityService(app);
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
            console.log(`[HighlightMatchingService] 找到精确匹配: "${matchingHighlight.text}"`);
            return matchingHighlight;
        }
        
        // 2. 如果没有精确匹配，尝试只匹配位置（允许文本有变化）
        if (highlight.position !== undefined) {
            matchingHighlight = fileHighlights.find(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - highlight.position) < 30
            );
            
            if (matchingHighlight) {
                console.log(`[HighlightMatchingService] 找到位置匹配: "${matchingHighlight.text}" 位置: ${matchingHighlight.position}`);
                return matchingHighlight;
            }
        }
        
        // 3. 如果位置匹配也失败，尝试使用模糊文本匹配
        let bestMatch = null;
        let highestSimilarity = 0;
        
        for (const h of fileHighlights) {
            // 跳过没有评论的高亮
            if (!h.comments || h.comments.length === 0) continue;
            
            const similarity = this.textSimilarityService.calculateSimilarity(
                h.text, 
                highlight.text
            );
            
            if (similarity > highestSimilarity && similarity > 0.6) { // 设置一个相似度阈值
                highestSimilarity = similarity;
                bestMatch = h;
            }
        }
        
        if (bestMatch) {
            console.log(`[HighlightMatchingService] 使用模糊匹配找到高亮: 相似度 ${highestSimilarity.toFixed(2)}`);
            console.log(`  原文本: "${bestMatch.text}"`);
            console.log(`  当前文本: "${highlight.text}"`);
            return bestMatch;
        }
        
        // 4. 如果所有匹配都失败，尝试使用块ID匹配
        if (highlight.blockId) {
            const blockHighlights = fileHighlights.filter(h => h.blockId === highlight.blockId);
            if (blockHighlights.length > 0) {
                console.log(`[HighlightMatchingService] 使用块ID匹配找到高亮: "${blockHighlights[0].text}"`);
                return blockHighlights[0];
            }
        }
        
        console.log(`[HighlightMatchingService] 未找到匹配的高亮`);
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
        
        console.log(`[HighlightMatchingService] 恢复了高亮: "${newText}"`);
        return recoveredHighlight;
    }
}

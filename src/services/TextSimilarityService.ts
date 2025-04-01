import { App } from "obsidian";

/**
 * 文本相似度服务 - 提供模糊匹配功能
 */
export class TextSimilarityService {
    private readonly SIMILARITY_THRESHOLD = 0.7; // 默认相似度阈值
    private readonly MAX_SEARCH_RANGE = 5000;    // 默认最大搜索范围（字符数）
    
    constructor(private app: App) {}
    
    /**
     * 计算两个字符串之间的编辑距离（Levenshtein距离）
     */
    public levenshteinDistance(a: string, b: string): number {
        // 优化：如果字符串相同，直接返回0
        if (a === b) return 0;
        
        // 优化：如果其中一个字符串为空，返回另一个字符串的长度
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        
        const matrix: number[][] = [];
        
        // 初始化矩阵
        for (let i = 0; i <= a.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= b.length; j++) {
            matrix[0][j] = j;
        }
        
        // 填充矩阵
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                if (a[i-1] === b[j-1]) {
                    matrix[i][j] = matrix[i-1][j-1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i-1][j-1] + 1, // 替换
                        matrix[i][j-1] + 1,   // 插入
                        matrix[i-1][j] + 1    // 删除
                    );
                }
            }
        }
        
        return matrix[a.length][b.length];
    }
    
    /**
     * 计算两个字符串之间的相似度（0-1之间，1表示完全相同）
     */
    public calculateSimilarity(a: string, b: string): number {
        const distance = this.levenshteinDistance(a, b);
        const maxLength = Math.max(a.length, b.length);
        return maxLength === 0 ? 1 : 1 - distance / maxLength;
    }
    
    /**
     * 在文本内容中查找与目标文本最相似的片段
     * @param targetText 目标文本（原始高亮文本）
     * @param content 要搜索的内容
     * @param originalPosition 原始位置（可选，用于限制搜索范围）
     * @param threshold 相似度阈值（可选，默认为0.7）
     * @returns 找到的最佳匹配及其位置，如果没有找到则返回null
     */
    public findBestMatch(
        targetText: string, 
        content: string, 
        originalPosition?: number,
        threshold?: number
    ): { text: string; position: number } | null {
        // 如果目标文本太短（少于3个字符），使用精确匹配
        if (targetText.length < 3) {
            const exactPos = content.indexOf(targetText);
            return exactPos !== -1 ? { text: targetText, position: exactPos } : null;
        }
        
        const actualThreshold = threshold || this.SIMILARITY_THRESHOLD;
        let searchContent = content;
        let positionOffset = 0;
        
        // 如果提供了原始位置，限制搜索范围以提高性能
        if (originalPosition !== undefined && originalPosition >= 0) {
            const halfRange = this.MAX_SEARCH_RANGE / 2;
            const startPos = Math.max(0, originalPosition - halfRange);
            const endPos = Math.min(content.length, originalPosition + halfRange);
            
            searchContent = content.substring(startPos, endPos);
            positionOffset = startPos;
        }
        
        // 提取可能的匹配文本段
        const possibleMatches = this.extractPossibleMatches(searchContent, targetText.length);
        
        let bestMatch = null;
        let highestSimilarity = 0;
        let bestPosition = -1;
        
        // 查找最佳匹配
        for (const match of possibleMatches) {
            const similarity = this.calculateSimilarity(targetText, match.text);
            
            if (similarity > highestSimilarity) {
                highestSimilarity = similarity;
                bestMatch = match.text;
                bestPosition = match.position;
            }
        }
        
        // 只有当相似度超过阈值时才返回匹配结果
        if (highestSimilarity >= actualThreshold && bestMatch && bestPosition !== -1) {
            return {
                text: bestMatch,
                position: bestPosition + positionOffset
            };
        }
        
        return null;
    }
    
    /**
     * 从文本中提取可能的匹配段
     * @param content 文本内容
     * @param targetLength 目标文本长度
     * @returns 可能的匹配段及其位置
     */
    private extractPossibleMatches(content: string, targetLength: number): Array<{text: string; position: number}> {
        const matches: Array<{text: string; position: number}> = [];
        
        // 方法1：使用滑动窗口提取与目标长度相近的文本片段
        const windowSize = targetLength;
        const step = Math.max(1, Math.floor(windowSize / 4)); // 滑动步长，避免过多重复计算
        
        for (let i = 0; i < content.length - windowSize + 1; i += step) {
            const segment = content.substring(i, i + windowSize);
            matches.push({ text: segment, position: i });
        }
        
        // 方法2：按句子分割（简单实现）
        const sentences = content.split(/[.!?。！？\n]+/);
        let position = 0;
        
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed.length > 0) {
                position = content.indexOf(trimmed, position);
                if (position !== -1) {
                    matches.push({ text: trimmed, position });
                    position += trimmed.length;
                }
            }
        }
        
        return matches;
    }
}

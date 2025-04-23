import { App } from "obsidian";

/**
 * 文本相似度服务 - 提供模糊匹配功能
 */
export class TextSimilarityService {
    private readonly SIMILARITY_THRESHOLD = 0.7; // 默认相似度阈值
    private readonly MAX_SEARCH_RANGE = 5000;    // 默认最大搜索范围（字符数）
    private readonly POSITION_WEIGHT = 0.3;      // 位置因素的权重
    private readonly POSITION_TOLERANCE = 100;   // 位置容差（字符数）
    
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
     * @param originalPosition 原始位置（可选，用于限制搜索范围和位置优先级）
     * @param threshold 相似度阈值（可选，默认为0.7）
     * @returns 找到的最佳匹配及其位置，如果没有找到则返回null
     */
    public findBestMatch(
        targetText: string, 
        content: string, 
        originalPosition?: number,
        threshold?: number
    ): { text: string; position: number } | null {
        // 如果目标文本太短（少于10个字符），使用精确匹配并考虑位置
        if (targetText.length < 10) {
            // 如果有原始位置，先在附近查找精确匹配
            if (originalPosition !== undefined && originalPosition >= 0) {
                const nearbyStart = Math.max(0, originalPosition - this.POSITION_TOLERANCE);
                const nearbyEnd = Math.min(content.length, originalPosition + this.POSITION_TOLERANCE);
                const nearbyContent = content.substring(nearbyStart, nearbyEnd);
                
                const nearbyPos = nearbyContent.indexOf(targetText);
                if (nearbyPos !== -1) {
                    return { text: targetText, position: nearbyStart + nearbyPos };
                }
            }
            
            // 如果附近没找到或没有原始位置，在整个内容中查找
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
        let highestScore = 0; // 综合得分（结合相似度和位置）
        let bestPosition = -1;
        
        // 查找最佳匹配，考虑文本相似度和位置接近度
        for (const match of possibleMatches) {
            // 计算文本相似度
            const similarity = this.calculateSimilarity(targetText, match.text);
            
            // 如果相似度低于阈值，直接跳过
            if (similarity < actualThreshold) {
                continue;
            }
            
            // 计算位置分数
            let positionScore = 1.0; // 默认位置分数
            if (originalPosition !== undefined && originalPosition >= 0) {
                // 计算当前匹配位置与原始位置的距离
                const actualPosition = match.position + positionOffset;
                const distance = Math.abs(actualPosition - originalPosition);
                
                // 距离越近，位置分数越高
                positionScore = Math.max(0, 1 - (distance / (this.POSITION_TOLERANCE * 2)));
            }
            
            // 计算综合得分：相似度 * (1 - 位置权重) + 位置分数 * 位置权重
            const score = similarity * (1 - this.POSITION_WEIGHT) + positionScore * this.POSITION_WEIGHT;
            
            // 如果是完全相同的文本，位置因素权重更高
            const finalScore = similarity === 1.0 ? 
                similarity * 0.5 + positionScore * 0.5 : // 完全相同时，位置权重提高到0.5
                score;
            
            if (finalScore > highestScore) {
                highestScore = finalScore;
                bestMatch = match.text;
                bestPosition = match.position;
            }
        }
        
        // 只有当找到了匹配结果时才返回
        if (bestMatch && bestPosition !== -1) {
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
        const seen = new Set<string>(); // 用于去重，防止重复添加相同位置的匹配
        
        // 方法1：使用滑动窗口提取与目标长度相近的文本片段
        // 调整窗口大小，允许一定的长度变化
        const minWindowSize = Math.max(3, Math.floor(targetLength * 0.9));
        const maxWindowSize = Math.ceil(targetLength * 1.1);
        
        // 对不同窗口大小进行匹配
        for (let windowSize = minWindowSize; windowSize <= maxWindowSize; windowSize++) {
            // 根据窗口大小调整步长，窗口越大步长越大，但确保至少有50%的重叠
            const step = Math.max(1, Math.floor(windowSize / 4));
            
            for (let i = 0; i < content.length - windowSize + 1; i += step) {
                const segment = content.substring(i, i + windowSize);
                // 使用位置信息创建唯一键，避免重复添加
                const key = `${i}:${segment.length}`;
                
                if (!seen.has(key)) {
                    matches.push({ text: segment, position: i });
                    seen.add(key);
                }
            }
        }
        
        // 方法2：按句子分割（增强版）
        // 使用更复杂的分隔符来识别句子边界
        const sentences = content.split(/[.!?。！？;；:\n\r]+/);
        let position = 0;
        
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            // 只处理长度合适的句子
            if (trimmed.length >= minWindowSize && trimmed.length <= maxWindowSize * 2) {
                // 查找句子在原文中的精确位置
                position = content.indexOf(trimmed, position);
                if (position !== -1) {
                    const key = `${position}:${trimmed.length}`;
                    if (!seen.has(key)) {
                        matches.push({ text: trimmed, position });
                        seen.add(key);
                    }
                    position += trimmed.length;
                }
            }
        }
        
        return matches;
    }
}

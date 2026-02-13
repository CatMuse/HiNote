import { App, TFile } from "obsidian";
import { HighlightExtractor } from './HighlightExtractor';

/**
 * 高亮批量操作
 * 职责：
 * 1. 批量删除高亮标记（从文件中移除高亮格式）
 * 2. 从内容中移除单个高亮标记
 */
export class HighlightBatchOps {
    // 批量删除相关常量
    private static readonly POSITION_SEARCH_OFFSET_BEFORE = 10; // 位置搜索前偏移量
    private static readonly POSITION_SEARCH_OFFSET_AFTER = 50; // 位置搜索后偏移量

    constructor(
        private app: App,
        private extractor: HighlightExtractor
    ) {}

    /**
     * 批量删除高亮标记（从文件中移除高亮格式）
     * 这个方法会一次性处理多个高亮的删除，避免多次文件读写
     * 
     * @param highlights 要删除的高亮数组
     * @returns Promise<{ success: number, failed: number }> 返回成功和失败的数量
     */
    public async batchRemoveHighlightMarks(highlights: Array<{ text: string; position?: number; filePath: string; originalLength?: number }>): Promise<{ success: number; failed: number }> {
        let successCount = 0;
        let failedCount = 0;
        
        // 按文件分组
        const highlightsByFile = new Map<string, typeof highlights>();
        for (const highlight of highlights) {
            if (!highlightsByFile.has(highlight.filePath)) {
                highlightsByFile.set(highlight.filePath, []);
            }
            highlightsByFile.get(highlight.filePath)!.push(highlight);
        }
        
        // 对每个文件处理其所有高亮
        for (const [filePath, fileHighlights] of highlightsByFile) {
            try {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!file || !(file instanceof TFile)) {
                    failedCount += fileHighlights.length;
                    continue;
                }
                
                // 按位置从后往前排序，这样删除时不会影响前面高亮的位置
                const sortedHighlights = [...fileHighlights].sort((a, b) => {
                    const posA = a.position ?? Infinity;
                    const posB = b.position ?? Infinity;
                    return posB - posA; // 降序
                });
                
                // 使用 vault.process() 原子性地修改文件内容
                // 这会正确同步已打开的编辑器视图，不会导致编辑器状态重置或焦点丢失
                await this.app.vault.process(file, (content) => {
                    // 依次删除每个高亮（从后往前）
                    for (const highlight of sortedHighlights) {
                        try {
                            content = this.removeHighlightMarkFromContent(content, highlight);
                            successCount++;
                        } catch (error) {
                            failedCount++;
                        }
                    }
                    return content;
                });
                
            } catch (error) {
                failedCount += fileHighlights.length;
            }
        }
        
        return { success: successCount, failed: failedCount };
    }
    
    /**
     * 从内容中移除单个高亮标记
     * 
     * @param content 文件内容
     * @param highlight 高亮信息
     * @returns 移除高亮后的内容
     */
    private removeHighlightMarkFromContent(
        content: string, 
        highlight: { text: string; position?: number; originalLength?: number }
    ): string {
        const escapedText = this.extractor.escapeRegExp(highlight.text);
        
        // 如果有位置信息，尝试精确定位
        if (typeof highlight.position === 'number') {
            const position = highlight.position;
            const highlightText = highlight.text;
            
            // 尝试多种高亮格式
            const possibleFormats = [
                `==${highlightText}==`,
                `== ${highlightText} ==`,
                `<mark>${highlightText}</mark>`,
                `<span class="highlight">${highlightText}</span>`
            ];
            
            // 在位置附近查找匹配
            for (const format of possibleFormats) {
                const startPos = Math.max(0, position - HighlightBatchOps.POSITION_SEARCH_OFFSET_BEFORE);
                const endPos = Math.min(content.length, position + highlightText.length + HighlightBatchOps.POSITION_SEARCH_OFFSET_AFTER);
                const searchRange = content.substring(startPos, endPos);
                
                if (searchRange.includes(format)) {
                    // 找到匹配，替换为纯文本
                    const beforeMatch = content.substring(0, startPos);
                    const afterMatch = content.substring(endPos);
                    const replacedRange = searchRange.replace(format, highlightText);
                    return beforeMatch + replacedRange + afterMatch;
                }
            }
        }
        
        // 如果没有位置信息或精确定位失败，使用正则表达式全局查找
        // 注意：这里只替换第一个匹配，避免误删其他相同文本
        const patterns = [
            new RegExp(`==\\s*(${escapedText})\\s*==`),
            new RegExp(`<mark[^>]*>(${escapedText})</mark>`),
            new RegExp(`<span[^>]*class="highlight"[^>]*>(${escapedText})</span>`)
        ];
        
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                return content.replace(pattern, highlight.text);
            }
        }
        
        // 如果都没找到，返回原内容（可能高亮已被手动删除）
        return content;
    }
}

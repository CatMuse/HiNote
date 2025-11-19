/**
 * 高亮正则工具类
 * 提供高亮格式的正则匹配和替换功能
 */
export class HighlightRegexUtils {
    /**
     * 转义正则表达式中的特殊字符
     */
    static escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    /**
     * 移除文本中的高亮格式，保留纯文本
     * @param content 文件内容
     * @param highlightText 要移除格式的高亮文本
     * @param customRegex 自定义正则表达式（可选）
     * @returns 移除格式后的内容
     */
    static removeHighlightFormat(
        content: string,
        highlightText: string,
        customRegex?: string
    ): string {
        const escapedText = this.escapeRegExp(highlightText);
        let newContent = content;
        let replaced = false;
        
        // 1. 尝试标准的 Markdown 高亮格式 ==text==
        const markdownHighlightRegex = new RegExp(`==\\s*(${escapedText})\\s*==`, 'g');
        const mdResult = newContent.replace(markdownHighlightRegex, highlightText);
        if (mdResult !== newContent) {
            newContent = mdResult;
            replaced = true;
        }
        
        // 2. 尝试 <mark>text</mark> 格式
        if (!replaced) {
            const markTagRegex = new RegExp(`<mark[^>]*>(${escapedText})</mark>`, 'g');
            const markResult = newContent.replace(markTagRegex, highlightText);
            if (markResult !== newContent) {
                newContent = markResult;
                replaced = true;
            }
        }
        
        // 3. 尝试 <span>text</span> 格式
        if (!replaced) {
            const spanTagRegex = new RegExp(`<span[^>]*>(${escapedText})</span>`, 'g');
            const spanResult = newContent.replace(spanTagRegex, highlightText);
            if (spanResult !== newContent) {
                newContent = spanResult;
                replaced = true;
            }
        }
        
        // 4. 如果提供了自定义正则表达式，尝试使用
        if (!replaced && customRegex) {
            try {
                const customRegexObj = new RegExp(customRegex, 'g');
                const customResult = newContent.replace(customRegexObj, (match, ...groups) => {
                    // 检查匹配的文本是否包含我们要查找的高亮文本
                    for (const group of groups) {
                        if (typeof group === 'string' && group.includes(highlightText)) {
                            return highlightText;
                        }
                    }
                    return match; // 如果没有找到匹配的组，保持原样
                });
                
                if (customResult !== newContent) {
                    newContent = customResult;
                    replaced = true;
                }
            } catch (error) {
                console.error('自定义正则表达式错误:', error);
            }
        }
        
        return newContent;
    }
    
    /**
     * 在指定范围内移除高亮格式
     * @param content 文件内容
     * @param highlightText 要移除格式的高亮文本
     * @param startPos 开始位置
     * @param endPos 结束位置
     * @param customRegex 自定义正则表达式（可选）
     * @returns 移除格式后的内容
     */
    static removeHighlightFormatInRange(
        content: string,
        highlightText: string,
        startPos: number,
        endPos: number,
        customRegex?: string
    ): string {
        // 定义搜索范围（前后各扩展100个字符）
        const searchStart = Math.max(0, startPos - 100);
        const searchEnd = Math.min(content.length, endPos + 100);
        const searchRange = content.substring(searchStart, searchEnd);
        
        // 在搜索范围内移除高亮格式
        const processedRange = this.removeHighlightFormat(searchRange, highlightText, customRegex);
        
        // 如果有变化，替换原内容
        if (processedRange !== searchRange) {
            return content.substring(0, searchStart) + processedRange + content.substring(searchEnd);
        }
        
        return content;
    }
    
    /**
     * 获取常用的高亮格式正则表达式列表
     */
    static getCommonHighlightPatterns(text: string): RegExp[] {
        const escapedText = this.escapeRegExp(text);
        return [
            new RegExp(`==\\s*(${escapedText})\\s*==`, 'g'),      // ==text==
            new RegExp(`<mark[^>]*>(${escapedText})</mark>`, 'g'), // <mark>text</mark>
            new RegExp(`<span[^>]*>(${escapedText})</span>`, 'g')  // <span>text</span>
        ];
    }
}

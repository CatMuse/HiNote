/**
 * 统一的ID生成工具类
 * 确保同一内容总是生成相同的ID，避免重复和不一致
 */
export class IdGenerator {
    /**
     * 生成高亮ID
     * 基于文件路径、位置和文本内容生成稳定的ID
     * @param filePath 文件路径
     * @param position 位置
     * @param text 高亮文本
     * @returns 稳定的高亮ID
     */
    static generateHighlightId(filePath: string, position: number, text: string): string {
        // 使用文件路径、位置和文本内容生成稳定的哈希
        const content = `${filePath}:${position}:${text}`;
        const hash = this.hashCode(content);
        return `highlight-${Math.abs(hash)}-${position}`;
    }

    /**
     * 生成批注ID
     * @returns 唯一的批注ID
     */
    static generateCommentId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `comment-${timestamp}-${random}`;
    }

    /**
     * 生成闪卡ID
     * @returns 唯一的闪卡ID
     */
    static generateCardId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        return `card-${timestamp}-${random}`;
    }

    /**
     * 生成分组ID
     * @returns 唯一的分组ID
     */
    static generateGroupId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 7);
        return `group-${timestamp}-${random}`;
    }

    /**
     * 简单的字符串哈希函数
     * @param str 要哈希的字符串
     * @returns 哈希值
     */
    private static hashCode(str: string): number {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        
        return hash;
    }

    /**
     * 检查是否为有效的高亮ID格式
     * @param id 要检查的ID
     * @returns 是否为有效格式
     */
    static isValidHighlightId(id: string): boolean {
        return /^highlight-\d+-\d+$/.test(id);
    }

    /**
     * 检查是否为有效的批注ID格式
     * @param id 要检查的ID
     * @returns 是否为有效格式
     */
    static isValidCommentId(id: string): boolean {
        return /^comment-\d+-[a-z0-9]+$/.test(id);
    }

    /**
     * 检查是否为有效的闪卡ID格式
     * @param id 要检查的ID
     * @returns 是否为有效格式
     */
    static isValidCardId(id: string): boolean {
        return /^card-\d+-[a-z0-9]+$/.test(id);
    }

    /**
     * 从高亮ID中提取位置信息
     * @param highlightId 高亮ID
     * @returns 位置信息，如果无法提取则返回null
     */
    static extractPositionFromHighlightId(highlightId: string): number | null {
        const match = highlightId.match(/^highlight-\d+-(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
    }
}

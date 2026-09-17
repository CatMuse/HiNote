/** Independent saved IDs and deterministic, temporary scan keys. */
export class IdGenerator {
    private static sequence = 0;

    static generateHighlightRecordId(): string {
        const uuid = globalThis.crypto?.randomUUID?.();
        if (uuid) return `highlight-${uuid}`;
        // Older embedded browsers may lack randomUUID. No Node dependency.
        const random = globalThis.crypto?.getRandomValues
            ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-')
            : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        return `highlight-${Date.now().toString(36)}-${++this.sequence}-${random}`;
    }

    static generateScanKey(filePath: string, position: number, text: string): string {
        return `scan-${encodeURIComponent(filePath)}:${position}:${Math.abs(this.hashCode(text))}`;
    }

    /**
     * 生成批注ID
     * @returns 唯一的批注ID
     */
    static generateCommentId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 11);
        return `comment-${timestamp}-${random}`;
    }

    /**
     * 生成闪卡ID
     * @returns 唯一的闪卡ID
     */
    static generateCardId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 11);
        return `card-${timestamp}-${random}`;
    }

    /**
     * 生成分组ID
     * @returns 唯一的分组ID
     */
    static generateGroupId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 9);
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
        return /^highlight-[a-z0-9-]+$/i.test(id);
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

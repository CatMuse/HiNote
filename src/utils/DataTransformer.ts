import { HighlightInfo, CommentItem } from '../types';

/**
 * 数据转换工具类
 * 统一处理 HighlightInfo 相关的数据转换逻辑
 */
export class DataTransformer {
    /**
     * 确保 HighlightInfo 对象包含所有必填字段
     * 用于从旧数据或不完整数据创建完整的 HighlightInfo 对象
     */
    static ensureHighlightInfo(partial: Partial<HighlightInfo>): HighlightInfo {
        const now = Date.now();
        
        return {
            // 必填字段：提供默认值
            id: partial.id || this.generateId(),
            text: partial.text || '',
            createdAt: partial.createdAt || now,
            updatedAt: partial.updatedAt || now,
            comments: partial.comments || [],
            position: partial.position ?? 0,
            
            // 可选字段：保留原值
            paragraphOffset: partial.paragraphOffset,
            blockId: partial.blockId,
            paragraphId: partial.paragraphId,
            filePath: partial.filePath,
            fileName: partial.fileName,
            fileIcon: partial.fileIcon,
            fileType: partial.fileType,
            backgroundColor: partial.backgroundColor,
            displayText: partial.displayText,
            originalLength: partial.originalLength,
            isVirtual: partial.isVirtual,
            isCloze: partial.isCloze,
            isGlobalSearch: partial.isGlobalSearch,
            isFromCanvas: partial.isFromCanvas,
            canvasSource: partial.canvasSource,
            timestamp: partial.timestamp,
        };
    }

    /**
     * 批量转换：确保数组中的所有对象都是完整的 HighlightInfo
     */
    static ensureHighlightInfoArray(partials: Partial<HighlightInfo>[]): HighlightInfo[] {
        return partials.map(partial => this.ensureHighlightInfo(partial));
    }

    /**
     * 更新 HighlightInfo 的 updatedAt 时间戳
     */
    static touchHighlight(highlight: HighlightInfo): HighlightInfo {
        return {
            ...highlight,
            updatedAt: Date.now(),
        };
    }

    /**
     * 为 HighlightInfo 添加评论
     */
    static addComment(highlight: HighlightInfo, content: string): HighlightInfo {
        const now = Date.now();
        const newComment: CommentItem = {
            id: this.generateId(),
            content,
            createdAt: now,
            updatedAt: now,
        };

        return {
            ...highlight,
            comments: [...highlight.comments, newComment],
            updatedAt: now,
        };
    }

    /**
     * 更新 HighlightInfo 中的评论
     */
    static updateComment(
        highlight: HighlightInfo,
        commentId: string,
        content: string
    ): HighlightInfo {
        const now = Date.now();
        const updatedComments = highlight.comments.map(comment =>
            comment.id === commentId
                ? { ...comment, content, updatedAt: now }
                : comment
        );

        return {
            ...highlight,
            comments: updatedComments,
            updatedAt: now,
        };
    }

    /**
     * 删除 HighlightInfo 中的评论
     */
    static deleteComment(highlight: HighlightInfo, commentId: string): HighlightInfo {
        return {
            ...highlight,
            comments: highlight.comments.filter(comment => comment.id !== commentId),
            updatedAt: Date.now(),
        };
    }

    /**
     * 合并两个 HighlightInfo 对象（用于数据迁移或更新）
     * 新数据优先，但保留旧数据中的非空字段
     */
    static mergeHighlightInfo(
        oldData: Partial<HighlightInfo>,
        newData: Partial<HighlightInfo>
    ): HighlightInfo {
        return this.ensureHighlightInfo({
            ...oldData,
            ...newData,
            // 特殊处理：合并评论数组
            comments: newData.comments || oldData.comments || [],
            // 保留较早的创建时间
            createdAt: oldData.createdAt || newData.createdAt,
            // 使用较新的更新时间
            updatedAt: newData.updatedAt || oldData.updatedAt,
        });
    }

    /**
     * 从 HighlightInfo 提取用于显示的摘要信息
     */
    static toDisplaySummary(highlight: HighlightInfo): {
        id: string;
        text: string;
        commentCount: number;
        fileName?: string;
        createdAt: number;
    } {
        return {
            id: highlight.id,
            text: highlight.displayText || highlight.text,
            commentCount: highlight.comments.length,
            fileName: highlight.fileName,
            createdAt: highlight.createdAt,
        };
    }

    /**
     * 验证 HighlightInfo 对象是否有效
     */
    static isValidHighlight(highlight: any): highlight is HighlightInfo {
        return (
            typeof highlight === 'object' &&
            highlight !== null &&
            typeof highlight.id === 'string' &&
            typeof highlight.text === 'string' &&
            typeof highlight.createdAt === 'number' &&
            typeof highlight.updatedAt === 'number' &&
            Array.isArray(highlight.comments) &&
            typeof highlight.position === 'number'
        );
    }

    /**
     * 生成唯一ID（简单实现，可根据需要替换）
     */
    private static generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 清理 HighlightInfo 对象，移除未定义的可选字段
     * 用于序列化前的数据清理
     */
    static cleanHighlightInfo(highlight: HighlightInfo): HighlightInfo {
        const cleaned: any = {
            id: highlight.id,
            text: highlight.text,
            createdAt: highlight.createdAt,
            updatedAt: highlight.updatedAt,
            comments: highlight.comments,
            position: highlight.position,
        };

        // 只添加已定义的可选字段
        if (highlight.paragraphOffset !== undefined) cleaned.paragraphOffset = highlight.paragraphOffset;
        if (highlight.blockId !== undefined) cleaned.blockId = highlight.blockId;
        if (highlight.paragraphId !== undefined) cleaned.paragraphId = highlight.paragraphId;
        if (highlight.filePath !== undefined) cleaned.filePath = highlight.filePath;
        if (highlight.fileName !== undefined) cleaned.fileName = highlight.fileName;
        if (highlight.fileIcon !== undefined) cleaned.fileIcon = highlight.fileIcon;
        if (highlight.fileType !== undefined) cleaned.fileType = highlight.fileType;
        if (highlight.backgroundColor !== undefined) cleaned.backgroundColor = highlight.backgroundColor;
        if (highlight.displayText !== undefined) cleaned.displayText = highlight.displayText;
        if (highlight.originalLength !== undefined) cleaned.originalLength = highlight.originalLength;
        if (highlight.isVirtual !== undefined) cleaned.isVirtual = highlight.isVirtual;
        if (highlight.isCloze !== undefined) cleaned.isCloze = highlight.isCloze;
        if (highlight.isGlobalSearch !== undefined) cleaned.isGlobalSearch = highlight.isGlobalSearch;
        if (highlight.isFromCanvas !== undefined) cleaned.isFromCanvas = highlight.isFromCanvas;
        if (highlight.canvasSource !== undefined) cleaned.canvasSource = highlight.canvasSource;
        if (highlight.timestamp !== undefined) cleaned.timestamp = highlight.timestamp;

        return cleaned as HighlightInfo;
    }

    /**
     * 批量清理
     */
    static cleanHighlightInfoArray(highlights: HighlightInfo[]): HighlightInfo[] {
        return highlights.map(h => this.cleanHighlightInfo(h));
    }
}

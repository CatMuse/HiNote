import { HighlightInfo as HiNote, CommentItem } from '../types/highlight';

/**
 * 新的优化数据格式
 */
export interface OptimizedHighlightData {
    version: string;
    lastModified: number;
    highlights: {
        [id: string]: OptimizedHighlight;
    };
}

export interface OptimizedHighlight {
    text: string;
    position: number;
    created: number;
    updated: number;
    backgroundColor?: string;
    syntax?: HiNote['syntax'];
    blockId?: string;
    isCloze?: boolean;
    isVirtual?: boolean;
    paragraphOffset?: number;
    contextBefore?: string;
    contextAfter?: string;
    textFingerprint?: string;
    comments?: OptimizedComment[];
}

export interface OptimizedComment {
    id: string;
    content: string;
    created: number;
    updated: number;
}

export interface FileMappingData {
    version: string;
    mapping: { [originalPath: string]: string };
    lastUpdated: number;
}

/**
 * 转换为旧格式（保持兼容性）
 */
export function convertToLegacyHighlight(
    id: string,
    highlight: OptimizedHighlight,
    filePath: string
): HiNote {
    return {
        id,
        text: highlight.text,
        position: highlight.position,
        createdAt: highlight.created,
        updatedAt: highlight.updated,
        filePath,
        backgroundColor: highlight.backgroundColor,
        syntax: highlight.syntax,
        blockId: highlight.blockId,
        isCloze: highlight.isCloze || false,
        isVirtual: highlight.isVirtual || false,
        paragraphOffset: highlight.paragraphOffset,
        contextBefore: highlight.contextBefore,
        contextAfter: highlight.contextAfter,
        textFingerprint: highlight.textFingerprint,
        comments: highlight.comments?.map(comment => ({
            id: comment.id,
            content: comment.content,
            createdAt: comment.created,
            updatedAt: comment.updated
        })) || []
    };
}

/**
 * 转换为优化格式
 */
export function convertToOptimizedHighlight(highlight: HiNote): OptimizedHighlight {
    const now = Date.now();
    const optimized: OptimizedHighlight = {
        text: highlight.text,
        position: highlight.position,
        created: highlight.createdAt ?? now,
        updated: highlight.updatedAt ?? now
    };

    if (highlight.backgroundColor) {
        optimized.backgroundColor = highlight.backgroundColor;
    }
    if (highlight.syntax) optimized.syntax = highlight.syntax;

    if (highlight.blockId) {
        optimized.blockId = highlight.blockId;
    }

    if (highlight.isCloze) {
        optimized.isCloze = highlight.isCloze;
    }

    if (highlight.isVirtual) {
        optimized.isVirtual = highlight.isVirtual;
    }

    if (highlight.paragraphOffset !== undefined) {
        optimized.paragraphOffset = highlight.paragraphOffset;
    }

    if (highlight.contextBefore) {
        optimized.contextBefore = highlight.contextBefore;
    }

    if (highlight.contextAfter) {
        optimized.contextAfter = highlight.contextAfter;
    }

    if (highlight.textFingerprint) {
        optimized.textFingerprint = highlight.textFingerprint;
    }

    if (highlight.comments && highlight.comments.length > 0) {
        optimized.comments = highlight.comments.map((comment: CommentItem) => ({
            id: comment.id,
            content: comment.content,
            created: comment.createdAt,
            updated: comment.updatedAt
        }));
    }

    return optimized;
}

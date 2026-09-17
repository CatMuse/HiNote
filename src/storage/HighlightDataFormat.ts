import { assertHighlightRecord } from '../models/HighlightModels';
import { HighlightRecord as HiNote, CommentItem } from '../types/highlight';

/**
 * Existing v2 disk format. Kept compatible with previously released records.
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
 * Decode v2 records without changing their IDs or requiring an on-disk migration.
 */
export function decodeHighlightRecord(
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
        kind: highlight.isVirtual ? 'file-comment' : 'highlight',
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
 * Encode only persisted fields; view flags and scan keys are never written.
 */
export function encodeHighlightRecord(highlight: HiNote): OptimizedHighlight {
    assertHighlightRecord(highlight);
    const optimized: OptimizedHighlight = {
        text: highlight.text,
        position: highlight.position,
        created: highlight.createdAt,
        updated: highlight.updatedAt
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

    if (highlight.kind === 'file-comment') {
        optimized.isVirtual = true;
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

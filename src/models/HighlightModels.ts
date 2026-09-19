import {
    HIGHLIGHT_SOURCE, isFileComment,
    type HighlightContent, type HighlightInfo, type HighlightRecord, type ScannedHighlight
} from '../types/highlight';

/** Explicit projection: view flags and scan keys never enter the repository. */
export function copyHighlightContent(source: HighlightContent): HighlightContent {
    return {
        text: source.text, position: source.position,
        syntax: source.syntax, backgroundColor: source.backgroundColor,
        contextBefore: source.contextBefore, contextAfter: source.contextAfter,
        textFingerprint: source.textFingerprint, blockId: source.blockId,
        paragraphOffset: source.paragraphOffset,
        isCloze: source.isCloze
    };
}

export function createHighlightRecord(
    view: HighlightInfo, id: string, filePath: string, now: number, previous?: HighlightRecord
): HighlightRecord {
    return {
        ...copyHighlightContent(view),
        id, filePath,
        kind: isFileComment(view) ? 'file-comment' : 'highlight',
        createdAt: previous?.createdAt ?? now,
        favoritedAt: previous?.favoritedAt,
        updatedAt: now,
        comments: (view.comments || []).map(comment => ({ ...comment }))
    };
}

export function recordToHighlightView(record: HighlightRecord): HighlightInfo & Required<Pick<HighlightInfo, 'id' | 'recordId' | 'comments'>> {
    return {
        ...copyHighlightContent(record),
        id: record.id, recordId: record.id, kind: record.kind,
        createdAt: record.createdAt, updatedAt: record.updatedAt, favoritedAt: record.favoritedAt,
        comments: record.comments.map(comment => ({ ...comment })),
        filePath: record.filePath,
        fileName: record.filePath.split('/').pop()?.replace(/\.md$/, ''),
        fileIcon: 'file-text'
    };
}

export function scanToHighlightView(scan: ScannedHighlight, record?: HighlightRecord): HighlightInfo {
    return {
        ...copyHighlightContent(scan), originalLength: scan.originalLength,
        blockId: scan.blockId ?? record?.blockId,
        paragraphOffset: scan.paragraphOffset ?? record?.paragraphOffset,
        id: record?.id || scan.scanKey, recordId: record?.id, scanKey: scan.scanKey,
        kind: 'highlight', [HIGHLIGHT_SOURCE]: scan,
        createdAt: record?.createdAt, updatedAt: record?.updatedAt, favoritedAt: record?.favoritedAt,
        comments: (record?.comments || []).map(comment => ({ ...comment })),
        filePath: scan.filePath,
        fileName: scan.filePath.split('/').pop()?.replace(/\.md$/, ''),
        fileIcon: 'file-text'
    };
}

export function getHighlightSource(view: HighlightInfo | ScannedHighlight): ScannedHighlight | undefined {
    return (view as HighlightInfo)[HIGHLIGHT_SOURCE] ||
        ('scanKey' in view && !('comments' in view) && !view.id ? view as ScannedHighlight : undefined);
}

/** A detached repository snapshot; never retain a caller's UI object. */
export function copyHighlightRecord(record: HighlightRecord): HighlightRecord {
    assertHighlightRecord(record);
    return {
        ...copyHighlightContent(record), id: record.id, kind: record.kind,
        filePath: record.filePath, createdAt: record.createdAt, updatedAt: record.updatedAt, favoritedAt: record.favoritedAt,
        comments: record.comments.map(comment => ({ ...comment }))
    };
}

/** JS callers and test adapters must respect the same boundary as TypeScript. */
export function assertHighlightRecord(record: HighlightRecord): void {
    if (!record.id || typeof record.id !== 'string' ||
        (record.kind !== 'highlight' && record.kind !== 'file-comment') ||
        (record.favoritedAt !== undefined && (!Number.isFinite(record.favoritedAt) || record.favoritedAt <= 0)) ||
        !Number.isFinite(record.createdAt) || !Number.isFinite(record.updatedAt) ||
        !Array.isArray(record.comments) || 'scanKey' in record || 'recordId' in record || 'isDraft' in record || HIGHLIGHT_SOURCE in record) {
        throw new Error('Cannot save a scan or view as a highlight record.');
    }
}

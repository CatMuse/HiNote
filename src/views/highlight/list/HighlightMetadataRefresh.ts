import type { HighlightInfo } from '../../../types/highlight';

// Source offsets and scan IDs can change when an earlier color marker changes length.
const SOURCE_FIELDS = new Set([
    'id', 'scanKey', 'position', 'originalLength', 'paragraphOffset', 'blockId',
    'favoritedAt', 'contextBefore', 'contextAfter', 'textFingerprint', 'backgroundColor', 'syntax', 'updatedAt'
]);

function presentation(row: HighlightInfo): string {
    return JSON.stringify(Object.entries(row).filter(([key]) => !SOURCE_FIELDS.has(key))
        .sort(([a], [b]) => a.localeCompare(b)));
}

/** Keep row references used by cards, selection, and pagination; never patch partial matches. */
export function refreshHighlightMetadata(previous: HighlightInfo[], next: HighlightInfo[]): boolean {
    if (previous.length !== next.length || previous.some((row, index) => presentation(row) !== presentation(next[index]))) {
        return false;
    }
    previous.forEach((row, index) => {
        for (const key of Object.keys(row)) {
            if (!(key in next[index])) delete (row as unknown as Record<string, unknown>)[key];
        }
        Object.assign(row, next[index]);
    });
    return true;
}

import type { HighlightContent } from '../types/highlight';

export const ANCHOR_KEYS = [
    'text', 'position', 'syntax', 'backgroundColor',
    'contextBefore', 'contextAfter', 'textFingerprint', 'blockId', 'paragraphOffset'
] as const;
export type HighlightAnchor = Pick<HighlightContent, typeof ANCHOR_KEYS[number]>;
export interface HighlightAnchorPatch {
    id: string;
    expected: HighlightAnchor;
    anchor: HighlightAnchor;
}
export function getHighlightAnchor(record: HighlightContent): HighlightAnchor {
    return {
        text: record.text,
        position: record.position,
        syntax: record.syntax,
        backgroundColor: record.backgroundColor,
        contextBefore: record.contextBefore,
        contextAfter: record.contextAfter,
        textFingerprint: record.textFingerprint,
        blockId: record.blockId,
        paragraphOffset: record.paragraphOffset
    };
}
export function sameHighlightAnchor(a: HighlightAnchor, b: HighlightAnchor): boolean {
    return ANCHOR_KEYS.every(key => a[key] === b[key]);
}

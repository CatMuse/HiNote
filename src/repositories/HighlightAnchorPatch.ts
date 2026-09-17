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
    return Object.fromEntries(ANCHOR_KEYS.map(key => [key, record[key]])) as unknown as HighlightAnchor;
}
export function sameHighlightAnchor(a: HighlightAnchor, b: HighlightAnchor): boolean {
    return ANCHOR_KEYS.every(key => a[key] === b[key]);
}

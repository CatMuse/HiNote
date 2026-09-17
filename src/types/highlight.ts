export interface CommentItem {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

/** Content and anchors shared by scans, records and views; no identity here. */
export interface HighlightContent {
    text: string;
    position: number;
    paragraphOffset?: number;
    blockId?: string;
    contextBefore?: string;
    contextAfter?: string;
    textFingerprint?: string;
    backgroundColor?: string;
    syntax?: 'markdown' | 'html' | 'custom';
    isCloze?: boolean;
}

/** A source occurrence for this scan. Never saved directly. */
export interface ScannedHighlight extends HighlightContent {
    scanKey: string;
    originalLength: number;
    filePath: string;
    id?: never;
}

export type HighlightRecordKind = 'highlight' | 'file-comment';

/** Repository data. File paths come from the mapping; UI state is excluded. */
export interface HighlightRecord extends HighlightContent {
    id: string;
    kind: HighlightRecordKind;
    filePath: string;
    createdAt: number;
    updatedAt: number;
    comments: CommentItem[];
}

// Object spreads preserve this reference; JSON/DOM snapshots never include it.
export const HIGHLIGHT_SOURCE = Symbol('HiNote source occurrence');

/** UI data. `id` is a card key; only `recordId` identifies saved data. */
export interface HighlightView extends HighlightContent {
    id?: string;
    recordId?: string;
    scanKey?: string;
    originalLength?: number;
    kind?: HighlightRecordKind;
    readonly [HIGHLIGHT_SOURCE]?: ScannedHighlight;
    createdAt?: number;
    updatedAt?: number;
    comments?: CommentItem[];
    filePath?: string;
    fileName?: string;
    fileIcon?: string;
    isVirtual?: boolean;
    isGlobalSearch?: boolean;
    isFromCanvas?: boolean;
    canvasSource?: string;
}

/** Existing UI imports keep their name while storage/scanning use strict types. */
export type HighlightInfo = HighlightView;

export function isFileComment(record: { kind?: HighlightRecordKind; isVirtual?: boolean }): boolean {
    return record.kind === 'file-comment' || record.isVirtual === true;
}

export interface RegexRule {
    id: string;
    name: string;
    pattern: string;
    color: string;
    enabled: boolean;
}

export interface HighlightSettings {
    export: {
        exportPath: string;
        exportTemplate?: string;
    };
    excludePatterns: string;
    useCustomPattern: boolean;
    regexRules: RegexRule[];
}

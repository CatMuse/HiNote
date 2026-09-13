export interface CommentItem {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

export interface HighlightInfo {
    id?: string;
    text: string;
    position: number;
    createdAt?: number;
    updatedAt?: number;
    comments?: CommentItem[];

    paragraphOffset?: number;
    blockId?: string;
    contextBefore?: string;
    contextAfter?: string;
    textFingerprint?: string;

    filePath?: string;
    fileName?: string;
    fileIcon?: string;

    backgroundColor?: string;
    /** Distinguishes normalized Markdown text from legacy text containing a color marker. */
    syntax?: 'markdown' | 'html' | 'custom';
    originalLength?: number;

    isVirtual?: boolean;
    isCloze?: boolean;
    isGlobalSearch?: boolean;
    isFromCanvas?: boolean;
    canvasSource?: string;
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

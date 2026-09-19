import { App, TFile } from 'obsidian';
import { isFileComment, type HighlightInfo } from '../../types/highlight';

export const DEFAULT_MAX_FILE_CONTEXT_CHARS = 12000;

export interface AnnotationContext {
    kind: 'highlight' | 'file-comment';
    sourcePath: string;
    sourceName: string;
    primaryText: string;
    comments: string[];
    sourceContent?: string;
    sourceContentTruncated?: boolean;
}

/** Resolves UI highlight views into meaningful source context for exports and AI. */
export class AnnotationContextResolver {
    constructor(
        private app: App,
        private maxFileContextChars: number = DEFAULT_MAX_FILE_CONTEXT_CHARS
    ) {}

    async resolve(highlight: HighlightInfo): Promise<AnnotationContext> {
        const sourcePath = highlight.filePath || '';
        const sourceName = highlight.fileName || sourcePath.split('/').pop() || 'Untitled';
        const comments = (highlight.comments || [])
            .map(comment => comment.content.trim())
            .filter(Boolean);

        if (!isFileComment(highlight)) {
            return {
                kind: 'highlight',
                sourcePath,
                sourceName,
                primaryText: highlight.text || '',
                comments
            };
        }

        const file = sourcePath ? this.app.vault.getAbstractFileByPath(sourcePath) : null;
        if (!(file instanceof TFile)) {
            return {
                kind: 'file-comment',
                sourcePath,
                sourceName,
                primaryText: '',
                comments
            };
        }

        let fullContent = '';
        try {
            fullContent = await this.app.vault.read(file);
        } catch (error) {
            console.warn('[HiNote] Unable to read file-comment source context:', error);
        }
        const sourceContentTruncated = fullContent.length > this.maxFileContextChars;
        const sourceContent = sourceContentTruncated
            ? `${fullContent.slice(0, this.maxFileContextChars)}\n\n[Source truncated]`
            : fullContent;

        return {
            kind: 'file-comment',
            sourcePath,
            sourceName,
            primaryText: sourceContent,
            comments,
            sourceContent,
            sourceContentTruncated
        };
    }

    formatForAI(context: AnnotationContext): string {
        if (context.kind === 'highlight') return context.primaryText;

        const comments = context.comments.length
            ? `\n\nFile comments:\n${context.comments.map(comment => `- ${comment}`).join('\n')}`
            : '';
        const truncation = context.sourceContentTruncated ? '\n\nNote: the source content was truncated.' : '';
        return `Source file: ${context.sourceName}\n\nSource content:\n${context.primaryText}${comments}${truncation}`;
    }
}

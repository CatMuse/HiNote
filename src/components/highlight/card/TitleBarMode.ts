import { isFileComment, type HighlightInfo } from '../../../types/highlight';

export type HighlightTitleMode = 'file' | 'file-comment' | 'line';

/** Resolves title content before the renderer adds icons and interactions. */
export function resolveHighlightTitleMode(
    highlight: HighlightInfo,
    fileName: string | undefined,
    isInMainView: boolean
): HighlightTitleMode {
    if ((isInMainView || highlight.isGlobalSearch) && fileName) {
        return 'file';
    }
    if (isFileComment(highlight)) {
        return 'file-comment';
    }
    return 'line';
}

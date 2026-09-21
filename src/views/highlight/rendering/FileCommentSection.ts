import type { HighlightInfo } from '../../../types/highlight';

interface FileCommentSectionOptions {
    comments: HighlightInfo[];
    renderCard: (container: HTMLElement, comment: HighlightInfo) => void;
}

/** Keeps the newest file-level annotations first without mutating view state. */
export function sortFileCommentsByNewest(comments: HighlightInfo[]): HighlightInfo[] {
    return [...comments].sort((left, right) => {
        const leftTime = left.createdAt ?? left.updatedAt ?? 0;
        const rightTime = right.createdAt ?? right.updatedAt ?? 0;
        return rightTime - leftTime;
    });
}

/** Renders file-level comments outside the highlight masonry. */
export function renderFileCommentSection(
    container: HTMLElement,
    options: FileCommentSectionOptions
): void {
    if (options.comments.length === 0) return;
    const hasOpenDraft = options.comments.some(comment => comment.isDraft && !comment.recordId);
    const sectionClasses = `file-comment-section${hasOpenDraft ? ' has-open-file-comment-draft' : ''}`;
    const section = container.createDiv({
        cls: sectionClasses
    });

    const cards = section.createDiv({ cls: 'file-comment-cards' });
    sortFileCommentsByNewest(options.comments).forEach(comment => options.renderCard(cards, comment));
}

import { setIcon } from 'obsidian';
import { t } from '../../../i18n';
import type { HighlightInfo } from '../../../types/highlight';

interface FileCommentSectionOptions {
    comments: HighlightInfo[];
    onAdd: () => void;
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
    const hasOpenDraft = options.comments.some(comment => comment.isDraft && !comment.recordId);
    const sectionClasses = `file-comment-section${hasOpenDraft ? ' has-open-file-comment-draft' : ''}`;
    const section = container.createDiv({
        cls: sectionClasses
    });

    const addButton = section.createEl('button', {
        cls: 'file-comment-add-button',
        attr: {
            type: 'button',
            'aria-label': t('Add File Comment')
        }
    });
    const icon = addButton.createSpan({ cls: 'highlight-card-icon' });
    setIcon(icon, 'message-square-plus');
    addButton.createSpan({ cls: 'highlight-card-title-text', text: t('Add File Comment') });
    addButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        options.onAdd();
    });

    if (options.comments.length === 0) return;

    const cards = section.createDiv({ cls: 'file-comment-cards' });
    sortFileCommentsByNewest(options.comments).forEach(comment => options.renderCard(cards, comment));
}

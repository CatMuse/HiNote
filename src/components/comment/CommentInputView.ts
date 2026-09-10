import { CommentItem } from "../../types/highlight";
import { CommentInputActionBar } from "./CommentInputActionBar";

export interface CommentInputEditContext {
    contentEl?: HTMLElement;
    footer?: Element;
}

export interface RenderedCommentInput {
    textarea: HTMLTextAreaElement;
    actionHint: HTMLElement;
    commentEl?: Element;
    editContext?: CommentInputEditContext | null;
}

export interface CommentInputViewCallbacks {
    onInput: () => void;
    onSave: () => Promise<void>;
    onDelete?: () => Promise<void>;
}

export function renderEditCommentInput(
    card: HTMLElement,
    existingComment: CommentItem,
    callbacks: CommentInputViewCallbacks
): RenderedCommentInput | null {
    const commentEl = card.querySelector(`[data-comment-id="${existingComment.id}"]`);
    if (!commentEl) return null;

    commentEl.addClass('editing');

    const contentEl = commentEl.querySelector('.hi-note-content') as HTMLElement;
    if (!contentEl) return null;

    const textarea = createEl('textarea');
    textarea.value = existingComment.content || '';
    textarea.className = 'hi-note-input';
    textarea.style.minHeight = `${contentEl.offsetHeight}px`;
    textarea.addEventListener('input', callbacks.onInput);
    textarea.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    contentEl.replaceWith(textarea);

    const footer = commentEl.querySelector('.hi-note-footer');
    if (footer) {
        footer.addClass('hi-note-hidden');
    }

    const actionHint = new CommentInputActionBar(commentEl as HTMLElement, {
        onSave: callbacks.onSave,
        onDelete: callbacks.onDelete
    }).render();

    return {
        textarea,
        actionHint,
        commentEl,
        editContext: {
            contentEl,
            footer: footer || undefined
        }
    };
}

export function renderCreateCommentInput(
    card: HTMLElement,
    callbacks: CommentInputViewCallbacks
): RenderedCommentInput {
    const inputSection = createDiv();
    inputSection.className = 'hi-note-input';

    const textarea = inputSection.createEl("textarea");
    textarea.addEventListener('input', callbacks.onInput);

    inputSection.addEventListener('click', (event) => {
        event.stopPropagation();
    });

    let commentsSection = card.querySelector('.hi-notes-section');
    if (!commentsSection) {
        commentsSection = card.createDiv({
            cls: 'hi-notes-section'
        });

        commentsSection.createDiv({
            cls: 'hi-notes-list'
        });
    }

    const commentsList = commentsSection.querySelector('.hi-notes-list');
    if (commentsList) {
        commentsList.insertBefore(inputSection, commentsList.firstChild);
    }

    const actionHint = new CommentInputActionBar(inputSection, {
        onSave: callbacks.onSave
    }).render();

    return {
        textarea,
        actionHint,
        editContext: null
    };
}

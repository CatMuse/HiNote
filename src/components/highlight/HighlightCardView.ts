import { t } from '../../i18n';
import { App, Notice } from "obsidian";
import { CommentItem, HighlightInfo } from "../../types/highlight";
import { HighlightContent } from "./HighlightContent";
import { CommentList } from "./CommentList";

export function createHighlightCardElement(
    container: HTMLElement,
    highlight: HighlightInfo
): HTMLElement {
    return container.createDiv({
        cls: `highlight-card ${highlight.isVirtual ? 'virtual-highlight-card' : ''}`,
        attr: {
            'data-highlight': JSON.stringify(highlight)
        }
    });
}

export function renderHighlightCardContent(
    card: HTMLElement,
    highlight: HighlightInfo,
    app: App,
    isInMainView: boolean,
    onHighlightClick: (highlight: HighlightInfo) => Promise<void>
): void {
    const highlightContentEl = card.createDiv({
        cls: "highlight-content"
    });

    if (highlight.sourceUnavailable) {
        highlightContentEl.createDiv({ cls: 'highlight-source-unavailable', text: t('Original highlight could not be located. Showing saved content.') });
    }
    new HighlightContent(
        highlightContentEl,
        highlight,
        async row => {
            if (row.sourceUnavailable) {
                new Notice(t('Original highlight could not be located. Showing saved content.'));
                return;
            }
            await onHighlightClick(row);
        },
        app,
        isInMainView
    );
}

export function renderHighlightCardComments(
    card: HTMLElement,
    highlight: HighlightInfo,
    app: App,
    onCommentEdit: (comment: CommentItem) => void
): void {
    if (!highlight.comments || highlight.comments.length === 0) {
        return;
    }

    new CommentList(
        card,
        highlight,
        onCommentEdit,
        app
    );
}

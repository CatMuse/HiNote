import { defaultHighlightCardRegistry } from "../../../components/highlight";
import { CommentService } from "../../../services/comment";
import { CommentItem, HighlightInfo, isFileComment } from "../../../types/highlight";
import { ViewState } from "../../hinote/ViewState";
import { CommentInputManager } from "./CommentInputManager";

interface CommentControllerOptions {
    state: ViewState;
    highlightContainer?: HTMLElement;
    commentService: CommentService;
    commentInputManager: CommentInputManager;
    refreshView: () => Promise<void>;
}

export class CommentController {
    constructor(private options: CommentControllerOptions) {}

    configure(): void {
        this.options.commentService.setCallbacks({
            onRefreshView: async () => await this.options.refreshView(),
            onCardUpdate: (highlight) => this.updateCard(highlight),
            onCardRemove: (highlight) => this.removeCard(highlight)
        });

        this.options.commentInputManager.setCallbacks({
            onCommentSave: async (highlight, content, existingComment) => {
                this.syncCommentServiceState();
                if (existingComment) {
                    await this.options.commentService.updateComment(highlight, existingComment.id, content);
                } else {
                    await this.options.commentService.addComment(highlight, content);
                }
            },
            onCommentDelete: async (highlight, commentId) => {
                this.syncCommentServiceState();
                await this.options.commentService.deleteComment(highlight, commentId);
            },
            onCommentCancel: async (highlight) => {
                if (isFileComment(highlight) && highlight.isDraft && (!highlight.comments || highlight.comments.length === 0)) {
                    this.syncCommentServiceState();
                    await this.options.commentService.deleteFileCommentDraft(highlight);
                }
            }
        });
    }

    async addAIComment(highlight: HighlightInfo, content: string): Promise<void> {
        this.syncCommentServiceState();
        await this.options.commentService.addComment(highlight, content);
    }

    showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem): void {
        this.options.commentInputManager.showCommentInput(card, highlight, existingComment);
    }

    private syncCommentServiceState(): void {
        this.options.commentService.updateState({
            currentFile: this.options.state.currentFile,
            highlights: this.options.state.highlights
        });
    }

    private updateCard(highlight: HighlightInfo): void {
        if (this.options.state.disposed) return;
        const cardInstance = defaultHighlightCardRegistry.findByHighlightId(highlight.id || '', this.options.highlightContainer);
        const getCardElement = cardInstance?.getElement?.bind(cardInstance);
        const wasInDraftSection = getCardElement?.().closest('.file-comment-section') !== null;
        const index = this.options.state.highlights.findIndex(h => h.id === highlight.id);
        if (index !== -1) {
            this.options.state.highlights[index] = highlight;
        }

        // A newly saved file comment changes from the top draft area into a
        // normal masonry card in the main view. Re-render once so it moves
        // immediately instead of remaining stranded in the draft section.
        if (this.options.state.isDraggedToMainView && wasInDraftSection
            && isFileComment(highlight) && !!highlight.recordId) {
            void this.options.refreshView();
            return;
        }

        if (cardInstance) {
            if (isFileComment(highlight) && highlight.recordId) {
                const card = cardInstance.getElement();
                card.classList.remove('file-comment-draft-card');
                card.closest('.file-comment-section')?.classList.remove('has-open-file-comment-draft');
            }
            cardInstance.updateComments(highlight);
        }
    }

    private removeCard(highlight: HighlightInfo): void {
        if (this.options.state.disposed) return;
        this.options.state.highlights = this.options.state.highlights.filter(item => {
            if (item.id && highlight.id) {
                return item.id !== highlight.id;
            }
            return !(item.position === highlight.position && item.text === highlight.text);
        });

        const cardInstance = defaultHighlightCardRegistry.findByHighlightId(highlight.id || '', this.options.highlightContainer);
        if (cardInstance) {
            const card = cardInstance.getElement();
            const section = card.closest('.file-comment-section');
            card.remove();
            section?.classList.remove('has-open-file-comment-draft');
            cardInstance.destroy();
        }
    }
}

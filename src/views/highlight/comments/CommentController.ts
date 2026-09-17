import { defaultHighlightCardRegistry } from "../../../components/highlight";
import { CommentService } from "../../../services/comment";
import { CommentItem, HighlightInfo } from "../../../types/highlight";
import { ViewState } from "../../hinote/ViewState";
import { CommentInputManager } from "./CommentInputManager";

interface CommentControllerOptions {
    state: ViewState;
    commentService: CommentService;
    commentInputManager: CommentInputManager;
    refreshView: () => Promise<void>;
}

export class CommentController {
    constructor(private options: CommentControllerOptions) {}

    configure(): void {
        this.options.commentService.setCallbacks({
            onRefreshView: async () => await this.options.refreshView(),
            onHighlightsUpdate: (highlights) => {
                this.options.state.highlights = highlights;
            },
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
                if (highlight.isVirtual && (!highlight.comments || highlight.comments.length === 0)) {
                    this.syncCommentServiceState();
                    await this.options.commentService.deleteVirtualHighlight(highlight);
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
        const index = this.options.state.highlights.findIndex(h => h.id === highlight.id);
        if (index !== -1) {
            this.options.state.highlights[index] = highlight;
        }

        const cardInstance = defaultHighlightCardRegistry.findByHighlightId(highlight.id || '');
        if (cardInstance) {
            cardInstance.updateComments(highlight);
        }
    }

    private removeCard(highlight: HighlightInfo): void {
        this.options.state.highlights = this.options.state.highlights.filter(item => {
            if (item.id && highlight.id) {
                return item.id !== highlight.id;
            }
            return !(item.position === highlight.position && item.text === highlight.text);
        });

        const cardInstance = defaultHighlightCardRegistry.findByHighlightId(highlight.id || '');
        if (cardInstance) {
            cardInstance.getElement().remove();
            cardInstance.destroy();
        }
    }
}

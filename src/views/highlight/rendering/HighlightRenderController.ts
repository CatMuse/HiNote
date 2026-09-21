import { HighlightInfo } from "../../../types/highlight";
import { ExportManager } from "../exports";
import { HighlightRenderManager } from "./HighlightRenderManager";
import { CommentController } from "../comments";

interface HighlightRenderControllerOptions {
    highlightRenderManager: HighlightRenderManager;
    commentController: CommentController;
    exportManager: ExportManager;
    jumpToHighlight: (highlight: HighlightInfo) => Promise<void>;
}

export class HighlightRenderController {
    constructor(private options: HighlightRenderControllerOptions) {}

    configure(): void {
        this.options.highlightRenderManager.setCallbacks({
            onHighlightClick: async (highlight) => await this.options.jumpToHighlight(highlight),
            onCommentAdd: (element, highlight) => this.options.commentController.showCommentInput(element, highlight),
            onCommentEdit: (element, highlight, comment) => {
                this.options.commentController.showCommentInput(element, highlight, comment);
            },
            onExport: (highlight) => {
                void this.options.exportManager.exportHighlightAsImage(highlight);
            },
            onAIResponse: async (highlight, content) => {
                await this.options.commentController.addAIComment(highlight, content);
            }
        });
    }
}

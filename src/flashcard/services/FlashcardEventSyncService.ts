import type CommentPlugin from "../../../main";
import type { CommentItem } from "../../types/highlight";
import type { FlashcardState } from "../types/FSRSTypes";
import type { FlashcardSourceType } from "./SourceCardService";

interface FlashcardEventSyncServiceOptions {
    plugin: CommentPlugin;
    findCardsBySourceId: (sourceId: string, sourceType?: FlashcardSourceType) => FlashcardState[];
    updateCardsBySourceId: (sourceId: string, sourceType: FlashcardSourceType, newText?: string, newAnswer?: string) => number;
    deleteCardsBySourceId: (sourceId: string, sourceType?: FlashcardSourceType) => number;
    saveDebounced: () => void;
    emitFlashcardChanged: () => void;
}

export class FlashcardEventSyncService {
    constructor(private options: FlashcardEventSyncServiceOptions) {}

    public registerEventListeners(): void {
        const { plugin } = this.options;

        if (!plugin.eventManager) {
            console.error("事件管理器不存在，无法注册事件监听器");
            return;
        }

        plugin.registerEvent(plugin.eventManager.on(
            "highlight:update",
            (_filePath: string, _oldText: string, newText: string, sourceId: string) => {
                this.handleHighlightUpdate(newText, sourceId);
            }
        ));

        plugin.registerEvent(plugin.eventManager.on(
            "highlight:delete",
            (_filePath: string, _text: string, sourceId: string) => {
                this.handleHighlightDelete(sourceId);
            }
        ));

        plugin.registerEvent(plugin.eventManager.on(
            "comment:update",
            (_filePath: string, _oldComment: string, _newComment: string, sourceId: string) => {
                this.handleCommentUpdate(sourceId);
            }
        ));

        plugin.registerEvent(plugin.eventManager.on(
            "comment:delete",
            (_filePath: string, _comment: string, sourceId: string) => {
                this.handleCommentDelete(sourceId);
            }
        ));
    }

    private handleHighlightUpdate(newText: string, sourceId: string): void {
        const textUpdates = this.options.updateCardsBySourceId(sourceId, "highlight", newText);
        const answerUpdates = this.rebuildAnswers(sourceId);
        if (textUpdates > 0 || answerUpdates > 0) this.options.emitFlashcardChanged();
    }

    private handleHighlightDelete(sourceId: string): void {
        if (this.options.deleteCardsBySourceId(sourceId, "highlight") > 0) {
            this.options.emitFlashcardChanged();
        }
    }

    private handleCommentUpdate(sourceId: string): void {
        if (this.rebuildAnswers(sourceId) > 0) this.options.emitFlashcardChanged();
    }

    private rebuildAnswers(sourceId: string): number {
        const foundCards = this.options.findCardsBySourceId(sourceId, "highlight");
        if (foundCards.length === 0) {
            return 0;
        }

        const highlight = this.options.plugin.highlightRepository?.findHighlightById(sourceId);
        const currentComments = highlight?.comments || [];
        const commentContents = this.getCommentContents(currentComments);
        let updatedCount = 0;

        for (const card of foundCards) {
            const newAnswer = this.buildAnswer(card, commentContents);
            if (newAnswer !== card.answer) {
                card.answer = newAnswer;
                card.updatedAt = Date.now();
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            this.options.saveDebounced();
        }
        return updatedCount;
    }

    private handleCommentDelete(sourceId: string): void {
        if (this.options.deleteCardsBySourceId(sourceId, "highlight") > 0) {
            this.options.emitFlashcardChanged();
        }
    }

    private buildAnswer(card: FlashcardState, commentContents: string[]): string {
        const answerParts: string[] = [];
        const clozeAnswers = this.extractClozeAnswers(card.text);

        if (clozeAnswers.length > 0) {
            answerParts.push(clozeAnswers.join("\n"));
        }

        if (commentContents.length > 0) {
            answerParts.push(commentContents.join("\n\n"));
        }

        return answerParts.length > 0 ? answerParts.join("\n\n") : "";
    }

    private extractClozeAnswers(text: string): string[] {
        const clozeRegex = /\{\{([^{}]+)\}\}/g;
        const answers: string[] = [];
        let match: RegExpExecArray | null;

        while ((match = clozeRegex.exec(text)) !== null) {
            answers.push(match[1]);
        }

        return answers;
    }

    private getCommentContents(comments: CommentItem[]): string[] {
        return comments
            .map((comment: CommentItem) => comment.content)
            .filter((content: string) => content.trim() !== "");
    }
}

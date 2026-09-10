import { Notice, TFile } from "obsidian";
import { CommentInputActionBar, CommentInputSaveController } from "../../../components/comment";
import {
    autoResizeCommentTextarea,
    setupCommentInputKeyboard
} from "../../../components/comment/CommentInputKeyboard";
import { t } from "../../../i18n";
import { IdGenerator } from "../../../utils/IdGenerator";
import { CardGroup, FlashcardState, FSRS_RATING, FSRSRating } from "../../types/FSRSTypes";
import type { FlashcardComponentContext, FlashcardRatingButton } from "../FlashcardComponentContext";
import { FlashcardMarkdownRenderer } from "./FlashcardMarkdownRenderer";

export class FlashcardCardRenderer {
    constructor(
        private component: FlashcardComponentContext,
        private markdownRenderer: FlashcardMarkdownRenderer
    ) {}

    public render(cardContainer: HTMLElement, currentCard: FlashcardState | null): void {
        if (!currentCard) {
            cardContainer.createDiv({
                cls: "flashcard-empty-state",
                text: t("No cards available")
            });
            return;
        }

        const cardClasses = ["flashcard"];
        if (this.component.isCardFlipped()) {
            cardClasses.push("is-flipped");
        }

        const card = cardContainer.createDiv({ cls: cardClasses.join(" ") });
        this.renderCardSides(card, currentCard);
        card.addEventListener("click", () => this.component.flipCard());

        this.renderRatingButtons(cardContainer, currentCard);

        if (this.component.isCardFlipped()) {
            card.classList.add("is-flipped");
        }

        this.renderCounter(cardContainer);
        this.renderSource(cardContainer, currentCard);
    }

    private renderCardSides(card: HTMLElement, currentCard: FlashcardState): void {
        const isReversed = this.isCardReversed(currentCard);
        const frontContent = isReversed ? currentCard.answer : currentCard.text;
        const backContent = isReversed ? currentCard.text : currentCard.answer;

        const frontEl = card.createDiv({
            cls: "flashcard-side flashcard-front"
        }).createDiv({
            cls: "flashcard-content markdown-rendered"
        });
        void this.markdownRenderer.render(frontEl, frontContent, currentCard.filePath);

        const backEl = card.createDiv({
            cls: "flashcard-side flashcard-back"
        }).createDiv({
            cls: "flashcard-content markdown-rendered"
        });

        if (this.shouldRenderAnswerEmptyState(currentCard, isReversed, backContent)) {
            this.renderAnswerEmptyState(backEl, currentCard);
        } else {
            void this.markdownRenderer.render(backEl, backContent, currentCard.filePath);
        }
    }

    private isCardReversed(currentCard: FlashcardState): boolean {
        const allGroups = this.component.getFsrsManager().getCardGroups();
        return allGroups.some((group: CardGroup) => {
            if (!group.isReversed) {
                return false;
            }

            const groupCards = this.component.getFsrsManager().getCardsInGroup(group);
            return groupCards.some((card: FlashcardState) => card.id === currentCard.id);
        });
    }

    private renderRatingButtons(cardContainer: HTMLElement, currentCard: FlashcardState): void {
        const ratingContainer = cardContainer.createDiv({ cls: "flashcard-rating" });
        const predictions = this.component.getFsrsManager().getCardPredictions(currentCard.id);

        this.component.getRatingButtons().forEach((buttonConfig: FlashcardRatingButton) => {
            const button = ratingContainer.createEl("button", {
                cls: "flashcard-rating-button",
                attr: {
                    "data-rating": buttonConfig.ratingText,
                    title: `${buttonConfig.label} (${buttonConfig.key})`
                }
            });

            button.createSpan({ text: buttonConfig.label });

            const predictedCard = predictions?.[buttonConfig.rating];
            if (predictedCard) {
                const predictionSpan = button.createSpan({ cls: "prediction-info" });
                predictionSpan.createSpan({
                    text: this.formatDiffFromNow(predictedCard.nextReview),
                    cls: "days"
                });
            } else {
                button.createSpan({
                    text: this.formatDefaultInterval(buttonConfig.rating, currentCard),
                    cls: "days"
                });
            }

            button.addEventListener("click", (event: MouseEvent) => {
                event.stopPropagation();
                this.component.rateCard(buttonConfig.rating);
            });
        });
    }

    private renderCounter(cardContainer: HTMLElement): void {
        const groupId = this.component.getCurrentGroupId();
        const remainingCards = this.component.getCards().length;
        const fsrsManager = this.component.getFsrsManager();
        const totalTodayCards = groupId ? fsrsManager.getCardsForStudy(groupId).length : 0;
        const totalToShow = Math.max(totalTodayCards, remainingCards);
        const currentCardNumber = totalToShow - remainingCards + 1;

        cardContainer.createDiv({
            cls: "flashcard-counter",
            text: `${currentCardNumber}/${totalToShow}`
        });
    }

    private renderSource(cardContainer: HTMLElement, currentCard: FlashcardState): void {
        if (!currentCard.filePath) {
            return;
        }

        const filePath = currentCard.filePath;
        const sourceEl = cardContainer.createDiv({
            cls: "flashcard-source"
        });
        const fileNameText = sourceEl.createSpan({
            text: filePath.split("/").pop() || ""
        });

        this.component.getUtils().addPagePreview(fileNameText, filePath);
        fileNameText.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            const file = this.component.getApp().vault.getAbstractFileByPath(filePath);
            if (file && file instanceof TFile) {
                void this.component.getApp().workspace.getLeaf().openFile(file);
            }
        });
    }

    private shouldRenderAnswerEmptyState(currentCard: FlashcardState, isReversed: boolean, backContent: string): boolean {
        return !isReversed
            && backContent.trim() === ""
            && currentCard.sourceType === "highlight"
            && Boolean(currentCard.sourceId)
            && Boolean(currentCard.filePath);
    }

    private renderAnswerEmptyState(container: HTMLElement, currentCard: FlashcardState): void {
        container.empty();
        container.removeClass("markdown-rendered");
        container.addClass("flashcard-answer-empty-state");

        const emptyPrompt = container.createDiv({
            cls: "flashcard-answer-empty-prompt",
            attr: {
                role: "button",
                tabindex: "0"
            }
        });
        emptyPrompt.setText(t("Add answer..."));

        const openEditor = (event: Event) => {
            event.stopPropagation();
            this.renderAnswerEditor(container, currentCard);
        };

        emptyPrompt.addEventListener("click", openEditor);
        emptyPrompt.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            openEditor(event);
        });
    }

    private renderAnswerEditor(container: HTMLElement, currentCard: FlashcardState): void {
        container.empty();
        container.removeClass("flashcard-answer-empty-state");
        container.removeClass("markdown-rendered");
        container.addClass("flashcard-answer-editor");
        container.addClass("hi-note-input");

        const textarea = container.createEl("textarea", {
            attr: {
                placeholder: t("Add answer")
            }
        });
        textarea.addEventListener("input", () => autoResizeCommentTextarea(textarea));
        textarea.addEventListener("click", event => event.stopPropagation());

        const saveController = new CommentInputSaveController({
            getTextarea: () => textarea,
            onSave: async content => await this.saveAnswerFromEditor(currentCard, content),
            onSaved: () => {}
        });

        container.addEventListener("click", event => event.stopPropagation());
        setupCommentInputKeyboard(textarea, {
            onInlineAI: async () => {},
            onSave: async () => {
                await saveController.saveCurrentContent();
            }
        });

        const actionHint = new CommentInputActionBar(container, {
            onSave: async () => {
                await saveController.saveCurrentContent();
            },
            saveHintText: t("Shift + Enter Wrap, Enter Save")
        }).render();

        const cancelLink = actionHint.createDiv({
            cls: "hi-note-delete-link",
            text: t("Cancel")
        });
        cancelLink.addEventListener("click", event => {
            event.stopPropagation();
            saveController.reset();
            this.component.getRenderer().render();
        });

        textarea.focus();
    }

    private async saveAnswerFromEditor(currentCard: FlashcardState, answer: string): Promise<void> {
        const content = answer.trim();
        if (!content) {
            new Notice(t("Please enter an answer."));
            return;
        }

        const sourceId = currentCard.sourceId;
        const filePath = currentCard.filePath;
        if (!sourceId || !filePath) {
            new Notice(t("No corresponding highlight found."));
            return;
        }

        const plugin = this.component.getPlugin();
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            new Notice(t("No corresponding file found."));
            return;
        }

        const fileHighlights = await plugin.highlightRepository.getFileHighlights(file.path);
        const highlight = fileHighlights.find(item => item.id === sourceId);
        if (!highlight) {
            new Notice(t("No corresponding highlight found."));
            return;
        }

        if (!highlight.comments) {
            highlight.comments = [];
        }

        highlight.comments.push({
            id: IdGenerator.generateCommentId(),
            content,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });

        await plugin.highlightManager.addHighlight(file, highlight);
        currentCard.answer = this.buildAnswerFromCardAndComments(currentCard.text, highlight.comments.map(comment => comment.content));
        this.component.getRenderer().render();
        new Notice(t("Answer saved."));
    }

    private buildAnswerFromCardAndComments(cardText: string, commentContents: string[]): string {
        const answerParts: string[] = [];
        const clozeAnswers = this.extractClozeAnswers(cardText);
        const cleanComments = commentContents.filter(content => content.trim() !== "");

        if (clozeAnswers.length > 0) {
            answerParts.push(clozeAnswers.join("\n"));
        }

        if (cleanComments.length > 0) {
            answerParts.push(cleanComments.join("\n\n"));
        }

        return answerParts.join("\n\n");
    }

    private extractClozeAnswers(text: string): string[] {
        const answers: string[] = [];
        const clozeRegex = /\{\{([^{}]+)\}\}/g;
        let match: RegExpExecArray | null;

        while ((match = clozeRegex.exec(text)) !== null) {
            answers.push(match[1]);
        }

        return answers;
    }

    private formatDiffFromNow(timestamp: number): string {
        const nextReview = new Date(timestamp);
        const now = new Date();
        const diffMs = nextReview.getTime() - now.getTime();

        if (diffMs < 60 * 60 * 1000) {
            const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
            return `${diffMinutes}m`;
        }

        if (diffMs < 24 * 60 * 60 * 1000) {
            const diffHours = Math.round(diffMs / (1000 * 60 * 60));
            return `${diffHours}h`;
        }

        return this.formatIntervalDays(Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    private formatDefaultInterval(rating: FSRSRating, currentCard: FlashcardState): string {
        const isNewCard = currentCard.reviews === 0;
        const hasLapses = currentCard.lapses > 0;
        const intervalHours = this.getDefaultIntervalHours(rating, isNewCard, hasLapses);

        if (intervalHours < 1) {
            return `${Math.round(intervalHours * 60)}m`;
        }

        if (intervalHours < 24) {
            return `${Math.round(intervalHours)}h`;
        }

        return this.formatIntervalDays(intervalHours / 24);
    }

    private getDefaultIntervalHours(rating: FSRSRating, isNewCard: boolean, hasLapses: boolean): number {
        switch (rating) {
            case FSRS_RATING.AGAIN:
                return isNewCard ? 0.25 : (hasLapses ? 0.5 : 1);
            case FSRS_RATING.HARD:
                return isNewCard ? 24 : (hasLapses ? 36 : 48);
            case FSRS_RATING.GOOD:
                return isNewCard ? 24 * 3 : (hasLapses ? 24 * 5 : 24 * 7);
            case FSRS_RATING.EASY:
                return isNewCard ? 24 * 5 : (hasLapses ? 24 * 9 : 24 * 14);
        }
    }

    private formatIntervalDays(intervalDays: number): string {
        if (intervalDays < 1) {
            return `${Math.round(intervalDays * 24)}h`;
        }

        if (intervalDays < 30) {
            return `${Math.round(intervalDays)}d`;
        }

        if (intervalDays < 365) {
            return `${Math.round(intervalDays / 30)}mo`;
        }

        return `${Math.round(intervalDays / 365)}y`;
    }
}

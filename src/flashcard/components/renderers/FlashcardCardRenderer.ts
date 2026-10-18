import { recordToHighlightView } from '../../../models/HighlightModels';
import { MarkdownView, Menu, Notice, setIcon, setTooltip, TFile } from "obsidian";
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

import { StudyExitModal } from './StudyExitModal';

export class FlashcardCardRenderer {
    private answerEditor: { textarea: HTMLTextAreaElement; save: () => Promise<boolean>; isSaving: () => boolean } | null = null;
    private exitModal: StudyExitModal | null = null;
    private cardElement: HTMLElement | null = null;
    private renderedCardId: string | null = null;

    public dispose(): void {
        this.cardElement = null;
        this.renderedCardId = null;
        this.exitModal?.close();
        this.exitModal = null;
        this.answerEditor = null;
    }

    public async prepareToLeave(): Promise<boolean> {
        const editor = this.answerEditor;
        if (!editor || !editor.textarea.isConnected) return true;
        if (editor.isSaving()) {
            new Notice(t('Please wait for the answer to finish saving.'));
            return false;
        }
        if (!editor.textarea.value.trim()) return true;
        const modal = new StudyExitModal(this.component.getApp());
        this.exitModal = modal;
        modal.open();
        const choice = await modal.result;
        if (this.exitModal === modal) this.exitModal = null;
        if (choice === 'stay') { editor.textarea.focus(); return false; }
        if (choice === 'discard') return true;
        const saved = await editor.save();
        if (!saved) {
            new Notice(t('Answer could not be saved. Please try again.'));
            editor.textarea.focus();
        }
        return saved;
    }

    constructor(
        private component: FlashcardComponentContext,
        private markdownRenderer: FlashcardMarkdownRenderer
    ) {}

    public render(cardContainer: HTMLElement, currentCard: FlashcardState | null): void {
        this.answerEditor = null;
        this.cardElement = null;
        this.renderedCardId = null;
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
        this.cardElement = card;
        this.renderedCardId = currentCard.id;
        this.renderCardSides(card, currentCard);
        this.updateFaceAccessibility(card);

        const controls = cardContainer.createDiv({ cls: 'flashcard-controls' });
        this.renderControls(controls, currentCard);

    }

    /** Reveal by updating the existing sides so their CSS transforms can interpolate. */
    public updateFace(container: HTMLElement, currentCard: FlashcardState | null): boolean {
        const card = container.querySelector<HTMLElement>('.flashcard');
        const controls = container.querySelector<HTMLElement>('.flashcard-controls');
        if (!card || card !== this.cardElement || !controls || currentCard?.id !== this.renderedCardId) return false;
        card.classList.toggle('is-flipped', this.component.isCardFlipped());
        this.updateFaceAccessibility(card);
        controls.empty();
        this.renderControls(controls, currentCard);
        return true;
    }

    private updateFaceAccessibility(card: HTMLElement): void {
        const flipped = this.component.isCardFlipped();
        for (const [selector, hidden] of [['.flashcard-front', flipped], ['.flashcard-back', !flipped]] as const) {
            const side = card.querySelector<HTMLElement>(selector);
            side?.setAttribute('aria-hidden', String(hidden));
            side?.toggleAttribute('inert', hidden);
        }
    }

    private renderControls(controls: HTMLElement, currentCard: FlashcardState): void {
        if (this.component.isCardFlipped() && !currentCard.suspended) this.renderRatingButtons(controls, currentCard);
        else if (!this.component.isCardFlipped()) this.renderRevealButton(controls);
    }

    public renderActions(container: HTMLElement, currentCard?: FlashcardState): void {
        if (!currentCard && !this.component.getFsrsManager().canUndoReview()) return;
        const actions = container.createDiv({ cls: 'flashcard-study-actions' });
        const more = actions.createEl('button', {
            cls: 'clickable-icon flashcard-more',
            attr: { type: 'button', 'aria-label': t('More actions') }
        });
        setIcon(more, 'ellipsis');
        setTooltip(more, t('More actions'));
        more.addEventListener('click', event => {
            if (this.component.getContainer().querySelector('.flashcard-answer-editor')) return;
            const menu = new Menu();
            if (this.component.getFsrsManager().canUndoReview()) {
                menu.addItem(item => item.setTitle(t('Undo last rating')).setIcon('undo-2')
                    .onClick(() => this.component.undoReview()));
            }
            if (currentCard) {
                menu.addItem(item => item
                    .setTitle(currentCard.suspended ? t('Resume card') : t('Pause card'))
                    .setIcon(currentCard.suspended ? 'play' : 'pause')
                    .onClick(() => this.component.setCardSuspended(currentCard.id, !currentCard.suspended)));
            }
            menu.showAtMouseEvent(event);
        });
    }

    private renderRevealButton(cardContainer: HTMLElement): void {
        const button = cardContainer.createEl('button', {
            cls: 'mod-cta flashcard-reveal-button',
            attr: { type: 'button', 'aria-keyshortcuts': 'Space' }
        });
        button.createSpan({ text: t('Show answer') });
        button.addEventListener('click', event => {
            event.stopPropagation();
            this.component.flipCard();
        });
    }

    private renderCardSides(card: HTMLElement, currentCard: FlashcardState): void {
        const isReversed = this.isCardReversed(currentCard);
        const frontContent = isReversed ? currentCard.answer : currentCard.text;
        const backContent = isReversed ? currentCard.text : currentCard.answer;
        const isFlipped = this.component.isCardFlipped();

        const front = card.createDiv({
            cls: 'flashcard-side flashcard-front', attr: { 'aria-hidden': String(isFlipped) }
        });
        this.renderFaceHeader(front, currentCard);
        const frontEl = front.createDiv({ cls: 'flashcard-content markdown-rendered' });
        void this.markdownRenderer.render(frontEl, frontContent, currentCard.filePath);

        const back = card.createDiv({
            cls: 'flashcard-side flashcard-back', attr: { 'aria-hidden': String(!isFlipped) }
        });
        this.renderFaceHeader(back, currentCard);
        const backEl = back.createDiv({ cls: 'flashcard-content flashcard-back-content' });

        const longQuestion = frontContent.length > 280 || frontContent.split('\n').length > 5;
        const context = backEl.createEl(longQuestion ? 'details' : 'div', { cls: 'flashcard-question-context' });
        if (longQuestion) context.createEl('summary', { cls: 'flashcard-context-label', text: t('Show question') });
        const contextContent = context.createDiv({ cls: 'flashcard-context-content markdown-rendered' });
        void this.markdownRenderer.render(contextContent, frontContent, currentCard.filePath);

        const longAnswer = backContent.length > 280 || backContent.split('\n').length > 5;
        const answer = backEl.createDiv({ cls: `flashcard-answer-content${longAnswer ? ' is-long-answer' : ''}` });
        answer.createDiv({ cls: 'flashcard-answer-label', text: t('Answer') });

        if (this.shouldRenderAnswerEmptyState(currentCard, isReversed, backContent)) {
            this.renderAnswerEmptyState(answer, currentCard);
        } else {
            const answerContent = answer.createDiv({ cls: 'markdown-rendered' });
            void this.markdownRenderer.render(answerContent, backContent, currentCard.filePath);
        }
    }

    private renderFaceHeader(side: HTMLElement, currentCard: FlashcardState): void {
        const header = side.createDiv({ cls: 'flashcard-face-header' });
        header.createDiv({ cls: 'flashcard-context-label', text: t('Question') });
        this.renderSource(header, currentCard);
        this.renderActions(header, currentCard);
    }

    private isCardReversed(currentCard: FlashcardState): boolean {
        const allGroups = this.component.getFsrsManager().getCardGroups().filter(group => group.id === this.component.getCurrentGroupId());
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
                    'aria-keyshortcuts': buttonConfig.key
                }
            });

            const descriptions: Record<string, string> = {
                again: 'Could not recall the answer', hard: 'Recalled with difficulty',
                good: 'Recalled correctly', easy: 'Recalled effortlessly'
            };
            setTooltip(button, t(descriptions[buttonConfig.ratingText]));
            const heading = button.createSpan({ cls: 'flashcard-rating-label' });
            heading.createSpan({ text: buttonConfig.label });

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

    private renderSource(cardContainer: HTMLElement, currentCard: FlashcardState): void {
        if (!currentCard.filePath) {
            return;
        }

        const filePath = currentCard.filePath;
        const sourceEl = cardContainer.createDiv({
            cls: "flashcard-source"
        });
        const fileNameText = sourceEl.createEl('button', {
            text: filePath.split("/").pop() || "",
            cls: 'flashcard-source-link',
            attr: { type: 'button', 'aria-label': t('Open source in a new tab') }
        });
        setTooltip(fileNameText, t('Open source in a new tab'));

        this.component.getUtils().addPagePreview(fileNameText, filePath);
        fileNameText.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            const file = this.component.getApp().vault.getAbstractFileByPath(filePath);
            if (file && file instanceof TFile) {
                void this.openSource(file, currentCard).catch(() => new Notice(t('Could not open source.')));
            }
        });
    }

    private async openSource(file: TFile, card: FlashcardState): Promise<void> {
        const record = card.sourceId
            ? await this.component.getPlugin().highlightRepository.findHighlightById(card.sourceId)
            : null;
        const leaf = this.component.getApp().workspace.getLeaf('tab');
        await leaf.openFile(file);
        if (leaf.view instanceof MarkdownView && record?.filePath === file.path && record.position !== undefined) {
            const position = leaf.view.editor.offsetToPos(record.position);
            leaf.setEphemeralState({ line: position.line });
            leaf.view.editor.setCursor(position);
            leaf.view.editor.scrollIntoView({ from: position, to: position }, true);
        }
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

        container.createEl('h3', { cls: 'flashcard-answer-empty-title', text: t('No answer yet') });
        const emptyPrompt = container.createEl('button', {
            cls: 'flashcard-answer-empty-prompt',
            attr: { type: 'button' }
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
        this.component.getContainer().querySelectorAll<HTMLButtonElement>('.flashcard-rating-button, .flashcard-more, .flashcard-undo')
            .forEach(button => button.disabled = true);

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

        this.answerEditor = {
            textarea, save: () => saveController.saveCurrentContent(), isSaving: () => saveController.isProcessing()
        };
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

        const cancelLink = actionHint.createEl('button', {
            cls: 'hi-note-delete-link',
            text: t('Cancel'),
            attr: { type: 'button' }
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
            throw new Error('Please enter an answer.');
        }

        const sourceId = currentCard.sourceId;
        const filePath = currentCard.filePath;
        if (!sourceId || !filePath) {
            new Notice(t("No corresponding highlight found."));
            throw new Error('No corresponding highlight found.');
        }

        const plugin = this.component.getPlugin();
        const file = plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            new Notice(t("No corresponding file found."));
            throw new Error('No corresponding file found.');
        }

        const fileHighlights = await plugin.highlightRepository.getFileHighlights(file.path);
        const record = fileHighlights.find(item => item.id === sourceId);
        if (!record) {
            new Notice(t("No corresponding highlight found."));
            throw new Error('No corresponding highlight found.');
        }

        const highlight = recordToHighlightView(record);

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
            return t('{count}m', { count: diffMinutes });
        }

        if (diffMs < 24 * 60 * 60 * 1000) {
            const diffHours = Math.round(diffMs / (1000 * 60 * 60));
            return t('{count}h', { count: diffHours });
        }

        return this.formatIntervalDays(Math.round(diffMs / (1000 * 60 * 60 * 24)));
    }

    private formatDefaultInterval(rating: FSRSRating, currentCard: FlashcardState): string {
        const isNewCard = currentCard.reviews === 0;
        const hasLapses = currentCard.lapses > 0;
        const intervalHours = this.getDefaultIntervalHours(rating, isNewCard, hasLapses);

        if (intervalHours < 1) {
            return t('{count}m', { count: Math.round(intervalHours * 60) });
        }

        if (intervalHours < 24) {
            return t('{count}h', { count: Math.round(intervalHours) });
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
            return t('{count}h', { count: Math.round(intervalDays * 24) });
        }

        if (intervalDays < 30) {
            return t('{count}d', { count: Math.round(intervalDays) });
        }

        if (intervalDays < 365) {
            return t('{count}mo', { count: Math.round(intervalDays / 30) });
        }

        return t('{count}y', { count: Math.round(intervalDays / 365) });
    }
}

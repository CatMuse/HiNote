import { setIcon } from "obsidian";
import { t } from "../../../i18n";
import type { CardGroup } from "../../types/FSRSTypes";
import { ALL_CARDS_GROUP, PAUSED_CARDS_GROUP } from '../../types/FlashcardGroups';
import type { FlashcardComponentContext } from "../FlashcardComponentContext";

export class FlashcardEmptyStateRenderer {
    constructor(private component: FlashcardComponentContext) {}

    public render(cardContainer: HTMLElement): boolean {
        const cards = this.component.getCards();
        const groupName = this.component.getCurrentGroupName();
        const groups = this.component.getFsrsManager().getCardGroups();
        const hasGroups = groups.length > 0;

        if (hasGroups && cards.length > 0) {
            return false;
        }

        const currentGroup = groups.find((group: CardGroup) => group.id === this.component.getCurrentGroupId());
        const isEmptyGroup = currentGroup && this.component.getFsrsManager().getCardsByGroupId(currentGroup.id).length === 0;

        if (!hasGroups) {
            this.renderNoGroups(cardContainer);
        } else if (isEmptyGroup && currentGroup?.id === PAUSED_CARDS_GROUP) {
            cardContainer.createDiv({ cls: 'flashcard-completion-message', text: t('No paused cards') });
        } else if (isEmptyGroup && currentGroup?.id === ALL_CARDS_GROUP) {
            cardContainer.createDiv({ cls: 'flashcard-completion-message', text: t('Create a flashcard from a highlight to start learning.') });
        } else if (isEmptyGroup) {
            this.renderEmptyGroup(cardContainer);
        } else {
            this.renderCompletion(cardContainer, groupName, currentGroup);
        }

        return true;
    }

    private renderNoGroups(cardContainer: HTMLElement): void {
        const noGroupContainer = cardContainer.createDiv({
            cls: "flashcard-completion-message flashcard-no-group"
        });

        const iconEl = noGroupContainer.createDiv({ cls: "completion-icon" });
        setIcon(iconEl, "folder-plus");

        noGroupContainer.createEl("h3", {
            text: t("No Flashcard Groups")
        });

        noGroupContainer.createEl("p", {
            text: t("You haven't created any flashcard groups yet. Create a group to get started with your flashcards.")
        });

        const createButton = noGroupContainer.createEl("button", {
            cls: "mod-cta",
            text: t("Create Flashcard Group")
        });

        createButton.addEventListener("click", () => {
            this.component.getGroupManager().showCreateGroupModal();
        });
    }

    private renderEmptyGroup(cardContainer: HTMLElement): void {
        const emptyContainer = cardContainer.createDiv({
            cls: "flashcard-completion-message flashcard-empty-group"
        });

        const iconEl = emptyContainer.createDiv({ cls: "completion-icon" });
        setIcon(iconEl, "circle-slash-2");

        emptyContainer.createEl("h3", {
            text: t("No Cards in This Group")
        });

        emptyContainer.createEl("p", {
            text: t("This group doesn't contain any flashcards yet. Add some flashcards to this group to start learning.")
        });
    }

    private renderCompletion(cardContainer: HTMLElement, groupName: string, currentGroup?: CardGroup): void {
        const completionContainer = cardContainer.createDiv({
            cls: "flashcard-completion-message"
        });

        const iconEl = completionContainer.createDiv({ cls: "completion-icon" });
        setIcon(iconEl, "check-circle");

        completionContainer.createEl("h3", {
            text: t("No cards ready now")
        });

        const manager = this.component.getFsrsManager();
        const cards = currentGroup ? manager.getCardsByGroupId(currentGroup.id).filter(card => !card.suspended) : [];
        const waiting = cards.filter(card => (card.state === 1 || card.state === 3) && card.nextReview > Date.now());
        const messageKey = waiting.length ? "Learning cards will return automatically when due."
            : cards.some(card => card.nextReview <= Date.now()) ? "Daily limit reached. Continue tomorrow."
            : "No cards due for review";
        let message: string | null = t(messageKey);
        if (!message) {
            message = currentGroup
                ? t("Group completed: ") + currentGroup.name + t(". All cards have been reviewed.")
                : t("All flashcards completed for today!");

            this.component.setGroupCompletionMessage(this.component.getCurrentGroupId(), message);
        }

        completionContainer.createEl("p", {
            text: message
        });
        const next = cards.filter(card => card.nextReview > Date.now()).reduce((time, card) => Math.min(time, card.nextReview), Infinity);
        if (Number.isFinite(next)) {
            completionContainer.createEl('p', { text: `${t('Next review')}: ${new Date(next).toLocaleString()}` });
        }
    }
}

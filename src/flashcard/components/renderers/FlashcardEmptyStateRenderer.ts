import { setIcon } from "obsidian";
import { t } from "../../../i18n";
import type { CardGroup } from "../../types/FSRSTypes";
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

        const currentGroup = groups.find((group: CardGroup) => group.name === groupName);
        const isEmptyGroup = currentGroup && (currentGroup.cardIds?.length ?? 0) === 0;

        if (!hasGroups) {
            this.renderNoGroups(cardContainer);
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
            text: t("Learning Completed!")
        });

        let message = this.component.getGroupCompletionMessage(groupName);
        if (!message) {
            message = currentGroup
                ? t("Group completed: ") + currentGroup.name + t(". All cards have been reviewed.")
                : t("All flashcards completed for today!");

            this.component.setGroupCompletionMessage(groupName, message);
        }

        completionContainer.createEl("p", {
            text: message
        });
    }
}

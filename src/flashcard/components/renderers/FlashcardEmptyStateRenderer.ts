import { setIcon } from "obsidian";
import { t, formatDateTime } from '../../../i18n';
import type { CardGroup } from "../../types/FSRSTypes";
import { ALL_CARDS_GROUP, PAUSED_CARDS_GROUP } from '../../types/FlashcardGroups';
import type { FlashcardComponentContext } from "../FlashcardComponentContext";

export class FlashcardEmptyStateRenderer {
    constructor(private component: FlashcardComponentContext) {}

    public render(cardContainer: HTMLElement): boolean {
        const cards = this.component.getCards();
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
            this.renderCompletion(cardContainer, currentGroup);
        }

        const back = cardContainer.createEl('button', {
            text: this.component.getReturnLabel(), attr: { type: 'button' }
        });
        back.addEventListener('click', () => this.component.returnFromStudy());
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

    private renderCompletion(cardContainer: HTMLElement, currentGroup?: CardGroup): void {
        const completionContainer = cardContainer.createDiv({
            cls: "flashcard-completion-message"
        });

        const manager = this.component.getFsrsManager();
        const now = Date.now();
        const cards = currentGroup ? manager.getCardsByGroupId(currentGroup.id).filter(card => !card.suspended) : [];
        const waiting = cards.filter(card => (card.state === 1 || card.state === 3) && card.nextReview > now);
        const limited = cards.some(card => (card.reviews === 0 && card.lastReview === 0) || card.nextReview <= now);
        const title = waiting.length ? 'Waiting for learning cards' : limited ? 'Daily limit reached' : 'All caught up';
        const iconEl = completionContainer.createDiv({ cls: 'completion-icon' });
        setIcon(iconEl, waiting.length ? 'clock' : limited ? 'calendar-check' : 'check-circle');
        completionContainer.createEl('h3', { text: t(title) });
        completionContainer.createEl('p', {
            text: t(waiting.length ? 'Learning cards will return automatically when due.'
                : limited ? 'Daily limit reached. Continue tomorrow.' : 'No cards due for review')
        });
        const session = this.component.getSessionProgress();
        if (session.reviews > 0) {
            const seconds = Math.max(0, Math.round(session.studyTimeMs / 1000));
            const duration = seconds < 60 ? t('{count} seconds', { count: seconds })
                : t('{minutes}m {seconds}s', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
            completionContainer.createEl('p', {
                cls: 'flashcard-session-summary',
                text: [
                    t(session.completed === 1 ? '{count} card' : '{count} cards', { count: session.completed }),
                    t(session.reviews === 1 ? '{count} review' : '{count} reviews', { count: session.reviews }),
                    duration
                ].join(' · ')
            });
        }
        // When waiting, show the next learning step rather than an unrelated scheduled review.
        const future = waiting.length ? waiting : cards.filter(card => card.nextReview > now);
        const next = future.reduce((time, card) => Math.min(time, card.nextReview), Infinity);
        if (Number.isFinite(next)) {
            completionContainer.createEl('p', { text: `${t('Next review')}: ${formatDateTime(next)}` });
        }
    }
}

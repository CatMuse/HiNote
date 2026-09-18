import { Notice } from "obsidian";
import { t } from "../../../i18n";
import { FSRSRating } from "../../types/FSRSTypes";
import type { FlashcardComponentContext } from "../FlashcardComponentContext";
import { restoreReviewPosition } from "./FlashcardReviewQueue";

/** One queue for selection, limits and short-term learning. */
export class FlashcardOperations {
    private saving = false;
    private completed = 0;
    private sessionGroup = '';
    private sessionDay = new Date().toDateString();
    private revision = 0;
    private lastRatedCardId: string | undefined;
    private timer: number | null = null;
    private timerWindow: Window | null = null;
    private externalTimer: number | null = null;

    constructor(private component: FlashcardComponentContext) {}

    public getSessionProgress() {
        return { completed: this.completed, total: this.completed + this.component.getCards().length };
    }

    public async undoReview(): Promise<void> {
        if (this.saving) return;
        const revision = this.revision;
        const groupId = this.component.getCurrentGroupId();
        const undoId = this.component.getFsrsManager().getUndoCardId();
        this.saving = true;
        try {
            if (await this.component.getFsrsManager().undoLastReview()) {
                if (revision === this.revision && this.component.getCurrentGroupId() === groupId && this.component.getIsActive()) {
                    if (undoId === this.lastRatedCardId) this.completed = Math.max(0, this.completed - 1);
                    this.lastRatedCardId = undefined;
                    this.refreshCardList(false);
                    this.component.getRenderer().renderStudyArea();
                }
            }
        } catch { new Notice(t('Review could not be saved. Please try again.')); }
        finally { this.saving = false; }
    }

    public dispose(): void {
        this.revision++;
        this.cancelTimer();
        if (this.externalTimer !== null) this.component.getContainer().ownerDocument.defaultView?.clearTimeout(this.externalTimer);
        this.externalTimer = null;
    }

    public onCardsChanged(): void {
        if (this.saving || !this.component.getIsActive() || this.externalTimer !== null) return;
        const ownerWindow = this.component.getContainer().ownerDocument.defaultView;
        this.externalTimer = ownerWindow?.setTimeout(() => {
            this.externalTimer = null;
            if (!this.component.getIsActive()) return;
            if (this.component.getContainer().querySelector('.flashcard-answer-editor')) {
                this.onCardsChanged();
                return;
            }
            if (this.saving) return;
            this.component.saveState();
            this.refreshCardList();
            this.component.getRenderer().renderStudyArea();
        }, 150) ?? null;
    }

    public async setCardSuspended(cardId: string, suspended: boolean): Promise<void> {
        if (this.saving) return;
        const revision = this.revision;
        this.saving = true;
        try {
            await this.component.getFsrsManager().setCardSuspended(cardId, suspended);
            if (this.component.getIsActive() && revision === this.revision) {
                this.refreshCardList(false);
                this.component.getRenderer().renderStudyArea();
            }
        } catch { new Notice(t('Card could not be updated. Please try again.')); }
        finally { this.saving = false; }
    }

    private cancelTimer(): void {
        if (this.timer !== null) this.timerWindow?.clearTimeout(this.timer);
        this.timer = null;
    }

    public flipCard(): void {
        if (this.saving || !this.component.getCards().length) return;
        this.component.setCardFlipped(!this.component.isCardFlipped());
        this.component.saveState();
        this.component.getRenderer().renderStudyArea();
        this.component.getContainer().focus();
    }

    public nextCard(): void {
        const cards = this.component.getCards();
        if (this.saving || !cards.length) return;
        this.component.setCurrentIndex((this.component.getCurrentIndex() + 1) % cards.length);
        this.component.setCardFlipped(false);
        this.component.saveState();
        this.component.getRenderer().renderStudyArea();
    }

    public async rateCard(rating: FSRSRating): Promise<void> {
        if (this.saving || !this.component.isCardFlipped()) return;
        const card = this.component.getCards()[this.component.getCurrentIndex()];
        if (!card) return;
        const groupId = this.component.getCurrentGroupId();
        const revision = this.revision;
        this.saving = true;
        const buttons = this.component.getContainer().querySelectorAll<HTMLButtonElement>(".flashcard-rating-button");
        buttons.forEach(button => button.disabled = true);
        try {
            const saved = await this.component.getFsrsManager().trackStudyProgress(card.id, rating, groupId);
            if (!saved) {
                if (revision === this.revision && this.component.getIsActive() && this.component.getCurrentGroupId() === groupId) {
                    this.refreshCardList(false);
                    this.component.getRenderer().renderStudyArea();
                }
                return;
            }
            if (revision !== this.revision || !this.component.getIsActive() || this.component.getCurrentGroupId() !== groupId) return;
            this.completed++;
            this.lastRatedCardId = card.id;
            this.component.setCardFlipped(false);
            this.refreshCardList(false);
            this.component.getRenderer().renderStudyArea();
            this.component.getContainer().focus();
        } catch (error) {
            console.error("[HiNote] Rating could not be saved", error);
            new Notice(t("Review could not be saved. Please try again."));
        } finally {
            this.saving = false;
            buttons.forEach(button => button.disabled = false);
        }
    }

    public refreshCardList(restore = true): void {
        this.cancelTimer();
        const manager = this.component.getFsrsManager();
        let groupId = this.component.getCurrentGroupId();
        if (!manager.getCardGroups().some(group => group.id === groupId)) {
            groupId = manager.getCardGroups()[0]?.id || "";
            this.component.setCurrentGroupId(groupId);
        }
        const cards = groupId ? manager.getCardsForStudy(groupId) : [];
        const today = new Date().toDateString();
        if (this.sessionGroup !== groupId || this.sessionDay !== today) {
            this.completed = 0;
            this.lastRatedCardId = undefined;
            this.sessionGroup = groupId;
            this.sessionDay = today;
            this.revision++;
        }
        this.component.setCards(cards);
        const position = restoreReviewPosition(cards, restore ? this.component.getGroupProgress() : null);
        this.component.setCurrentIndex(Math.max(0, position.currentIndex));
        this.component.setCardFlipped(cards.length > 0 && position.isFlipped);
        this.component.setCompletionMessage(null);
        this.component.setGroupCompletionMessage(groupId, null);
        this.component.saveState();

        // Only one timer per visible component, using its own popout window.
        if (groupId && this.component.getIsActive()) {
            const now = Date.now();
            const next = manager.getCardsByGroupId(groupId)
                .filter(card => !card.suspended && card.nextReview > now)
                .reduce((time, card) => Math.min(time, card.nextReview), Infinity);
            const midnight = new Date();
            midnight.setHours(24, 0, 0, 0);
            const wakeAt = Math.min(next, midnight.getTime());
            this.timerWindow = this.component.getContainer().ownerDocument.defaultView;
            const wake = () => {
                if (!this.component.getIsActive()) return;
                if (this.saving || this.component.getContainer().querySelector('.flashcard-answer-editor')) {
                    this.timer = this.timerWindow?.setTimeout(wake, 250) ?? null;
                    return;
                }
                // Do not replace the card or an answer being edited.
                this.component.saveState();
                const wasEmpty = this.component.getCards().length === 0;
                const previousCardId = this.component.getCards()[this.component.getCurrentIndex()]?.id;
                this.refreshCardList();
                const currentCardId = this.component.getCards()[this.component.getCurrentIndex()]?.id;
                if (wasEmpty || previousCardId !== currentCardId) this.component.getRenderer().renderStudyArea();
                else this.component.getRenderer().refreshStatistics();
            };
            this.timer = this.timerWindow?.setTimeout(wake, Math.max(100, wakeAt - now)) ?? null;
        }
    }
}

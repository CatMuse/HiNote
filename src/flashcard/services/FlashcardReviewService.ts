import type {
    FlashcardState,
    FSRSRating,
    FSRSStorage
} from '../types/FSRSTypes';
import type { DailyStatsService } from './DailyStatsService';
import type { FSRSService } from './FSRSService';

interface FlashcardReviewServiceOptions {
    getStorage: () => FSRSStorage;
    getFsrsService: () => FSRSService;
    getDailyStatsService: () => DailyStatsService;
    saveStorage: () => Promise<void>;
    emitFlashcardChanged: () => void;
}

export class FlashcardReviewService {
    private saving = false;
    private undo: { card: FlashcardState; reviewed: FlashcardState; stats: FSRSStorage['globalStats']; daily: FSRSStorage['dailyStats']; afterDaily: string } | null = null;

    canUndo(): boolean {
        const storage = this.options.getStorage();
        const current = this.undo ? storage.cards[this.undo.card.id] : undefined;
        return !this.saving && !!this.undo && !!current
            && JSON.stringify(current.reviewHistory) === JSON.stringify(this.undo.reviewed.reviewHistory)
            && storage.globalStats.totalReviews === this.undo.stats.totalReviews + 1
            && JSON.stringify(storage.dailyStats) === this.undo.afterDaily;
    }

    getUndoCardId(): string | undefined { return this.undo?.card.id; }

    async undoLastReview(): Promise<boolean> {
        if (!this.canUndo() || !this.undo) return false;
        const storage = this.options.getStorage();
        const undo = this.undo;
        const stats = storage.globalStats;
        const daily = storage.dailyStats;
        this.saving = true;
        const current = storage.cards[undo.card.id];
        storage.cards[undo.card.id] = { ...undo.card,
            text: current.text, answer: current.answer,
            filePath: current.filePath, groupIds: current.groupIds, updatedAt: current.updatedAt };
        storage.globalStats = undo.stats;
        storage.dailyStats = undo.daily;
        try {
            await this.options.saveStorage();
            this.undo = null;
            this.options.emitFlashcardChanged();
            return true;
        } catch (error) {
            storage.cards[undo.card.id] = undo.reviewed;
            storage.globalStats = stats;
            storage.dailyStats = daily;
            throw error;
        } finally { this.saving = false; }
    }
    constructor(private options: FlashcardReviewServiceOptions) {}

    async trackStudyProgress(cardId: string, rating: FSRSRating, groupId?: string): Promise<FlashcardState | null> {
        if (this.saving) return null;
        const storage = this.options.getStorage();
        const card = storage.cards[cardId];
        if (!card) {
            console.error(`Tracking study progress failed: Card ${cardId} does not exist`);
            return null;
        }

        const isNewCard = card.lastReview === 0;
        const updatedCard = this.options.getFsrsService().reviewCard(card, rating);
        const previousStats = { ...storage.globalStats };
        const previousDaily = JSON.parse(JSON.stringify(storage.dailyStats));
        this.saving = true;
        storage.cards[cardId] = updatedCard;

        this.updateGlobalStats(rating === 1 ? 0 : 1);
        this.options.getDailyStatsService().updateDailyStats(isNewCard, rating, cardId, groupId, card.state === 1 || card.state === 3);

        try {
            await this.options.saveStorage();
            this.undo = { card, reviewed: updatedCard, stats: previousStats, daily: previousDaily, afterDaily: JSON.stringify(storage.dailyStats) };
            this.options.emitFlashcardChanged();
            return storage.cards[cardId];
        } catch (error) {
            storage.cards[cardId] = card;
            storage.globalStats = previousStats;
            storage.dailyStats = previousDaily;
            throw error;
        } finally {
            this.saving = false;
        }
    }

    getCardPredictions(cardId: string): Record<FSRSRating, FlashcardState> | null {
        const card = this.options.getStorage().cards[cardId];
        if (!card) {
            return null;
        }

        return this.options.getFsrsService().getSchedulingCards(card);
    }

    private updateGlobalStats(retrievability: number): void {
        const stats = this.options.getStorage().globalStats;
        const now = Date.now();
        const today = new Date(now).setHours(0, 0, 0, 0);

        stats.totalReviews++;
        stats.averageRetention = (stats.averageRetention * (stats.totalReviews - 1) + retrievability) / stats.totalReviews;

        if (stats.lastReviewDate === 0) {
            stats.streakDays = 1;
        } else {
            const lastReviewDay = new Date(stats.lastReviewDate).setHours(0, 0, 0, 0);
            const dayDiff = Math.round((today - lastReviewDay) / (24 * 60 * 60 * 1000));

            if (dayDiff === 1) {
                stats.streakDays++;
            } else if (dayDiff > 1) {
                stats.streakDays = 1;
            }
        }

        stats.lastReviewDate = now;
    }
}

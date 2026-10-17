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
    constructor(private options: FlashcardReviewServiceOptions) {}

    trackStudyProgress(cardId: string, rating: FSRSRating): FlashcardState | null {
        const storage = this.options.getStorage();
        const card = storage.cards[cardId];
        if (!card) {
            console.error(`Tracking study progress failed: Card ${cardId} does not exist`);
            return null;
        }

        const isNewCard = card.lastReview === 0;
        const updatedCard = this.options.getFsrsService().reviewCard(card, rating);
        storage.cards[cardId] = updatedCard;

        this.updateGlobalStats(updatedCard.retrievability);
        this.options.getDailyStatsService().updateDailyStats(isNewCard, rating);

        void this.options.saveStorage().catch(error => console.error('[HiNote] Review save failed:', error));
        this.options.emitFlashcardChanged();

        return storage.cards[cardId];
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
            const dayDiff = (today - lastReviewDay) / (24 * 60 * 60 * 1000);

            if (dayDiff === 1) {
                stats.streakDays++;
            } else if (dayDiff > 1) {
                stats.streakDays = 1;
            }
        }

        stats.lastReviewDate = now;
    }
}

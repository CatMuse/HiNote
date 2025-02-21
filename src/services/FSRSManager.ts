import { 
    FlashcardState, 
    FlashcardProgress, 
    FSRSStorage, 
    FSRSGlobalStats,
    FSRSRating,
    FSRS_RATING
} from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { debounce } from 'obsidian';

export class FSRSManager {
    private fsrsService: FSRSService;
    private storage: FSRSStorage;
    private plugin: any; // CommentPlugin type

    constructor(plugin: any) {
        this.plugin = plugin;
        this.fsrsService = new FSRSService();
        this.storage = this.loadStorage();
        
        // 自动保存更改
        this.saveStorageDebounced = debounce(this.saveStorage.bind(this), 1000, true);
    }

    private loadStorage(): FSRSStorage {
        const defaultStorage: FSRSStorage = {
            version: '1.0',
            cards: {},
            globalStats: {
                totalReviews: 0,
                averageRetention: 1,
                streakDays: 0,
                lastReviewDate: 0
            }
        };

        try {
            const stored = this.plugin.settings.fsrsData;
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load FSRS storage:', error);
        }

        return defaultStorage;
    }

    private saveStorage() {
        try {
            this.plugin.settings.fsrsData = JSON.stringify(this.storage);
            this.plugin.saveSettings();
        } catch (error) {
            console.error('Failed to save FSRS storage:', error);
        }
    }

    private saveStorageDebounced: () => void;

    private updateGlobalStats(rating: FSRSRating, retrievability: number) {
        const stats = this.storage.globalStats;
        const now = Date.now();
        const today = new Date(now).setHours(0, 0, 0, 0);
        
        // 更新总复习次数
        stats.totalReviews++;
        
        // 更新平均记忆保持率
        stats.averageRetention = (stats.averageRetention * (stats.totalReviews - 1) + retrievability) / stats.totalReviews;
        
        // 更新连续学习天数
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

    public addCard(text: string, answer: string, filePath?: string): FlashcardState {
        const card = this.fsrsService.initializeCard(text, answer, filePath);
        this.storage.cards[card.id] = card;
        this.saveStorageDebounced();
        return card;
    }

    public reviewCard(cardId: string, rating: FSRSRating): FlashcardState | null {
        const card = this.storage.cards[cardId];
        if (!card) return null;

        const updatedCard = this.fsrsService.reviewCard(card, rating);
        this.storage.cards[cardId] = updatedCard;
        
        // 更新全局统计
        this.updateGlobalStats(rating, updatedCard.retrievability);
        
        this.saveStorageDebounced();
        return updatedCard;
    }

    public getDueCards(): FlashcardState[] {
        return this.fsrsService.getReviewableCards(Object.values(this.storage.cards));
    }

    public getNewCards(): FlashcardState[] {
        return Object.values(this.storage.cards)
            .filter(card => card.lastReview === 0);
    }

    public getProgress(): FlashcardProgress {
        const cards = Object.values(this.storage.cards);
        const now = Date.now();
        
        return {
            due: cards.filter(c => c.nextReview <= now).length,
            newCards: cards.filter(c => c.lastReview === 0).length,
            learned: cards.filter(c => c.lastReview > 0).length,
            retention: this.storage.globalStats.averageRetention
        };
    }

    public getStats(): FSRSGlobalStats {
        return { ...this.storage.globalStats };
    }

    public deleteCard(cardId: string): boolean {
        if (this.storage.cards[cardId]) {
            delete this.storage.cards[cardId];
            this.saveStorageDebounced();
            return true;
        }
        return false;
    }

    public getCardsByFile(filePath: string): FlashcardState[] {
        return Object.values(this.storage.cards)
            .filter(card => card.filePath === filePath);
    }

    public exportData(): FSRSStorage {
        return JSON.parse(JSON.stringify(this.storage));
    }

    public importData(data: FSRSStorage): boolean {
        try {
            // 验证数据结构
            if (typeof data.version !== 'string' || !data.cards || !data.globalStats) {
                throw new Error('Invalid FSRS data structure');
            }
            
            this.storage = data;
            this.saveStorage();
            return true;
        } catch (error) {
            console.error('Failed to import FSRS data:', error);
            return false;
        }
    }

    public reset(): void {
        this.storage = this.loadStorage();
        this.saveStorage();
    }
}

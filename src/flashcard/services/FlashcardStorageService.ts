import type CommentPlugin from '../../../main';
import type { HiNoteDataManager } from '../../storage/HiNoteDataManager';
import type { FSRSStorage } from '../types/FSRSTypes';

export class FlashcardStorageService {
    private loaded = false;
    constructor(
        private plugin: CommentPlugin,
        private dataManager?: HiNoteDataManager
    ) {}

    createDefaultStorage(): FSRSStorage {
        return {
            version: '1.0',
            cards: {},
            globalStats: {
                totalReviews: 0,
                averageRetention: 1,
                streakDays: 0,
                lastReviewDate: 0
            },
            cardGroups: [],
            uiState: {
                currentGroupName: '',
                completionMessage: null,
                groupProgress: {}
            },
            dailyStats: []
        };
    }

    async load(): Promise<FSRSStorage> {
        const storage = await this.readStorage();
        this.loaded = true;
        return storage;
    }

    private async readStorage(): Promise<FSRSStorage> {
        const defaultStorage = this.createDefaultStorage();

        try {
            if (this.dataManager) {
                const data = await this.dataManager.getFlashcardData();
                const storage = data || defaultStorage;
                this.normalize(storage);
                return storage;
            }

            const data = await this.plugin.loadData();
            if (!data?.fsrs) {
                return defaultStorage;
            }

            const storage = {
                version: data.fsrs.version || defaultStorage.version,
                cards: data.fsrs.cards || {},
                globalStats: data.fsrs.globalStats || defaultStorage.globalStats,
                cardGroups: Array.isArray(data.fsrs.cardGroups) ? data.fsrs.cardGroups : [],
                uiState: data.fsrs.uiState || defaultStorage.uiState,
                dailyStats: data.fsrs.dailyStats || []
            };
            this.normalize(storage);
            return storage;
        } catch (error) {
            throw error;
        }
    }

    async save(storage: FSRSStorage): Promise<void> {
        if (!this.loaded) throw new Error('Flashcard storage must load successfully before saving.');
        this.normalize(storage);

        try {
            if (this.dataManager) {
                await this.dataManager.saveFlashcardData(storage);
                return;
            }

            const currentData = await this.plugin.loadData() || {};
            await this.plugin.saveData({
                ...currentData,
                fsrs: storage
            });
        } catch (error) {
            console.error('Saving data failed:', error);
            throw error;
        }
    }

    private normalize(storage: FSRSStorage): void {
        if (!Array.isArray(storage.cardGroups)) {
            storage.cardGroups = [];
        }

        if (!storage.cards) {
            storage.cards = {};
        }

        for (const card of Object.values(storage.cards)) {
            card.answer = this.normalizeLegacyAnswerPlaceholder(card.answer);
        }
    }

    private normalizeLegacyAnswerPlaceholder(answer: string | undefined): string {
        if (!answer) {
            return "";
        }

        const legacyPlaceholders = ["Add answer", "添加答案"];
        for (const placeholder of legacyPlaceholders) {
            if (answer === placeholder) {
                return "";
            }
            if (answer.startsWith(`${placeholder}\n\n`)) {
                return answer.slice(placeholder.length + 2);
            }
            if (answer.startsWith(`${placeholder}\n`)) {
                return answer.slice(placeholder.length + 1);
            }
        }

        return answer;
    }
}

import { 
    FlashcardState, 
    FlashcardProgress, 
    FSRSStorage, 
    FSRSGlobalStats,
    FSRSRating,
    FSRS_RATING,
    CardGroup,
    HiCardState
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
            },
            cardGroups: [],
            uiState: {
                currentGroupName: 'All Cards',
                currentIndex: 0,
                isFlipped: false
            }
        };

        try {
            // 确保 settings 存在
            if (!this.plugin.settings) {
                this.plugin.settings = {};
            }
            
            // 确保 fsrsData 存在
            if (!this.plugin.settings.fsrsData) {
                this.plugin.settings.fsrsData = JSON.stringify(defaultStorage);
            }

            const stored = this.plugin.settings.fsrsData;
            const parsed = JSON.parse(stored);
            
            // 确保所有必要的字段都存在
            return {
                ...defaultStorage,
                ...parsed,
                cardGroups: Array.isArray(parsed.cardGroups) ? parsed.cardGroups : []
            };
        } catch (error) {
            console.error('Failed to load FSRS storage:', error);
            return defaultStorage;
        }
    }

    private async saveStorage() {
        try {
            console.log('Saving storage:', this.storage);
            
            // 确保 settings 存在
            if (!this.plugin.settings) {
                this.plugin.settings = {};
            }
            
            // 保存数据
            this.plugin.settings.fsrsData = JSON.stringify(this.storage);
            
            // 如果 saveSettings 方法存在，则调用
            if (typeof this.plugin.saveSettings === 'function') {
                await this.plugin.saveSettings();
                console.log('Settings saved through plugin');
            } else {
                // 如果没有 saveSettings，则至少保存在内存中
                console.log('No saveSettings method found, data kept in memory');
            }
            
            console.log('Storage saved successfully');
        } catch (error) {
            console.error('Failed to save FSRS storage:', error);
            throw error; // 向上传递错误以便调用者知道保存失败
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

    /**
     * 更新卡片内容，保持学习进度不变
     * @param text 新的高亮文本
     * @param answer 新的评论内容
     * @param filePath 文件路径
     */
    public updateCardContent(text: string, answer: string, filePath: string): void {
        // 找到对应文件的所有卡片
        const cards = this.getCardsByFile(filePath);
        
        // 遍历卡片，找到匹配的旧文本并更新
        for (const card of cards) {
            if (card.text === text || card.answer === answer) {
                // 更新卡片内容，保持其他属性（如学习进度）不变
                this.storage.cards[card.id] = {
                    ...card,
                    text,
                    answer
                };
                this.saveStorageDebounced();
            }
        }
    }

    /**
     * 删除指定文件路径下的卡片
     * @param filePath 文件路径
     * @param text 可选，特定的高亮文本
     * @param answer 可选，特定的评论内容
     */
    public deleteCardsByContent(filePath: string, text?: string, answer?: string): void {
        const cards = this.getCardsByFile(filePath);
        
        for (const card of cards) {
            if (!text && !answer || // 如果没有指定text和answer，删除该文件的所有卡片
                (text && card.text === text) || // 如果指定了text，匹配text
                (answer && card.answer === answer)) { // 如果指定了answer，匹配answer
                delete this.storage.cards[card.id];
            }
        }
        
        this.saveStorageDebounced();
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

    public getLatestCards(): FlashcardState[] {
        // 按文本内容分组，每组只保留最新的卡片
        const cardsByText = Object.values(this.storage.cards).reduce((acc, card) => {
            if (!acc[card.text] || acc[card.text].id < card.id) {
                acc[card.text] = card;
            }
            return acc;
        }, {} as Record<string, FlashcardState>);
        
        return Object.values(cardsByText);
    }

    public getProgress(): FlashcardProgress {
        const cards = this.getLatestCards();
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

    // UI状态管理
    public getUIState(): HiCardState {
        return { ...this.storage.uiState };
    }

    public updateUIState(state: Partial<HiCardState>) {
        this.storage.uiState = {
            ...this.storage.uiState,
            ...state
        };
        this.saveStorageDebounced();
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

    // 卡片分组管理
    public getCardGroups(): CardGroup[] {
        if (!this.storage.cardGroups) {
            this.storage.cardGroups = [];
        }
        return this.storage.cardGroups;
    }

    private generateUUID(): string {
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 15);
        return `${timestamp}-${randomStr}`;
    }

    public async createCardGroup(group: Omit<CardGroup, 'id'>): Promise<CardGroup> {
        console.log('Creating new card group:', group);
        
        if (!this.storage.cardGroups) {
            console.log('Initializing cardGroups array');
            this.storage.cardGroups = [];
        }

        const newGroup: CardGroup = {
            ...group,
            id: this.generateUUID()
        };
        
        console.log('New group created:', newGroup);
        this.storage.cardGroups.push(newGroup);
        
        console.log('Current groups:', this.storage.cardGroups);
        try {
            await this.saveStorage(); // 等待保存完成
            console.log('Storage saved');
            return newGroup;
        } catch (error) {
            // 如果保存失败，回滚更改
            this.storage.cardGroups.pop();
            throw error;
        }
    }

    public async updateCardGroup(groupId: string, updates: Partial<Omit<CardGroup, 'id'>>): Promise<boolean> {
        if (!this.storage.cardGroups) return false;
        
        const index = this.storage.cardGroups.findIndex(g => g.id === groupId);
        if (index === -1) return false;

        this.storage.cardGroups[index] = {
            ...this.storage.cardGroups[index],
            ...updates,
            id: groupId // 确保 id 不被更新
        };
        
        try {
            await this.saveStorage();
            return true;
        } catch (error) {
            console.error('Failed to update card group:', error);
            return false;
        }
    }

    public async deleteCardGroup(groupId: string): Promise<boolean> {
        if (!this.storage.cardGroups) return false;
        
        const index = this.storage.cardGroups.findIndex(g => g.id === groupId);
        if (index === -1) return false;

        const deletedGroup = this.storage.cardGroups[index];
        this.storage.cardGroups.splice(index, 1);
        
        try {
            await this.saveStorage();
            return true;
        } catch (error) {
            // 如果删除失败，恢复组
            this.storage.cardGroups.splice(index, 0, deletedGroup);
            console.error('Failed to delete card group:', error);
            return false;
        }
    }

    public getGroupProgress(groupId: string): FlashcardProgress | null {
        const group = this.storage.cardGroups.find(g => g.id === groupId);
        if (!group) return null;
        
        const cards = this.getCardsInGroup(group);
        const now = Date.now();
        
        return {
            due: cards.filter(c => c.nextReview <= now).length,
            newCards: cards.filter(c => c.lastReview === 0).length,
            learned: cards.filter(c => c.lastReview > 0).length,
            retention: this.calculateGroupRetention(cards)
        };
    }

    private calculateGroupRetention(cards: FlashcardState[]): number {
        const reviewedCards = cards.filter(c => c.lastReview > 0);
        if (reviewedCards.length === 0) return 1;
        
        const totalRetention = reviewedCards.reduce((sum, card) => sum + card.retrievability, 0);
        return totalRetention / reviewedCards.length;
    }

    public getCardsInGroup(group: CardGroup): FlashcardState[] {
        console.log('Getting cards for group:', group);
        const latestCards = this.getLatestCards();
        console.log('Total latest cards:', latestCards.length);
        
        const result = latestCards.filter(card => {
            const filters = group.filter.split(',').map(f => f.trim().toLowerCase());
            const cardText = card.text.toLowerCase();
            const cardAnswer = card.answer.toLowerCase();
            const filePath = (card.filePath || '').toLowerCase();
            
            console.log('\nChecking card:', {
                filePath,
                cardText: cardText.substring(0, 50) + '...',
                filters
            });
            
            const matches = filters.some(filter => {
                // 检查标签
                if (filter.startsWith('#')) {
                    const tagToFind = filter.substring(1);
                    const tags = this.extractTagsFromText(cardText);
                    const matches = tags.some(tag => tag.toLowerCase() === tagToFind);
                    console.log('Tag check:', { tagToFind, tags, matches });
                    return matches;
                }
                
                // 检查笔记链接
                if (filter.startsWith('[[') && filter.endsWith(']]')) {
                    const noteName = filter.slice(2, -2);
                    const matches = filePath.includes(noteName);
                    console.log('Note link check:', { noteName, matches });
                    return matches;
                }
                
                // 检查通配符
                if (filter.includes('*')) {
                    const pattern = filter
                        .replace(/\./g, '\\.')
                        .replace(/\*/g, '.*');
                    const regex = new RegExp(pattern, 'i');
                    const matches = regex.test(filePath);
                    console.log('Wildcard check:', { pattern, matches });
                    return matches;
                }
                
                // 检查文件路径
                const pathMatches = filePath.includes(filter);
                console.log('Path check:', { filter, matches: pathMatches });
                if (pathMatches) return true;
                
                // 检查卡片内容
                const contentMatches = cardText.includes(filter) || cardAnswer.includes(filter);
                console.log('Content check:', { filter, matches: contentMatches });
                return contentMatches;
            });
            
            console.log('Card matches:', matches);
            return matches;
        });
        
        console.log('Filtered cards:', result.length);
        return result;
    }

    private extractTagsFromText(text: string): string[] {
        const tagRegex = /#([\w-]+)/g;
        const matches = text.match(tagRegex);
        return matches ? matches.map(tag => tag.substring(1)) : [];
    }
}

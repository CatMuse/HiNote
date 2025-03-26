import { 
    FlashcardState, 
    FlashcardProgress, 
    FSRSStorage, 
    FSRSGlobalStats,
    FSRSRating,
    FSRS_RATING,
    CardGroup,
    HiCardState,
    DailyStats
} from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { debounce } from 'obsidian';

export class FSRSManager {
    public fsrsService: FSRSService;
    private storage: FSRSStorage;
    private plugin: any; // CommentPlugin type

    constructor(plugin: any) {
        this.plugin = plugin;
        this.fsrsService = new FSRSService();
        this.storage = {
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
                isFlipped: false,
                completionMessage: null,
                groupCompletionMessages: {},
                groupProgress: {}
            },
            dailyStats: [] // 初始化每日学习统计数据
        };
        
        // 自动保存更改
        this.saveStorageDebounced = debounce(this.saveStorage.bind(this), 1000, true);
        
        // 异步加载存储数据
        this.loadStorage().then(storage => {

            this.storage = storage;
        }).catch(error => {

        });
    }

    private async loadStorage(): Promise<FSRSStorage> {
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
                isFlipped: false,
                completionMessage: null,
                groupCompletionMessages: {},
                groupProgress: {}
            },
            dailyStats: []
        };

        try {
            const data = await this.plugin.loadData();

            if (!data?.fsrs) {

                return defaultStorage;
            }

            // Ensure cardGroups is properly initialized
            const cardGroups = Array.isArray(data.fsrs.cardGroups) ? data.fsrs.cardGroups : [];

            const storage = {
                ...defaultStorage,
                ...data.fsrs,
                cardGroups
            };

            return storage;
        } catch (error) {

            return defaultStorage;
        }
    }

    private async saveStorage() {
        try {
            // Log current storage state
            

            // 加载当前数据
            const currentData = await this.plugin.loadData() || {};
            
            // Ensure cardGroups is properly initialized before saving
            if (!Array.isArray(this.storage.cardGroups)) {

                this.storage.cardGroups = [];
            }

            // 更新 FSRS 数据，保持其他数据不变
            const dataToSave = {
                ...currentData,
                fsrs: this.storage
            };

            await this.plugin.saveData(dataToSave);

            // Verify save
            const verifyData = await this.plugin.loadData();

        } catch (error) {

            throw error;
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
        this.plugin.eventManager.emitFlashcardChanged();
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
                this.plugin.eventManager.emitFlashcardChanged();
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
        let deleted = false;
        
        for (const card of cards) {
            if (!text && !answer || // 如果没有指定text和answer，删除该文件的所有卡片
                (text && card.text === text) || // 如果指定了text，匹配text
                (answer && card.answer === answer)) { // 如果指定了answer，匹配answer
                delete this.storage.cards[card.id];
                deleted = true;
            }
        }
        
        if (deleted) {
            this.saveStorageDebounced();
            this.plugin.eventManager.emitFlashcardChanged();
        }
    }

    /**
     * 对卡片进行评分
     * @param cardId 卡片ID
     * @param rating 评分 (0-3: Again, Hard, Good, Easy)
     */
    public rateCard(cardId: string, rating: FSRSRating): void {
        const card = this.storage.cards[cardId];
        if (!card) return;
        
        const isNewCard = card.reviews === 0;
        
        // 使用FSRS算法更新卡片状态
        const updatedCard = this.fsrsService.reviewCard(card, rating);
        this.storage.cards[cardId] = updatedCard;
        
        // 更新全局统计数据
        this.storage.globalStats.totalReviews++;
        
        // 更新今天的学习统计数据
        this.updateTodayStats(isNewCard);
        
        // 更新最后复习日期和连续学习天数
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        
        if (this.storage.globalStats.lastReviewDate === 0) {
            // 第一次复习
            this.storage.globalStats.lastReviewDate = todayTimestamp;
            this.storage.globalStats.streakDays = 1;
        } else if (this.storage.globalStats.lastReviewDate === todayTimestamp) {
            // 今天已经复习过
            // 不需要更新
        } else if (this.storage.globalStats.lastReviewDate === todayTimestamp - 86400000) {
            // 昨天复习过，连续学习天数+1
            this.storage.globalStats.lastReviewDate = todayTimestamp;
            this.storage.globalStats.streakDays++;
        } else if (this.storage.globalStats.lastReviewDate < todayTimestamp) {
            // 之前复习过，但不是昨天，重置连续学习天数
            this.storage.globalStats.lastReviewDate = todayTimestamp;
            this.storage.globalStats.streakDays = 1;
        }
        
        // 保存更改
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
        this.plugin.eventManager.emitFlashcardChanged();
        return updatedCard;
    }

    /**
     * 获取今天到期需要复习的卡片
     * @returns 今天需要复习的卡片列表
     */
    public getDueCards(): FlashcardState[] {
        const dueCards = this.fsrsService.getReviewableCards(Object.values(this.storage.cards));
        
        // 如果设置了每日复习限制，则限制返回的卡片数量
        const remainingReviews = this.getRemainingReviewsToday();
        if (remainingReviews <= 0) {
            return []; // 今天的复习配额已用完
        }
        
        return dueCards.slice(0, remainingReviews);
    }

    /**
     * 获取新卡片（从未学习过的卡片）
     * @returns 新卡片列表
     */
    public getNewCards(): FlashcardState[] {
        const newCards = Object.values(this.storage.cards)
            .filter(card => card.reviews === 0);
        
        // 如果设置了每日新卡片限制，则限制返回的卡片数量
        const remainingNew = this.getRemainingNewCardsToday();
        if (remainingNew <= 0) {
            return []; // 今天的新卡片学习配额已用完
        }
        
        return newCards.slice(0, remainingNew);
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
            this.plugin.eventManager.emitFlashcardChanged();
            return true;
        }
        return false;
    }

    public getCardsByFile(filePath: string): FlashcardState[] {
        const cards = Object.values(this.storage.cards)
            .filter(card => card.filePath === filePath);
        
        
        
        return cards;
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

            return false;
        }
    }

    public async reset(): Promise<void> {
        try {
            this.storage = await this.loadStorage();
            await this.saveStorage();

        } catch (error) {

            throw error;
        }
    }

    // 卡片分组管理
    public getCardGroups(): CardGroup[] {
        if (!Array.isArray(this.storage.cardGroups)) {

            this.storage.cardGroups = [];
            this.saveStorageDebounced();
        }
        return this.storage.cardGroups;
    }

    private generateUUID(): string {
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 15);
        return `${timestamp}-${randomStr}`;
    }

    public async createCardGroup(group: Omit<CardGroup, 'id'>): Promise<CardGroup> {

        if (!this.storage.cardGroups) {

            this.storage.cardGroups = [];
        }

        // 获取全局设置作为默认值
        const params = this.fsrsService.getParameters();

        // 保留传入的设置，如果没有提供则使用默认值
        const newGroup: CardGroup = {
            ...group,
            id: this.generateUUID(),
            settings: group.settings || {
                useGlobalSettings: true,  // 默认使用全局设置
                newCardsPerDay: params.newCardsPerDay,
                reviewsPerDay: params.reviewsPerDay
            }
        };

        this.storage.cardGroups.push(newGroup);

        try {
            await this.saveStorage(); // 等待保存完成

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

        const latestCards = this.getLatestCards();

        const result = latestCards.filter(card => {
            const filters = group.filter.split(',').map(f => f.trim().toLowerCase());
            const cardText = card.text.toLowerCase();
            const cardAnswer = card.answer.toLowerCase();
            const filePath = (card.filePath || '').toLowerCase();
            
            
            
            const matches = filters.some(filter => {
                // 检查标签
                if (filter.startsWith('#')) {
                    const tagToFind = filter.substring(1);
                    // 从卡片文本中提取标签
                    const tagsInText = this.extractTagsFromText(cardText);
                    // 从卡片答案中提取标签
                    const tagsInAnswer = this.extractTagsFromText(cardAnswer);
                    // 合并所有标签
                    const allTags = [...tagsInText, ...tagsInAnswer];
                    
                    // 检查卡片文本中是否直接包含完整的标签字符串（包括#符号）
                    const directTagMatch = cardText.includes(filter) || cardAnswer.includes(filter);
                    
                    // 检查提取的标签是否匹配
                    const extractedTagMatch = allTags.some(tag => 
                        tag.toLowerCase() === tagToFind || 
                        tag.toLowerCase().includes(tagToFind)
                    );
                    
                    const matches = directTagMatch || extractedTagMatch;
                    
                    return matches;
                }
                
                // 检查笔记链接
                if (filter.startsWith('[[') && filter.endsWith(']]')) {
                    const noteName = filter.slice(2, -2);
                    const matches = filePath.includes(noteName);

                    return matches;
                }
                
                // 检查通配符
                if (filter.includes('*')) {
                    const pattern = filter
                        .replace(/\./g, '\\.')
                        .replace(/\*/g, '.*');
                    const regex = new RegExp(pattern, 'i');
                    const matches = regex.test(filePath);

                    return matches;
                }
                
                // 检查文件路径
                const pathMatches = filePath.includes(filter);

                if (pathMatches) return true;
                
                // 检查卡片内容
                const contentMatches = cardText.includes(filter) || cardAnswer.includes(filter);

                return contentMatches;
            });

            return matches;
        });

        return result;
    }

    private extractTagsFromText(text: string): string[] {
        // 修改正则表达式以支持更广泛的标签格式，包括中文和其他特殊字符
        const tagRegex = /#([^\s#]+)/g;
        const matches = text.match(tagRegex);

        return matches ? matches.map(tag => tag.substring(1)) : [];
    }

    /**
     * 获取今天的日期时间戳（0点）
     */
    private getTodayTimestamp(): number {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today.getTime();
    }

    /**
     * 获取或创建今天的学习统计数据
     */
    private getTodayStats(): DailyStats {
        const todayTimestamp = this.getTodayTimestamp();
        let todayStats = this.storage.dailyStats.find(stats => stats.date === todayTimestamp);
        
        if (!todayStats) {
            todayStats = {
                date: todayTimestamp,
                newCardsLearned: 0,
                cardsReviewed: 0
            };
            this.storage.dailyStats.push(todayStats);
            
            // 只保留最近30天的数据
            if (this.storage.dailyStats.length > 30) {
                this.storage.dailyStats.sort((a, b) => b.date - a.date);
                this.storage.dailyStats = this.storage.dailyStats.slice(0, 30);
            }
        }
        
        return todayStats;
    }

    /**
     * 更新今天的学习统计数据
     * @param isNewCard 是否是新卡片
     */
    private updateTodayStats(isNewCard: boolean): void {
        const todayStats = this.getTodayStats();
        
        if (isNewCard) {
            todayStats.newCardsLearned++;
        } else {
            todayStats.cardsReviewed++;
        }
        
        this.saveStorageDebounced();
    }

    /**
     * 检查今天是否还能学习新卡片
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public canLearnNewCardsToday(groupId?: string): boolean {
        const todayStats = this.getTodayStats();
        const params = this.fsrsService.getParameters();
        
        // 如果提供了分组ID，检查是否有分组特定的设置
        if (groupId) {
            const group = this.storage.cardGroups.find(g => g.id === groupId);
            if (group && group.settings && !group.settings.useGlobalSettings && group.settings.newCardsPerDay !== undefined) {
                return todayStats.newCardsLearned < group.settings.newCardsPerDay;
            }
        }
        
        // 使用全局设置
        return todayStats.newCardsLearned < params.newCardsPerDay;
    }

    /**
     * 检查今天是否还能复习卡片
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public canReviewCardsToday(groupId?: string): boolean {
        const todayStats = this.getTodayStats();
        const params = this.fsrsService.getParameters();
        
        // 如果提供了分组ID，检查是否有分组特定的设置
        if (groupId) {
            const group = this.storage.cardGroups.find(g => g.id === groupId);
            if (group && group.settings && !group.settings.useGlobalSettings && group.settings.reviewsPerDay !== undefined) {
                return todayStats.cardsReviewed < group.settings.reviewsPerDay;
            }
        }
        
        // 使用全局设置
        return todayStats.cardsReviewed < params.reviewsPerDay;
    }

    /**
     * 获取今天剩余的新卡片学习数量
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public getRemainingNewCardsToday(groupId?: string): number {
        const todayStats = this.getTodayStats();
        const params = this.fsrsService.getParameters();
        
        // 如果提供了分组ID，检查是否有分组特定的设置
        if (groupId) {
            const group = this.storage.cardGroups.find(g => g.id === groupId);
            if (group && group.settings && !group.settings.useGlobalSettings && group.settings.newCardsPerDay !== undefined) {
                return Math.max(0, group.settings.newCardsPerDay - todayStats.newCardsLearned);
            }
        }
        
        // 使用全局设置
        return Math.max(0, params.newCardsPerDay - todayStats.newCardsLearned);
    }

    /**
     * 获取今天剩余的复习卡片数量
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public getRemainingReviewsToday(groupId?: string): number {
        const todayStats = this.getTodayStats();
        const params = this.fsrsService.getParameters();
        
        // 如果提供了分组ID，检查是否有分组特定的设置
        if (groupId) {
            const group = this.storage.cardGroups.find(g => g.id === groupId);
            if (group && group.settings && !group.settings.useGlobalSettings && group.settings.reviewsPerDay !== undefined) {
                return Math.max(0, group.settings.reviewsPerDay - todayStats.cardsReviewed);
            }
        }
        
        // 使用全局设置
        return Math.max(0, params.reviewsPerDay - todayStats.cardsReviewed);
    }
}

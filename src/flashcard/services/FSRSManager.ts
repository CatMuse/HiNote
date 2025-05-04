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
                currentGroupName: 'All cards',
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
                currentGroupName: 'All cards',
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
            // 加载当前数据
            const currentData = await this.plugin.loadData() || {};
            
            // 确保 cardGroups 在保存前正确初始化
            if (!Array.isArray(this.storage.cardGroups)) {
                this.storage.cardGroups = [];
            }

            // 确保 cards 对象存在
            if (!this.storage.cards) {
                this.storage.cards = {};
            }

            // 更新 FSRS 数据，保持其他数据不变
            const dataToSave = {
                ...currentData,
                fsrs: this.storage
            };

            await this.plugin.saveData(dataToSave);

        } catch (error) {
            console.error('保存数据时出错:', error);
            throw error;
        }    }

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
        
        // 确保 storage.cards 存在
        if (!this.storage.cards) {
            this.storage.cards = {};
        }
        
        this.storage.cards[card.id] = card;
        
        // 立即保存，而不是使用防抖
        this.saveStorage().then(() => {
            this.plugin.eventManager.emitFlashcardChanged();
        }).catch(err => {
            console.error('保存卡片时出错:', err);
        });
        
        return card;
    }
    
    /**
     * 更新卡片内容（用于高亮文本或批注更新时）
     * @param text 更新的文本内容
     * @param answer 更新的答案内容
     * @param filePath 文件路径
     */
    public updateCardContent(text: string, answer: string, filePath?: string): void {
        if (!filePath) {
            return;
        }
        
        // 获取指定文件的所有卡片
        const cardsInFile = this.getCardsByFile(filePath);
        
        // 如果提供了文本，更新匹配文本的卡片
        if (text) {
            const cardsWithText = cardsInFile.filter(card => card.text.includes(text));
            
            cardsWithText.forEach(card => {
                // 更新卡片文本，保留其他属性不变
                this.storage.cards[card.id] = {
                    ...card,
                    text: text // 使用新文本替换
                };
            });
        }
        
        // 如果提供了答案，更新匹配答案的卡片
        if (answer) {
            const cardsWithAnswer = cardsInFile.filter(card => card.answer.includes(answer));
            
            cardsWithAnswer.forEach(card => {
                // 更新卡片答案，保留其他属性不变
                this.storage.cards[card.id] = {
                    ...card,
                    answer: answer // 使用新答案替换
                };
            });
        }
        
        // 保存更改
        this.saveStorage().then(() => {
            this.plugin.eventManager.emitFlashcardChanged();
        }).catch(err => {
            console.error('更新卡片内容时出错:', err);
        });
    }

    // updateCardContent 方法已被删除，因为不再需要更新卡片内容的逻辑

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
        // 查找卡片
        const card = this.storage.cards[cardId];
        if (!card) return;

        // 使用 FSRS 服务进行评分
        const updatedCard = this.fsrsService.reviewCard(card, rating);
        
        // 更新卡片状态
        this.storage.cards[cardId] = updatedCard;
        
        // 更新全局统计数据
        this.updateGlobalStats(rating, updatedCard.retrievability);
        
        // 更新每日统计数据
        this.updateDailyStats(true, rating);
        
        // 保存更改
        this.saveStorageDebounced();
    }
    
    /**
     * 更新每日学习统计
     * @param isNewCard 是否是新卡片
     * @param rating 评分
     */
    private updateDailyStats(isNewCard: boolean, rating: FSRSRating) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        
        // 更新全局统计
        if (!this.storage.globalStats.lastReviewDate) {
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
        
        // 使用日期字符串比较而不是时间戳
        const todayDateStr = today.toDateString();
        let todayStats = this.storage.dailyStats.find(stats => {
            const statsDate = new Date(stats.date);
            return statsDate.toDateString() === todayDateStr;
        });
        
        // 如果不存在，创建新的统计数据
        if (!todayStats) {
            todayStats = {
                date: todayTimestamp,
                newCardsLearned: 0,
                cardsReviewed: 0,
                reviewCount: 0,
                newCount: 0,
                againCount: 0,
                hardCount: 0,
                goodCount: 0,
                easyCount: 0
            };
            this.storage.dailyStats.push(todayStats);
        }
        
        // 更新统计数据
        todayStats.reviewCount++;
        
        if (isNewCard) {
            todayStats.newCount++;
            todayStats.newCardsLearned++;
        } else {
            todayStats.cardsReviewed++;
        }
        
        // 更新评分统计
        switch (rating) {
            case FSRS_RATING.AGAIN:
                todayStats.againCount++;
                break;
            case FSRS_RATING.HARD:
                todayStats.hardCount++;
                break;
            case FSRS_RATING.GOOD:
                todayStats.goodCount++;
                break;
            case FSRS_RATING.EASY:
                todayStats.easyCount++;
                break;
        }
        
        // 保存到存储
        this.saveStorage();
    }

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

    /**
     * reviewCard 方法 - 作为 rateCard 的别名，用于兼容性
     * @param cardId 卡片ID
     * @param rating 评分 (0-3: Again, Hard, Good, Easy)
     * @returns 更新后的卡片状态
     */
    public reviewCard(cardId: string, rating: FSRSRating): FlashcardState | null {
        // 调用 rateCard 方法
        this.rateCard(cardId, rating);
        
        // 返回更新后的卡片
        return this.storage.cards[cardId] || null;
    }
    
    // 获取卡片在不同评分下的预测结果
    // @param cardId 卡片ID
    // @returns 不同评分下的预测结果，如果卡片不存在则返回 null
    public getCardPredictions(cardId: string): Record<FSRSRating, FlashcardState> | null {
        const card = this.storage.cards[cardId];
        if (!card) return null;
        
        // 使用 FSRS 服务获取预测结果
        return this.fsrsService.getSchedulingCards(card);
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
    
    /**
     * 根据内容查找卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 可选的文件路径
     * @returns 找到的卡片或 null
     */
    public findCardByContent(text: string, answer: string, filePath?: string): FlashcardState | null {
        // 获取所有卡片
        const allCards = Object.values(this.storage.cards);
        
        // 查找匹配的卡片
        const matchingCard = allCards.find(card => {
            // 检查文本内容是否匹配
            const textMatch = card.text === text;
            
            // 检查答案内容是否匹配
            const answerMatch = card.answer === answer;
            
            // 检查文件路径是否匹配（如果提供了文件路径）
            const pathMatch = !filePath || card.filePath === filePath;
            
            return textMatch && answerMatch && pathMatch;
        });
        
        return matchingCard || null;
    }

    /**
     * 获取所有卡片的总数（只统计自定义分组中的卡片）
     * @returns 卡片总数
     */
    public getTotalCardsCount(): number {
        // 获取所有自定义分组
        const allGroups = this.getCardGroups() || [];
        if (allGroups.length === 0) {
            return 0; // 如果没有自定义分组，返回0
        }
        
        // 收集所有自定义分组中的卡片ID
        const customGroupCards = new Set<string>();
        
        // 遍历所有自定义分组，收集卡片ID
        allGroups.forEach(group => {
            const groupCards = this.getCardsInGroup(group);
            groupCards.forEach(card => {
                customGroupCards.add(card.id);
            });
        });
        
        // 返回去重后的卡片数量
        return customGroupCards.size;
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

    /**
     * 删除卡片
     * @param cardId 卡片ID
     * @returns 是否删除成功
     */
    public deleteCard(cardId: string): boolean {
        const card = this.storage.cards[cardId];
        if (!card) return false;
        
        // 如果卡片关联了分组，需要更新分组的卡片列表
        if (card.groupIds && card.groupIds.length > 0) {
            for (const groupId of card.groupIds) {
                const group = this.storage.cardGroups.find(g => g.id === groupId);
                if (group && group.cardIds) {
                    // 从分组的卡片列表中移除该卡片
                    group.cardIds = group.cardIds.filter(id => id !== cardId);
                    // 更新分组的最后更新时间
                    group.lastUpdated = Date.now();
                }
            }
        }
        
        // 删除卡片
        delete this.storage.cards[cardId];
        this.saveStorageDebounced();
        this.plugin.eventManager.emitFlashcardChanged();
        return true;
    }

    public getCardsByFile(filePath: string): FlashcardState[] {
        const cards = Object.values(this.storage.cards)
            .filter(card => card.filePath === filePath);
        
        return cards;
    }
    
    /**
     * 获取插件实例（公共方法，供外部访问）
     * @returns 插件实例
     */
    public getPlugin(): any {
        return this.plugin;
    }
    
    /**
     * 公共保存方法，供外部调用
     * @returns Promise<void>
     */
    public async saveStoragePublic(): Promise<void> {
        return this.saveStorage();
    }
    
    /**
     * 将卡片添加到分组
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否添加成功
     */
    public addCardToGroup(cardId: string, groupId: string): boolean {
        const card = this.storage.cards[cardId];
        const group = this.storage.cardGroups.find(g => g.id === groupId);
        
        if (!card || !group) return false;
        
        // 初始化卡片的分组ID列表
        if (!card.groupIds) {
            card.groupIds = [];
        }
        
        // 初始化分组的卡片ID列表
        if (!group.cardIds) {
            group.cardIds = [];
        }
        
        // 如果卡片已经在分组中，直接返回成功
        if (card.groupIds.includes(groupId) && group.cardIds.includes(cardId)) {
            return true;
        }
        
        // 添加关联
        if (!card.groupIds.includes(groupId)) {
            card.groupIds.push(groupId);
        }
        
        if (!group.cardIds.includes(cardId)) {
            group.cardIds.push(cardId);
        }
        
        // 更新分组的最后更新时间
        group.lastUpdated = Date.now();
        
        this.saveStorageDebounced();
        return true;
    }
    
    /**
     * 从分组中移除卡片
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否移除成功
     */
    public removeCardFromGroup(cardId: string, groupId: string): boolean {
        const card = this.storage.cards[cardId];
        const group = this.storage.cardGroups.find(g => g.id === groupId);
        
        if (!card || !group) return false;
        
        // 移除关联
        if (card.groupIds) {
            card.groupIds = card.groupIds.filter(id => id !== groupId);
        }
        
        if (group.cardIds) {
            group.cardIds = group.cardIds.filter(id => id !== cardId);
        }
        
        // 更新分组的最后更新时间
        group.lastUpdated = Date.now();
        
        this.saveStorageDebounced();
        return true;
    }
    
    /**
     * 获取分组中的所有卡片（通过关联ID）
     * @param groupId 分组ID
     * @returns 分组中的卡片列表
     */
    public getCardsByGroupId(groupId: string): FlashcardState[] {
        const group = this.storage.cardGroups.find(g => g.id === groupId);
        if (!group || !group.cardIds || group.cardIds.length === 0) {
            // 如果分组不存在或没有关联卡片，使用过滤条件获取卡片
            return group ? this.getCardsInGroup(group) : [];
        }
        
        // 通过ID直接获取卡片
        return group.cardIds
            .map(id => this.storage.cards[id])
            .filter(card => card !== undefined);
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

        // 检查是否已存在同名分组
        const existingGroup = this.storage.cardGroups.find(g => g.name === group.name);
        if (existingGroup) {
            throw new Error(`Group with name '${group.name}' already exists`);
        }

        // 生成唯一ID
        const id = this.generateUUID();

        // 创建新分组
        const newGroup: CardGroup = {
            id,
            name: group.name,
            filter: group.filter || '',
            createdTime: Date.now(),
            sortOrder: this.storage.cardGroups.length,
            isReversed: group.isReversed || false,
            settings: group.settings || {
                useGlobalSettings: true
            },
            cardIds: [] // 初始化空卡片列表
        };

        // 添加到存储
        this.storage.cardGroups.push(newGroup);
        await this.saveStorage();
        
        // 为新分组生成闪卡
        const newCardsCount = await this.generateCardsForGroup(newGroup.id);
        console.log(`为分组 ${newGroup.name} 创建了 ${newCardsCount} 张闪卡`);

        return newGroup;
    }

    public async updateCardGroup(groupId: string, updates: Partial<Omit<CardGroup, 'id'>>): Promise<boolean> {
        if (!this.storage.cardGroups) return false;

        const group = this.storage.cardGroups.find(g => g.id === groupId);
        if (!group) return false;

        // 检查是否更改了名称，如果是，确保新名称不与其他分组冲突
        if (updates.name && updates.name !== group.name) {
            const existingGroup = this.storage.cardGroups.find(g => g.name === updates.name && g.id !== groupId);
            if (existingGroup) {
                throw new Error(`Group with name '${updates.name}' already exists`);
            }
        }
        
        // 记录更新前的过滤条件
        const oldFilter = group.filter;

        // 更新分组
        Object.assign(group, updates);

        await this.saveStorage();
        
        // 如果过滤条件发生变化，重新生成闪卡
        if (updates.filter && updates.filter !== oldFilter) {
            // 先删除该分组下的所有卡片
            if (group.cardIds && group.cardIds.length > 0) {
                console.log(`分组过滤条件已更改，删除旧卡片: ${group.cardIds.length} 张`);
                for (const cardId of [...group.cardIds]) { // 创建副本以避免在遍历过程中修改数组
                    this.deleteCard(cardId);
                }
                // 清空卡片ID列表
                group.cardIds = [];
                await this.saveStorage();
            }
            
            // 重新生成闪卡
            const newCardsCount = await this.generateCardsForGroup(groupId);
            console.log(`为分组 ${group.name} 重新创建了 ${newCardsCount} 张闪卡`);
        }
        
        return true;
    }

    /**
     * 删除分组
     * @param groupId 分组ID
     * @param deleteCards 是否同时删除分组内的卡片，默认为 true
     * @returns 是否删除成功
     */
    public async deleteCardGroup(groupId: string, deleteCards = true): Promise<boolean> {
        if (!this.storage.cardGroups) return false;
        
        const index = this.storage.cardGroups.findIndex(g => g.id === groupId);
        if (index === -1) return false;

        const deletedGroup = this.storage.cardGroups[index];
        
        // 清理 UI 状态
        const uiState = this.storage.uiState;
        
        // 1. 清理分组完成消息
        if (uiState.groupCompletionMessages && deletedGroup.name in uiState.groupCompletionMessages) {
            delete uiState.groupCompletionMessages[deletedGroup.name];
        }
        
        // 2. 清理分组学习进度
        if (uiState.groupProgress && deletedGroup.name in uiState.groupProgress) {
            delete uiState.groupProgress[deletedGroup.name];
        }
        
        // 3. 如果当前活动分组是被删除的分组，切换到默认分组
        if (uiState.currentGroupName === deletedGroup.name) {
            uiState.currentGroupName = 'All cards';
            uiState.currentIndex = 0;
            uiState.isFlipped = false;
            uiState.completionMessage = null;
        }
        
        // 获取该分组内的所有卡片
        const cardsInGroup = deletedGroup.cardIds || [];
        
        if (deleteCards) {
            // 删除分组内的所有卡片
            for (const cardId of cardsInGroup) {
                this.deleteCard(cardId);
            }
        } else {
            // 仅解除卡片与分组的关联
            for (const cardId of cardsInGroup) {
                const card = this.storage.cards[cardId];
                if (card && card.groupIds) {
                    card.groupIds = card.groupIds.filter(id => id !== groupId);
                }
            }
        }
        
        // 删除分组
        this.storage.cardGroups.splice(index, 1);
        
        try {
            await this.saveStorage();
            // 触发闪卡变化事件
            this.plugin.eventManager.emitFlashcardChanged();
            return true;
        } catch (error) {
            // 如果删除失败，恢复组（但卡片和 UI 状态已被删除，无法完全恢复）
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
                cardsReviewed: 0,
                reviewCount: 0,
                newCount: 0,
                againCount: 0,
                hardCount: 0,
                goodCount: 0,
                easyCount: 0
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

    /**
     * 根据分组条件生成闪卡
     * @param groupId 分组ID
     * @returns 新创建的卡片数量
     */
    public async generateCardsForGroup(groupId: string): Promise<number> {
        const group = this.storage.cardGroups.find(g => g.id === groupId);
        if (!group) return 0;
        
        // 获取所有文件
        const allFiles = this.plugin.app.vault.getMarkdownFiles();
        const highlightService = this.plugin.highlightService;
        const commentStore = this.plugin.commentStore;
        
        // 根据分组过滤条件筛选文件
        const filteredFiles: any[] = [];
        const filterText = group.filter.toLowerCase();
        
        // 检查是否有文件相关的过滤条件
        const hasFileFilter = (
            filterText.includes('path:') || 
            filterText.includes('[[') || 
            filterText.includes('.md') ||
            // 检查是否包含文件夹路径格式
            /[\\\/]/.test(filterText)
        );
        
        if (hasFileFilter) {
            // 文件路径筛选 - path: 前缀
            if (filterText.includes('path:')) {
                const pathMatches = [...filterText.matchAll(/path:([^\s]+)/g)];
                if (pathMatches.length > 0) {
                    for (const match of pathMatches) {
                        const pathFilter = match[1];
                        for (const file of allFiles) {
                            if (file.path.toLowerCase().includes(pathFilter) && 
                                highlightService.shouldProcessFile(file) &&
                                !filteredFiles.includes(file)) {
                                filteredFiles.push(file);
                            }
                        }
                    }
                }
            }
            
            // Wiki 链接格式 [[文件名]]
            if (filterText.includes('[[')) {
                const wikiMatches = [...filterText.matchAll(/\[\[([^\]]+)\]\]/g)];
                if (wikiMatches.length > 0) {
                    for (const match of wikiMatches) {
                        const fileName = match[1].toLowerCase();
                        for (const file of allFiles) {
                            // 检查文件名（不含扩展名）或完整路径
                            const fileNameWithoutExt = file.basename.toLowerCase();
                            if ((fileNameWithoutExt === fileName || 
                                 file.path.toLowerCase().includes(fileName)) && 
                                highlightService.shouldProcessFile(file) &&
                                !filteredFiles.includes(file)) {
                                filteredFiles.push(file);
                            }
                        }
                    }
                }
            }
            
            // 如果以上条件都没有匹配到文件，尝试直接用过滤文本匹配文件路径
            if (filteredFiles.length === 0) {
                const filterParts = filterText.split(/\s+/);
                for (const file of allFiles) {
                    if (highlightService.shouldProcessFile(file)) {
                        // 检查文件路径是否包含任何过滤部分
                        const filePath = file.path.toLowerCase();
                        if (filterParts.some(part => filePath.includes(part))) {
                            filteredFiles.push(file);
                        }
                    }
                }
            }
        } else {
            // 如果没有文件相关的过滤条件，使用所有文件
            filteredFiles.push(...allFiles.filter((file: any) => highlightService.shouldProcessFile(file)));
        }
        
        // 计数新创建的卡片
        let newCardsCount = 0;
        
        // 遍历所有文件，获取高亮/评论
        for (const file of filteredFiles) {
            const fileHighlights = commentStore.getFileComments(file as any);
            
            // 初始筛选：只处理有评论的高亮或挖空格式的高亮
            let validHighlights = fileHighlights.filter((h: any) => 
                !h.isVirtual && (h.comments?.length > 0 || /\{\{([^{}]+)\}\}/.test(h.text))
            );
            
            // 标签筛选
            if (group.filter.includes('tag:')) {
                const tagFilters = [...group.filter.matchAll(/tag:([^\s]+)/g)].map(m => m[1]);
                if (tagFilters.length > 0) {
                    validHighlights = validHighlights.filter((highlight: any) => {
                        const highlightTags = this.extractTagsFromText(highlight.text);
                        const commentTags = highlight.comments?.flatMap((c: any) => 
                            this.extractTagsFromText(c.content)
                        ) || [];
                        const allTags = [...highlightTags, ...commentTags];
                        
                        // 检查是否包含任一标签
                        return tagFilters.some(tag => allTags.includes(tag));
                    });
                }
            }
            
            // 关键词筛选（如果没有特定的文件或标签筛选器）
            if (!group.filter.includes('tag:') && !hasFileFilter) {
                const keywords = group.filter.toLowerCase().split(/\s+/).filter(k => k.length > 0);
                if (keywords.length > 0) {
                    validHighlights = validHighlights.filter((highlight: any) => {
                        const text = highlight.text.toLowerCase();
                        const comments = highlight.comments?.map((c: any) => c.content.toLowerCase()).join(' ') || '';
                        const content = text + ' ' + comments;
                        
                        // 检查是否包含所有关键词
                        return keywords.every(keyword => content.includes(keyword));
                    });
                }
            }
            
            // 为每个符合条件的高亮/评论创建闪卡（如果尚未创建）
            for (const highlight of validHighlights) {
                let isCloze = false;
                let clozeText = highlight.text;
                let clozeAnswer = '';
                
                // 检查是否为挖空格式：{{内容}}
                const clozeMatch = highlight.text.match(/\{\{([^{}]+)\}\}/);
                if (clozeMatch) {
                    isCloze = true;
                    clozeAnswer = clozeMatch[1];
                    // 正面隐藏内容，动态下划线长度
                    clozeText = highlight.text.replace(/\{\{([^{}]+)\}\}/g, (match: any, p1: any) => '＿'.repeat(p1.length));
                }
                
                // 合并所有评论作为答案
                let answer = highlight.comments?.length ? highlight.comments.map((c: any) => c.content).join('<hr>') : '';
                // 挖空格式优先，若有则拼接答案
                if (isCloze) {
                    answer = answer ? (answer + '<hr>' + clozeAnswer) : clozeAnswer;
                }
                
                // 直接创建新卡片，不检查是否已存在相同内容的卡片
                if (highlight.filePath) {
                    // 创建新卡片
                    const newCard = this.addCard(clozeText, answer, highlight.filePath);
                    if (newCard && newCard.id) {
                        // 将新卡片添加到分组
                        this.addCardToGroup(newCard.id, groupId);
                        newCardsCount++;
                    }
                }
            }
        }
        
        await this.saveStorage();
        // 触发闪卡变化事件
        this.plugin.eventManager.emitFlashcardChanged();
        return newCardsCount;
    }
}

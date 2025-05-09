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
import { FlashcardFactory } from './FlashcardFactory';
import { CardGroupRepository } from './CardGroupRepository';
import { FlashcardDataService } from './FlashcardDataService';
import { debounce } from 'obsidian';

export class FSRSManager {
    public fsrsService: FSRSService;
    private cardFactory: FlashcardFactory;
    private groupRepository: CardGroupRepository;
    private dataService: FlashcardDataService;
    private storage: FSRSStorage;
    private plugin: any; // CommentPlugin type

    constructor(plugin: any) {
        this.plugin = plugin;
        this.fsrsService = new FSRSService();
        this.cardFactory = new FlashcardFactory(plugin, this.fsrsService);
        
        // 初始化为空对象，稍后会被加载的数据替换
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
                currentGroupName: '',
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
            console.log('存储数据加载完成，卡片组数量:', storage.cardGroups.length);
            this.storage = storage;
            
            // 在加载完成后初始化分组仓库和数据服务
            this.groupRepository = new CardGroupRepository(plugin, this.storage);
            this.dataService = new FlashcardDataService(plugin, this.storage);
            
            console.log('分组仓库初始化完成，卡片组数量:', this.groupRepository.getCardGroups().length);
        }).catch(error => {
            console.error('加载存储数据时出错:', error);
            
            // 即使出错也初始化分组仓库和数据服务
            this.groupRepository = new CardGroupRepository(plugin, this.storage);
            this.dataService = new FlashcardDataService(plugin, this.storage);
        });
    }

    private async loadStorage(): Promise<FSRSStorage> {
        console.log('开始加载存储数据...');
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
                currentGroupName: '',
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
            console.log('已加载数据文件:', Object.keys(data || {}));

            if (!data?.fsrs) {
                console.log('数据文件中没有 fsrs 字段，使用默认存储');
                return defaultStorage;
            }

            console.log('fsrs 数据结构:', Object.keys(data.fsrs));

            // 检查 cardGroups 是否存在并且是数组
            if (data.fsrs.cardGroups) {
                console.log('cardGroups 存在，类型:', Array.isArray(data.fsrs.cardGroups) ? '数组' : typeof data.fsrs.cardGroups);
                if (Array.isArray(data.fsrs.cardGroups)) {
                    console.log('cardGroups 数量:', data.fsrs.cardGroups.length);
                    if (data.fsrs.cardGroups.length > 0) {
                        console.log('第一个分组:', data.fsrs.cardGroups[0]);
                    }
                }
            } else {
                console.log('cardGroups 不存在');
            }

            // 确保 cardGroups 正确初始化
            const cardGroups = Array.isArray(data.fsrs.cardGroups) ? data.fsrs.cardGroups : [];

            // 创建新的存储对象，确保 cardGroups 不会被覆盖
            const storage: FSRSStorage = {
                version: data.fsrs.version || defaultStorage.version,
                cards: data.fsrs.cards || {},
                globalStats: data.fsrs.globalStats || defaultStorage.globalStats,
                cardGroups: cardGroups, // 确保使用我们检查过的 cardGroups
                uiState: data.fsrs.uiState || defaultStorage.uiState,
                dailyStats: data.fsrs.dailyStats || []
            };

            console.log('已创建存储对象，cardGroups 数量:', storage.cardGroups.length);
            console.log('卡片数量:', Object.keys(storage.cards).length);

            return storage;
        } catch (error) {
            console.error('加载存储数据时出错:', error);
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
        // 使用 FlashcardFactory 创建卡片
        const card = this.cardFactory.createCard(text, answer, filePath);
        
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
    
    /**
     * 统一的卡片创建或更新方法
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 创建或更新后的卡片
     */
    public createOrUpdateCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 先查找是否存在匹配的卡片
        const existingCard = this.findCardByContent(text, answer, filePath);
        
        if (existingCard) {
            // 如果存在匹配的卡片，更新它
            this.storage.cards[existingCard.id] = {
                ...existingCard,
                text: text,
                answer: answer,
                lastReview: existingCard.lastReview // 保留原来的复习时间
            };
            
            // 保存更改
            this.saveStorage().then(() => {
                this.plugin.eventManager.emitFlashcardChanged();
            }).catch(err => {
                console.error('更新卡片内容时出错:', err);
            });
            
            return this.storage.cards[existingCard.id];
        } else {
            // 如果不存在匹配的卡片，创建新卡片
            return this.addCard(text, answer, filePath);
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
     * 更新每日学习统计
     * @param isNewCard 是否是新卡片
     * @param rating 评分
     * @private 私有方法，只应由 trackStudyProgress 调用
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

    /**
     * 获取到期需要复习的卡片
     * @deprecated 此方法已过时，请使用 getCardsForStudy 方法并指定分组ID
     * @returns 到期卡片列表
     */
    public getDueCards(): FlashcardState[] {
        console.warn('调用过时的 getDueCards 方法，请使用 getCardsForStudy 方法并指定分组ID');
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
     * @deprecated 此方法已过时，请使用 getCardsForStudy 方法并指定分组ID
     * @returns 新卡片列表
     */
    public getNewCards(): FlashcardState[] {
        console.warn('调用过时的 getNewCards 方法，请使用 getCardsForStudy 方法并指定分组ID');
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
     * 获取所有卡片
     * @deprecated 此方法已过时，请使用 getCardsForStudy 方法并指定分组ID
     * @returns 所有卡片列表
     */
    public getLatestCards(): FlashcardState[] {
        console.warn('调用过时的 getLatestCards 方法，请使用 getCardsForStudy 方法并指定分组ID');
        return Object.values(this.storage.cards);
    }
    
    /**
     * 获取所有分组
     * @returns 所有分组列表
     */
    public getCardGroups(): CardGroup[] {
        return this.groupRepository.getCardGroups();
    }
    
    /**
     * 统一的卡片学习入口，获取指定分组的卡片
     * @param groupId 分组ID
     * @returns 分组中的卡片列表
     */
    public getCardsForStudy(groupId: string): FlashcardState[] {
        // 如果没有指定分组ID，返回空数组
        if (!groupId) {
            console.warn('没有指定分组ID，返回空卡片列表');
            return [];
        }
        
        // 获取指定分组的卡片
        return this.getCardsByGroupId(groupId);
    }

    /**
     * reviewCard 方法 - 作为历史兼容性保留
     * @deprecated 请使用 trackStudyProgress 方法代替
     * @param cardId 卡片ID
     * @param rating 评分 (0-3: Again, Hard, Good, Easy)
     * @returns 更新后的卡片状态
     */
    public reviewCard(cardId: string, rating: FSRSRating): FlashcardState | null {
        // 调用统一的学习进度跟踪方法
        console.warn('FSRSManager.reviewCard 已弃用，请使用 trackStudyProgress 方法代替');
        return this.trackStudyProgress(cardId, rating);
    }
    
    /**
     * 统一的学习进度跟踪方法
     * 这是记录学习进度的唯一入口点
     * @param cardId 卡片ID
     * @param rating 评分
     * @returns 更新后的卡片状态
     */
    public trackStudyProgress(cardId: string, rating: FSRSRating): FlashcardState | null {
        // 获取卡片
        const card = this.storage.cards[cardId];
        if (!card) {
            console.error(`跟踪学习进度失败: 卡片 ${cardId} 不存在`);
            return null;
        }
        
        // 调用 FSRS 算法进行评分
        const isNewCard = card.lastReview === 0;
        const updatedCard = this.fsrsService.reviewCard(card, rating);
        
        // 更新卡片状态
        this.storage.cards[cardId] = updatedCard;
        
        // 更新全局统计数据
        this.updateGlobalStats(rating, updatedCard.retrievability);
        
        // 更新每日统计数据
        this.updateDailyStats(isNewCard, rating);
        
        // 同步更新所有相关分组的进度
        if (card.groupIds && card.groupIds.length > 0) {
            card.groupIds.forEach(groupId => {
                // 更新分组的学习进度
                const group = this.groupRepository.getGroupById(groupId);
                if (group) {
                    // 如果需要，可以在这里添加分组特定的进度跟踪逻辑
                }
            });
        }
        
        // 保存更改 - 立即保存而不是延迟保存，确保状态被正确保存
        this.saveStorage();
        
        // 调试信息：输出更新后的卡片状态
        console.log('Updated Card State:', this.storage.cards[cardId]);
        
        // 触发卡片变化事件
        this.plugin.eventManager.emitFlashcardChanged();
        
        // 返回更新后的卡片
        return this.storage.cards[cardId];
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

    /**
     * 为分组生成卡片
     * @param groupId 分组ID
     * @returns 生成的卡片数量
     */
    public async generateCardsForGroup(groupId: string): Promise<number> {
        console.log(`开始为分组生成卡片: ${groupId}`);
        
        const group = this.groupRepository.getGroupById(groupId);
        if (!group) {
            console.log(`未找到分组: ${groupId}`);
            return 0;
        }
        
        console.log(`分组信息: 名称=${group.name}, 过滤条件=${group.filter}`);
        
        // 确保分组有 cardIds 数组
        if (!Array.isArray(group.cardIds)) {
            console.log(`初始化分组 ${group.name} 的 cardIds 数组`);
            group.cardIds = [];
        }
        
        // 获取当前存储中的卡片数量
        const existingCardCount = Object.keys(this.storage.cards || {}).length;
        console.log(`当前存储中有 ${existingCardCount} 张卡片`);
        
        // 获取所有符合条件的卡片
        console.log('调用 FlashcardFactory.generateCardsForGroup 生成卡片...');
        const newCards = await this.cardFactory.generateCardsForGroup(group, (card: FlashcardState, groupId: string) => {
            console.log(`添加新卡片到存储: ${card.id}`);
            this.storage.cards[card.id] = card;
            
            // 添加卡片到分组
            const addResult = this.addCardToGroup(card.id, groupId);
            console.log(`将卡片 ${card.id} 添加到分组 ${groupId} 结果: ${addResult ? '成功' : '失败'}`);
            
            // 手动检查并添加卡片到分组
            const updatedGroup = this.groupRepository.getGroupById(groupId);
            if (updatedGroup) {
                // 确保 cardIds 数组存在
                if (!Array.isArray(updatedGroup.cardIds)) {
                    updatedGroup.cardIds = [];
                }
                
                if (!updatedGroup.cardIds.includes(card.id)) {
                    console.log(`手动添加卡片 ${card.id} 到分组 ${groupId}`);
                    updatedGroup.cardIds.push(card.id);
                }
            }
        });
        
        console.log(`生成了 ${newCards} 张新卡片`);
        
        // 再次检查分组中的卡片数量
        const updatedGroup = this.groupRepository.getGroupById(groupId);
        if (updatedGroup) {
            // 确保 cardIds 数组存在
            if (!Array.isArray(updatedGroup.cardIds)) {
                updatedGroup.cardIds = [];
            }
            
            console.log(`分组 ${updatedGroup.name} 中现有 ${updatedGroup.cardIds.length} 张卡片`);
            if (updatedGroup.cardIds.length > 0) {
                console.log(`卡片ID列表: ${updatedGroup.cardIds.join(', ')}`);
            } else {
                console.log('分组中没有卡片');
            }
        }
        
        // 保存更改
        console.log('保存存储...');
        await this.saveStorage();
        console.log('触发闪卡变更事件...');
        this.plugin.eventManager.emitFlashcardChanged();
        
        return newCards;
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
        
        // 如果只有一个分组，直接返回该分组的卡片数量
        if (allGroups.length === 1 && allGroups[0].cardIds) {
            return allGroups[0].cardIds.length;
        }
        
        // 收集所有自定义分组中的卡片ID
        const customGroupCards = new Set<string>();
        
        // 遍历所有自定义分组，收集卡片ID
        allGroups.forEach(group => {
            if (group.cardIds) {
                group.cardIds.forEach(cardId => {
                    if (this.storage.cards[cardId]) {
                        customGroupCards.add(cardId);
                    }
                });
            }
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
     * 从标签文本中提取标签 (委托给 FlashcardFactory)
     * @param text 包含标签的文本
     * @returns 提取的标签数组
     */
    /**
     * 从标签文本中提取标签（委托给 CardGroupRepository）
     * @param text 包含标签的文本
     * @returns 提取的标签数组
     */
    private extractTagsFromText(text: string): string[] {
        return this.groupRepository.extractTagsFromText(text);
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
     * 创建新分组
     * @param group 分组数据（不含ID）
     * @returns 创建的分组
     */
    public async createCardGroup(group: Omit<CardGroup, 'id'>): Promise<CardGroup> {
        console.log(`FSRSManager.createCardGroup: 开始创建分组 ${group.name}`);
        console.log(`存储对象结构: ${Object.keys(this.storage).join(', ')}`);
        
        // 确保 cardGroups 数组已初始化
        if (!Array.isArray(this.storage.cardGroups)) {
            console.log('FSRSManager: 初始化 cardGroups 数组');
            this.storage.cardGroups = [];
        }
        
        // 创建新分组
        const newGroup = await this.groupRepository.createCardGroup(group);
        console.log(`分组创建完成: ${newGroup.id}, ${newGroup.name}`);
        console.log(`当前分组数量: ${this.storage.cardGroups.length}`);
        
        // 生成卡片
        const newCardsCount = await this.generateCardsForGroup(newGroup.id);
        console.log(`为分组 ${newGroup.name} 生成了 ${newCardsCount} 张卡片`);
        
        // 确保分组已添加到存储中
        if (!this.storage.cardGroups.some(g => g.id === newGroup.id)) {
            console.log(`分组 ${newGroup.id} 不在存储中，手动添加`);
            this.storage.cardGroups.push(newGroup);
        }
        
        // 保存更改
        await this.saveStorage();
        console.log(`存储已保存，当前分组数量: ${this.storage.cardGroups.length}`);
        
        return newGroup;
    }
    
    /**
     * 更新分组
     * @param groupId 分组ID
     * @param updates 要更新的字段
     * @returns 是否更新成功
     */
    public async updateCardGroup(groupId: string, updates: Partial<Omit<CardGroup, 'id'>>): Promise<boolean> {
        // 获取更新前的过滤条件
        const oldGroup = this.groupRepository.getGroupById(groupId);
        const oldFilter = oldGroup?.filter;
        
        // 更新分组
        const result = await this.groupRepository.updateCardGroup(groupId, updates);
        if (!result) return false;
        
        // 如果更新了过滤条件，重新生成卡片
        if (updates.filter !== undefined && updates.filter !== oldFilter) {
            // 清空现有卡片
            const group = this.groupRepository.getGroupById(groupId);
            if (group && group.cardIds) {
                for (const cardId of [...group.cardIds]) {
                    this.removeCardFromGroup(cardId, groupId);
                }
            }
            
            // 重新生成卡片
            const newCardsCount = await this.generateCardsForGroup(groupId);
        }
        
        // 保存更改
        await this.saveStorage();
        
        return true;
    }
    
    /**
     * 删除分组
     * @param groupId 分组ID
     * @param deleteCards 是否同时删除分组内的卡片
     * @returns 是否删除成功
     */
    public async deleteCardGroup(groupId: string, deleteCards = true): Promise<boolean> {
        // 如果要删除卡片，先获取分组内的所有卡片ID
        let cardsToDelete: string[] = [];
        if (deleteCards) {
            const group = this.groupRepository.getGroupById(groupId);
            cardsToDelete = group?.cardIds || [];
        }
        
        // 删除分组
        const result = await this.groupRepository.deleteCardGroup(groupId, false); // 先不删除卡片
        if (!result) return false;
        
        // 如果需要删除卡片，单独处理
        if (deleteCards && cardsToDelete.length > 0) {
            for (const cardId of cardsToDelete) {
                this.deleteCard(cardId);
            }
        }
        
        // 保存更改
        try {
            await this.saveStorage();
            return true;
        } catch (error) {
            // 删除失败，但无法恢复（分组已被删除）
            return false;
        }
    }
    
    /**
     * 获取分组中的所有卡片（根据过滤条件）
     * @param group 分组对象
     * @returns 符合条件的卡片列表
     */
    /**
     * 获取分组中的所有卡片（根据过滤条件）
     * @param group 分组对象
     * @returns 符合条件的卡片列表
     */
    public getCardsInGroup(group: CardGroup): FlashcardState[] {
        // 如果分组有cardIds，直接返回这些卡片
        if (group.cardIds && group.cardIds.length > 0) {
            return this.getCardsByGroupId(group.id);
        }
        
        // 否则，根据过滤条件筛选卡片
        const latestCards = this.getLatestCards();

        return latestCards.filter((card: FlashcardState) => {
            const filters = group.filter.split(',').map(f => f.trim().toLowerCase());
            const cardText = card.text.toLowerCase();
            const cardAnswer = card.answer.toLowerCase();
            const filePath = (card.filePath || '').toLowerCase();
            
            const matches = filters.some((filter: string) => {
                // 检查标签
                if (filter.startsWith('#')) {
                    const tagToFind = filter.substring(1);
                    // 从卡片文本中提取标签
                    const tagsInText = this.groupRepository.extractTagsFromText(cardText);
                    // 从卡片答案中提取标签
                    const tagsInAnswer = this.groupRepository.extractTagsFromText(cardAnswer);
                    // 合并所有标签
                    const allTags = [...tagsInText, ...tagsInAnswer];
                    
                    // 检查卡片文本中是否直接包含完整的标签字符串（包括#符号）
                    const directTagMatch = cardText.includes(filter) || cardAnswer.includes(filter);
                    
                    // 检查提取的标签是否匹配
                    const extractedTagMatch = allTags.some((tag: string) => 
                        tag.toLowerCase() === tagToFind || 
                        tag.toLowerCase().includes(tagToFind)
                    );
                    
                    return directTagMatch || extractedTagMatch;
                }
                
                // 检查文件路径
                if (filter.startsWith('path:')) {
                    const pathToFind = filter.substring(5);
                    return filePath.includes(pathToFind);
                }
                
                // 检查文本内容
                return cardText.includes(filter) || cardAnswer.includes(filter);
            });
            
            return matches;
        });
    }
    
    /**
     * 将卡片添加到分组
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否添加成功
     */
    public addCardToGroup(cardId: string, groupId: string): boolean {
        const result = this.groupRepository.addCardToGroup(cardId, groupId);
        if (result) {
            // 保存更改
            this.saveStorageDebounced();
        }
        return result;
    }
    
    /**
     * 从分组中移除卡片
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否移除成功
     */
    public removeCardFromGroup(cardId: string, groupId: string): boolean {
        const result = this.groupRepository.removeCardFromGroup(cardId, groupId);
        if (result) {
            // 保存更改
            this.saveStorageDebounced();
        }
        return result;
    }
    
    /**
     * 获取分组的学习进度
     * @param groupId 分组ID
     * @returns 分组的学习进度
     */
    public getGroupProgress(groupId: string): FlashcardProgress | null {
        console.log(`FSRSManager.getGroupProgress 被调用，分组ID: ${groupId}`);
        // 将调用转发到 CardGroupRepository
        return this.groupRepository.getGroupProgress(groupId);
    }
    
    /**
     * 获取分组中的所有卡片
     * @param groupId 分组ID
     * @returns 分组中的卡片列表
     */
    public getCardsByGroupId(groupId: string): FlashcardState[] {
        return this.groupRepository.getCardsByGroupId(groupId);
    }
    
    /**
     * 导出数据
     * @returns 导出的存储数据
     */
    public exportData(): FSRSStorage {
        return this.dataService.exportData();
    }

    /**
     * 导入数据
     * @param data 要导入的数据
     * @returns 是否导入成功
     */
    public importData(data: FSRSStorage): boolean {
        const result = this.dataService.importData(data);
        if (result) {
            this.saveStorage();
        }
        return result;
    }
    
    /**
     * 导出卡片为 Anki 格式
     * @param cardIds 要导出的卡片 ID 数组，如果为空则导出所有卡片
     * @returns Anki 格式的导出数据（CSV 字符串）
     */
    public exportToAnki(cardIds?: string[]): string {
        return this.dataService.exportToAnki(cardIds);
    }
    
    /**
     * 从 Anki 格式导入卡片
     * @param ankiData Anki 格式的导入数据（CSV 字符串）
     * @param groupId 要将卡片添加到的分组 ID，如果为空则不添加到任何分组
     * @returns 导入的卡片数量
     */
    public importFromAnki(ankiData: string, groupId?: string): number {
        const importedCount = this.dataService.importFromAnki(ankiData, groupId);
        if (importedCount > 0) {
            this.saveStorage();
        }
        return importedCount;
    }
}

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
// import { FlashcardDataService } from './FlashcardDataService';
import { debounce } from 'obsidian';

export class FSRSManager {
    public fsrsService: FSRSService;
    private cardFactory: FlashcardFactory;
    private groupRepository: CardGroupRepository;
    // private dataService: FlashcardDataService;
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
            
            // 在加载完成后初始化分组仓库
            this.groupRepository = new CardGroupRepository(plugin, this.storage);
            // this.dataService = new FlashcardDataService(plugin, this.storage);
            
            console.log('分组仓库初始化完成，卡片组数量:', this.groupRepository.getCardGroups().length);
            
            // 注册事件监听
            this.registerEventListeners();
        }).catch(error => {
            console.error('加载存储数据时出错:', error);
            
            // 即使出错也初始化分组仓库
            this.groupRepository = new CardGroupRepository(plugin, this.storage);
            // this.dataService = new FlashcardDataService(plugin, this.storage);
            
            // 注册事件监听
            this.registerEventListeners();
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

    /**
     * 添加卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面文本
     * @param filePath 关联的文件路径
     * @param sourceId 来源ID（高亮或批注的ID）
     * @param sourceType 来源类型
     * @returns 添加的卡片
     */
    public addCard(text: string, answer: string, filePath?: string, sourceId?: string, sourceType?: 'highlight' | 'comment'): FlashcardState {
        // 创建卡片
        const card = this.cardFactory.createCard(text, answer, filePath);
        
        // 设置来源信息
        if (sourceId && sourceType) {
            card.sourceId = sourceId;
            card.sourceType = sourceType;
        }
        
        this.storage.cards[card.id] = card;
        
        // 检查并添加卡片到符合条件的分组
        this.checkAndAddCardToGroups(card);
        
        this.saveStorageDebounced();
        return card;
    }
    
    /**
     * 更新卡片内容（用于高亮文本或批注更新时）
     * @param text 更新的文本内容
     * @param answer 更新的答案内容
     * @param filePath 文件路径
     */
    public updateCardContent(text: string, answer: string, filePath?: string): void {
        // 调用 FlashcardFactory 的方法
        this.cardFactory.updateCardContent(text, answer, filePath);
    }
    
    /**
     * 统一的卡片创建或更新方法
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 创建或更新后的卡片
     */
    public createOrUpdateCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 调用 FlashcardFactory 的方法
        return this.cardFactory.createOrUpdateCard(text, answer, filePath);
    }

    /**
     * 删除指定文件路径下的卡片
     * @param filePath 文件路径
     * @param text 可选，特定的高亮文本
     * @param answer 可选，特定的评论内容
     * @returns 是否有卡片被删除
     */
    public deleteCardsByContent(filePath: string, text?: string, answer?: string): boolean {
        // 调用 FlashcardFactory 的方法
        const deletedCount = this.cardFactory.deleteCardsByContent(filePath, text, answer);
        return deletedCount > 0;
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
        
        // 保存更新后的统计数据
        this.saveStorageDebounced();
    }
    
    /**
     * 重置指定分组的完成消息状态
     * @param groupId 分组ID
     */
    private resetGroupCompletionMessage(groupId: string): void {
        if (!groupId) return;
        
        // 获取分组名称
        const group = this.groupRepository.getGroupById(groupId);
        if (!group) return;
        
        // 确保 uiState 和 groupCompletionMessages 存在
        if (!this.storage.uiState) {
            this.storage.uiState = {
                currentGroupName: '',
                currentIndex: 0,
                isFlipped: false,
                completionMessage: null,
                groupCompletionMessages: {},
                groupProgress: {}
            };
        }
        
        if (!this.storage.uiState.groupCompletionMessages) {
            this.storage.uiState.groupCompletionMessages = {};
        }
        
        // 重置完成消息
        if (this.storage.uiState.groupCompletionMessages[group.name]) {
            console.log(`重置分组 ${group.name} 的完成消息`);
            this.storage.uiState.groupCompletionMessages[group.name] = null;
            this.saveStorageDebounced();
        }
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
        
        // 重置分组完成消息状态
        this.resetGroupCompletionMessage(groupId);
        
        // 获取指定分组的所有卡片
        const allCards = this.groupRepository.getCardsByGroupId(groupId);
        console.log(`分组 ${groupId} 中共有 ${allCards.length} 张卡片`);
        
        if (allCards.length === 0) {
            return [];
        }
        
        // 当前时间
        const now = Date.now();
        
        // 筛选出今天需要学习或复习的卡片
        const cardsForStudy = allCards.filter(card => {
            // 新卡片（从未学习过）
            if (card.reviews === 0 && card.lastReview === 0) {
                console.log(`卡片 ${card.id} 是新卡片，需要学习`);
                return true;
            }
            
            // 到期需要复习的卡片
            if (card.nextReview <= now) {
                console.log(`卡片 ${card.id} 到期需要复习，下次复习时间: ${new Date(card.nextReview).toLocaleString()}`);
                return true;
            }
            
            // 学习中的卡片（已学习但稳定性很低）
            if (card.stability < 1 && card.lastReview > 0) {
                console.log(`卡片 ${card.id} 正在学习中，稳定性: ${card.stability}`);
                return true;
            }
            
            return false;
        });
        
        console.log(`分组 ${groupId} 中有 ${cardsForStudy.length} 张卡片需要学习或复习`);
        
        // 如果没有需要学习的卡片，返回所有新卡片
        if (cardsForStudy.length === 0) {
            const newCards = allCards.filter(card => card.reviews === 0);
            console.log(`没有需要学习的卡片，返回 ${newCards.length} 张新卡片`);
            return newCards;
        }
        
        return cardsForStudy;
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
    
    /**
     * 获取卡片在不同评分下的预测结果
     * @param cardId 卡片ID
     * @returns 不同评分下的预测结果，如果卡片不存在则返回 null
     */
    public getCardPredictions(cardId: string): Record<FSRSRating, FlashcardState> | null {
        const card = this.storage.cards[cardId];
        if (!card) return null;
        
        // 使用 FSRSService 的 getSchedulingCards 方法获取预测结果
        return this.fsrsService.getSchedulingCards(card);
    }
    
    /**
     * 批量生成卡片功能已移除
     * 现在只通过 HighlightCard.handleCreateHiCard 创建闪卡
     * @param groupId 分组ID
     * @returns 始终返回0，表示没有生成卡片
     */
    public async generateCardsForGroup(groupId: string): Promise<number> {
        console.log(`FSRSManager.generateCardsForGroup: 批量生成卡片功能已移除，现在只通过 HighlightCard.handleCreateHiCard 创建闪卡`);
        return 0;
    }

    /**
     * 检查卡片是否符合已有分组的筛选条件，并将其添加到相应的分组中
     * @param card 要检查的卡片
     * @returns 添加到的分组数量
     */
    private checkAndAddCardToGroups(card: FlashcardState): number {
        if (!card || !card.id) return 0;
        
        console.log(`检查卡片 ${card.id} 是否符合已有分组的筛选条件`);
        
        // 获取所有分组
        const allGroups = this.groupRepository.getCardGroups();
        if (!allGroups || allGroups.length === 0) {
            console.log('没有可用的分组');
            return 0;
        }
        
        console.log(`共有 ${allGroups.length} 个分组需要检查`);
        
        // 记录添加到的分组数量
        let addedCount = 0;
        
        // 逐个检查分组
        for (const group of allGroups) {
            if (!group.filter || group.filter.trim().length === 0) {
                console.log(`分组 ${group.name} 没有筛选条件，跳过`);
                continue;
            }
            
            console.log(`检查分组 ${group.name}, 筛选条件: ${group.filter}`);
            
            // 创建一个仅包含当前卡片的数组
            const singleCardArray = [card];
            
            // 使用 CardGroupRepository 的筛选逻辑检查卡片是否符合条件
            const isMatch = this.checkCardMatchesGroupFilter(card, group.filter);
            
            if (isMatch) {
                console.log(`卡片 ${card.id} 符合分组 ${group.name} 的筛选条件`);
                
                // 添加卡片到分组
                const added = this.addCardToGroup(card.id, group.id);
                if (added) {
                    console.log(`卡片 ${card.id} 成功添加到分组 ${group.name}`);
                    addedCount++;
                } else {
                    console.log(`卡片 ${card.id} 添加到分组 ${group.name} 失败`);
                }
            } else {
                console.log(`卡片 ${card.id} 不符合分组 ${group.name} 的筛选条件`);
            }
        }
        
        if (addedCount > 0) {
            console.log(`卡片 ${card.id} 已添加到 ${addedCount} 个分组`);
        } else {
            console.log(`卡片 ${card.id} 未添加到任何分组`);
        }
        
        return addedCount;
    }
    
    /**
     * 检查卡片是否符合分组的筛选条件
     * @param card 要检查的卡片
     * @param filter 分组的筛选条件
     * @returns 是否符合条件
     */
    private checkCardMatchesGroupFilter(card: FlashcardState, filter: string): boolean {
        if (!card || !card.filePath || !filter || filter.trim().length === 0) {
            return false;
        }
        
        // 按逗号分割多个筛选条件
        const filterConditions = filter.split(',').map(f => f.trim()).filter(f => f.length > 0);
        if (filterConditions.length === 0) {
            return false;
        }
        
        // Wiki 链接正则表达式
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/;
        
        // 处理卡片文件路径
        const filePath = card.filePath.toLowerCase();
        const fileName = filePath.split('/').pop() || ''; // 获取文件名
        const fileNameWithoutExt = fileName.replace(/\.md$/i, ''); // 移除 .md 扩展名
        
        // 检查每个筛选条件
        for (const condition of filterConditions) {
            const conditionLower = condition.toLowerCase();
            
            // 检查是否是 Wiki 链接格式
            const wikiMatch = conditionLower.match(wikiLinkRegex);
            
            if (wikiMatch) {
                // 如果是 Wiki 链接格式，提取链接内容并匹配文件名
                const linkText = wikiMatch[1].toLowerCase();
                
                // 检查文件名是否匹配
                if (fileNameWithoutExt === linkText || fileName === linkText) {
                    console.log(`Wiki 链接匹配成功: ${linkText} 匹配文件 ${fileName}`);
                    return true;
                }
            } else {
                // 如果不是 Wiki 链接格式，直接匹配文件路径
                if (filePath.includes(conditionLower)) {
                    console.log(`路径匹配成功: ${conditionLower} 匹配路径 ${filePath}`);
                    return true;
                }
                
                // 检查卡片内容
                if (card.text && card.text.toLowerCase().includes(conditionLower)) {
                    console.log(`内容匹配成功: ${conditionLower} 匹配卡片内容`);
                    return true;
                }
                
                // 检查卡片答案
                if (card.answer && card.answer.toLowerCase().includes(conditionLower)) {
                    console.log(`答案匹配成功: ${conditionLower} 匹配卡片答案`);
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * 根据内容查找卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 可选的文件路径
     * @returns 找到的卡片或 null
     */
    public findCardByContent(text: string, answer: string, filePath?: string): FlashcardState | null {
        // 调用 FlashcardFactory 的方法
        return this.cardFactory.findCardByContent(text, answer, filePath);
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
        // 获取所有学习分组中的卡片
        const allGroupCards = this.getAllGroupCards();
        const now = Date.now();
        
        // 如果没有学习分组或分组中没有卡片，则返回全部为0的统计
        if (allGroupCards.length === 0) {
            return {
                due: 0,
                newCards: 0,
                learned: 0,
                retention: this.storage.globalStats.averageRetention
            };
        }
        
        return {
            due: allGroupCards.filter(c => c.nextReview <= now).length,
            newCards: allGroupCards.filter(c => c.lastReview === 0).length,
            learned: allGroupCards.filter(c => c.lastReview > 0).length,
            retention: this.storage.globalStats.averageRetention
        };
    }

    /**
     * 获取所有学习分组中的卡片（去重）
     * @returns 所有学习分组中的卡片数组
     */
    private getAllGroupCards(): FlashcardState[] {
        // 获取所有分组
        const groups = this.groupRepository.getCardGroups();
        if (!groups || groups.length === 0) {
            console.log('没有找到任何学习分组');
            return [];
        }
        
        // 用于去重的卡片ID集合
        const uniqueCardIds = new Set<string>();
        const uniqueCards: FlashcardState[] = [];
        
        // 遍历所有分组，收集卡片
        for (const group of groups) {
            const groupCards = this.groupRepository.getCardsByGroupId(group.id);
            for (const card of groupCards) {
                if (!uniqueCardIds.has(card.id)) {
                    uniqueCardIds.add(card.id);
                    uniqueCards.push(card);
                }
            }
        }
        
        console.log(`所有学习分组中共有 ${uniqueCards.length} 张不重复卡片`);
        return uniqueCards;
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

    /**
     * 根据文件路径获取卡片
     * @param filePath 文件路径
     * @returns 该文件下的卡片列表
     */
    public getCardsByFile(filePath: string): FlashcardState[] {
        // 调用 FlashcardFactory 的方法
        return this.cardFactory.getCardsByFile(filePath);
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
    public async deleteCardGroup(groupId: string, deleteCards = false): Promise<boolean> {
        // 删除分组，不删除卡片
        const result = await this.groupRepository.deleteCardGroup(groupId, false);
        if (!result) return false;
        
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
        // 使用 Object.values 直接获取所有卡片，避免使用过时的 getLatestCards 方法
        const latestCards = Object.values(this.storage.cards);

        return latestCards.filter((card: FlashcardState) => {
            const filters = group.filter.split(',').map(f => f.trim().toLowerCase());
            const cardText = card.text.toLowerCase();
            const cardAnswer = card.answer.toLowerCase();
            const filePath = (card.filePath || '').toLowerCase();
            
            const matches = filters.some((filter: string) => {
                // 不再支持标签筛选，如果输入了标签，将其视为普通文本匹配
                if (filter.startsWith('#')) {
                    return cardText.includes(filter) || cardAnswer.includes(filter);
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
     * 获取所有卡片的数组
     * @returns 所有卡片的数组
     */
    public getAllCards(): FlashcardState[] {
        return Object.values(this.storage.cards);
    }
    
    /**
     * 获取所有分组
     * @returns 所有分组列表
     */
    public getCardGroups(): CardGroup[] {
        return this.groupRepository.getCardGroups();
    }
    
    // 导入导出功能暂未实现
    /*
    public exportData(): FSRSStorage {
        throw new Error('导出功能暂未实现');
    }

    public importData(data: FSRSStorage): boolean {
        throw new Error('导入功能暂未实现');
    }
    
    public exportToAnki(cardIds?: string[]): string {
        throw new Error('导出到 Anki 功能暂未实现');
    }
    
    public importFromAnki(ankiData: string, groupId?: string): number {
        throw new Error('从 Anki 导入功能暂未实现');
    }
    */
    
    /**
     * 注册事件监听器
     * @private
     */
    private registerEventListeners(): void {
        if (!this.plugin.eventManager) {
            console.error('事件管理器不存在，无法注册事件监听器');
            return;
        }
        
        // 监听高亮更新事件
        this.plugin.eventManager.on('highlight:update', 
            (filePath: string, oldText: string, newText: string) => {
                this.handleHighlightUpdate(filePath, oldText, newText);
            }
        );
        
        // 监听高亮删除事件
        this.plugin.eventManager.on('highlight:delete',
            (filePath: string, text: string) => {
                this.handleHighlightDelete(filePath, text);
            }
        );
        
        // 监听批注更新事件
        this.plugin.eventManager.on('comment:update',
            (filePath: string, oldComment: string, newComment: string) => {
                this.handleCommentUpdate(filePath, oldComment, newComment);
            }
        );
        
        // 监听批注删除事件
        this.plugin.eventManager.on('comment:delete',
            (filePath: string, comment: string) => {
                this.handleCommentDelete(filePath, comment);
            }
        );
        
        console.log('已注册高亮和批注事件监听器');
    }
    
    /**
     * 处理高亮更新事件
     * @param filePath 文件路径
     * @param oldText 旧文本
     * @param newText 新文本
     * @private
     */
    private handleHighlightUpdate(filePath: string, oldText: string, newText: string): void {
        console.log(`处理高亮更新事件: ${filePath}, ${oldText} -> ${newText}`);
        
        // 查找与该高亮关联的所有卡片
        const relatedCards = Object.values(this.storage.cards).filter(card => 
            card.sourceType === 'highlight' && 
            card.text === oldText && 
            (card.filePath === filePath || !card.filePath)
        );
        
        if (relatedCards.length === 0) {
            console.log('未找到与该高亮关联的卡片');
            return;
        }
        
        console.log(`找到 ${relatedCards.length} 张与该高亮关联的卡片，正在更新...`);
        
        // 更新卡片内容
        for (const card of relatedCards) {
            card.text = newText;
            card.updatedAt = Date.now();
        }
        
        // 保存变更
        this.saveStorageDebounced();
        console.log('卡片内容已更新并保存');
    }
    
    /**
     * 处理高亮删除事件
     * @param filePath 文件路径
     * @param text 高亮文本
     * @private
     */
    private handleHighlightDelete(filePath: string, text: string): void {
        console.log(`处理高亮删除事件: ${filePath}, ${text}`);
        
        // 查找与该高亮关联的所有卡片
        const relatedCards = Object.values(this.storage.cards).filter(card => 
            card.sourceType === 'highlight' && 
            card.text === text && 
            (card.filePath === filePath || !card.filePath)
        );
        
        if (relatedCards.length === 0) {
            console.log('未找到与该高亮关联的卡片');
            return;
        }
        
        console.log(`找到 ${relatedCards.length} 张与该高亮关联的卡片，正在删除...`);
        
        // 删除关联的卡片
        for (const card of relatedCards) {
            // 从存储中删除卡片
            delete this.storage.cards[card.id];
            
            // 从所有分组中移除卡片引用
            if (card.groupIds) {
                for (const groupId of card.groupIds) {
                    this.removeCardFromGroup(card.id, groupId);
                }
            }
        }
        
        // 保存变更
        this.saveStorageDebounced();
        console.log('关联的卡片已删除并保存');
    }
    
    /**
     * 处理批注更新事件
     * @param filePath 文件路径
     * @param oldComment 旧批注
     * @param newComment 新批注
     * @private
     */
    private handleCommentUpdate(filePath: string, oldComment: string, newComment: string): void {
        console.log(`处理批注更新事件: ${filePath}, ${oldComment} -> ${newComment}`);
        
        // 查找与该批注关联的所有卡片
        const relatedCards = Object.values(this.storage.cards).filter(card => 
            card.sourceType === 'comment' && 
            card.answer === oldComment && 
            (card.filePath === filePath || !card.filePath)
        );
        
        if (relatedCards.length === 0) {
            console.log('未找到与该批注关联的卡片');
            return;
        }
        
        console.log(`找到 ${relatedCards.length} 张与该批注关联的卡片，正在更新...`);
        
        // 更新卡片内容
        for (const card of relatedCards) {
            card.answer = newComment;
            card.updatedAt = Date.now();
        }
        
        // 保存变更
        this.saveStorageDebounced();
        console.log('卡片内容已更新并保存');
    }
    
    /**
     * 处理批注删除事件
     * @param filePath 文件路径
     * @param comment 批注内容
     * @private
     */
    private handleCommentDelete(filePath: string, comment: string): void {
        console.log(`处理批注删除事件: ${filePath}, ${comment}`);
        
        // 查找与该批注关联的所有卡片
        const relatedCards = Object.values(this.storage.cards).filter(card => 
            card.sourceType === 'comment' && 
            card.answer === comment && 
            (card.filePath === filePath || !card.filePath)
        );
        
        if (relatedCards.length === 0) {
            console.log('未找到与该批注关联的卡片');
            return;
        }
        
        console.log(`找到 ${relatedCards.length} 张与该批注关联的卡片，正在删除...`);
        
        // 删除关联的卡片
        for (const card of relatedCards) {
            // 从存储中删除卡片
            delete this.storage.cards[card.id];
            
            // 从所有分组中移除卡片引用
            if (card.groupIds) {
                for (const groupId of card.groupIds) {
                    this.removeCardFromGroup(card.id, groupId);
                }
            }
        }
        
        // 保存变更
        this.saveStorageDebounced();
        console.log('关联的卡片已删除并保存');
    }
}

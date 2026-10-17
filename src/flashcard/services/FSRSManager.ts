import { buildLinkedCardAnswer } from './LinkedCardContent';
import { t } from '../../i18n';
import { 
    FlashcardState, 
    FlashcardProgress, 
    FSRSStorage, 
    FSRSGlobalStats,
    FSRSRating,
    CardGroup,
    HiCardState,
    DailyStats
} from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { CardGroupRepository } from './CardGroupRepository';
import { DailyStatsService } from './DailyStatsService';
import { FlashcardEventSyncService } from './FlashcardEventSyncService';
import { SourceCardService, FlashcardSourceType } from './SourceCardService';
import { FlashcardStorageService } from './FlashcardStorageService';
import { FlashcardStudyService } from './FlashcardStudyService';
import { FlashcardReviewService } from './FlashcardReviewService';
import { FlashcardCardService } from './FlashcardCardService';
import { FlashcardUIStateService } from './FlashcardUIStateService';
import { PAUSED_CARDS_GROUP } from '../types/FlashcardGroups';
import { FlashcardGroupService } from './FlashcardGroupService';
import { Notice } from 'obsidian';
import { StorageQueue } from '../../storage/StorageQueue';
import { HiNoteDataManager } from '../../storage/HiNoteDataManager';
import type CommentPlugin from '../../../main';

export class FSRSManager {
    public fsrsService: FSRSService;
    private groupRepository: CardGroupRepository;
    private dailyStatsService: DailyStatsService;
    private eventSyncService: FlashcardEventSyncService;
    private sourceCardService: SourceCardService;
    private storageService: FlashcardStorageService;
    private studyService: FlashcardStudyService;
    private reviewService: FlashcardReviewService;
    private cardService: FlashcardCardService;
    private uiStateService: FlashcardUIStateService;
    private groupService: FlashcardGroupService;
    private storage: FSRSStorage;
    private plugin: CommentPlugin;
    private reviewDraft: FSRSStorage | null = null;

    constructor(plugin: CommentPlugin, dataManager?: HiNoteDataManager) {
        this.plugin = plugin;
        this.storageService = new FlashcardStorageService(plugin, dataManager);
        this.fsrsService = new FSRSService();
        this.dailyStatsService = new DailyStatsService({
            getDailyStats: () => this.storage.dailyStats,
            setDailyStats: (dailyStats: DailyStats[]) => {
                this.storage.dailyStats = dailyStats;
            },
            getGlobalStats: () => this.storage.globalStats,
            getCardGroups: () => this.storage.cardGroups,
            getParameters: () => this.fsrsService.getParameters(),
            saveDebounced: () => this.saveStorageDebounced()
        });
        this.sourceCardService = new SourceCardService({
            getStorage: () => this.requireStorage(),
            removeCardFromGroup: (cardId: string, groupId: string) => this.removeCardFromGroup(cardId, groupId),
            saveDebounced: () => this.saveStorageDebounced()
        });
        this.studyService = new FlashcardStudyService({
            getStorage: () => this.requireStorage(),
            getGroupRepository: () => this.groupRepository,
            getRemainingNewCardsToday: (groupId?: string) => this.getRemainingNewCardsToday(groupId),
            getRemainingReviewsToday: (groupId?: string) => this.getRemainingReviewsToday(groupId)
        });
        this.reviewService = new FlashcardReviewService({
            getStorage: () => this.reviewDraft || this.requireStorage(),
            getFsrsService: () => this.fsrsService,
            getDailyStatsService: () => this.createReviewDailyStats(),
            saveStorage: async () => {
                if (!this.reviewDraft) throw new Error('Review transaction is not active');
                await this.storageService.save(JSON.parse(JSON.stringify(this.reviewDraft)));
            },
            emitFlashcardChanged: () => {}
        });
        this.cardService = new FlashcardCardService({
            getStorage: () => this.requireStorage(),
            createCard: (text, answer, filePath) => this.fsrsService.initializeCard(text, answer, filePath),
            getGroupRepository: () => this.groupRepository,
            addCardToGroup: (cardId: string, groupId: string) => this.addCardToGroup(cardId, groupId),
            saveDebounced: () => this.saveStorageDebounced()
        });
        this.uiStateService = new FlashcardUIStateService({
            getStorage: () => this.requireStorage(),
            saveStorage: async () => await this.saveStorage(),
            saveDebounced: () => this.saveStorageDebounced()
        });
        this.groupService = new FlashcardGroupService({
            getStorage: () => this.requireStorage(),
            getGroupRepository: () => this.groupRepository,
            saveStorage: async () => await this.saveStorage(),
            saveDebounced: () => this.saveStorageDebounced()
        });
        this.eventSyncService = new FlashcardEventSyncService({
            plugin: this.plugin,
            findCardsBySourceId: (sourceId, sourceType) => this.sourceCardService.findCardsBySourceId(sourceId, sourceType),
            updateCardsBySourceId: (sourceId, sourceType, newText, newAnswer) => this.sourceCardService.updateCardsBySourceId(sourceId, sourceType, newText, newAnswer),
            deleteCardsBySourceId: (sourceId, sourceType) => this.sourceCardService.deleteCardsBySourceId(sourceId, sourceType),
            saveDebounced: () => this.saveStorageDebounced(),
            emitFlashcardChanged: () => this.plugin.eventManager.emitFlashcardChanged()
        });
        // 初始化为空对象，稍后会被加载的数据替换
        this.storage = this.storageService.createDefaultStorage();
        
    }

    private initialization: Promise<void> | null = null;
    private ready = false;
    private disposed = false;
    private saveTimer: number | null = null;
    private readonly saveQueue = new StorageQueue();

    initialize(): Promise<void> {
        if (!this.initialization) {
            this.initialization = this.storageService.load().then(async storage => {
                this.storage = storage;
                if (storage.parameters) this.fsrsService.loadParameters(storage.parameters);
                const parameters = this.fsrsService.getParameters();
                if (JSON.stringify(storage.parameters) !== JSON.stringify(parameters)) {
                    storage.parameters = parameters;
                    // Persist the migration before accepting reviews; never reschedule existing cards.
                    await this.storageService.save(storage);
                }
                this.groupRepository = this.createGroupRepository();
                this.ready = true;
                if (!this.disposed) this.eventSyncService.registerEventListeners();
            });
        }
        return this.initialization;
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        if (this.saveTimer !== null) {
            window.clearTimeout(this.saveTimer);
            this.saveTimer = null;
            if (this.ready) await this.saveStorage();
        }
        await this.saveQueue.drain();
    }

    private requireStorage(): FSRSStorage {
        if (!this.ready || this.disposed) throw new Error('Flashcard storage is not available.');
        return this.storage;
    }

    private createGroupRepository(): CardGroupRepository {
        return new CardGroupRepository({
            storage: this.storage,
            saveStorageDebounced: () => this.saveStorageDebounced(),
            emitFlashcardChanged: () => this.plugin.eventManager.emitFlashcardChanged()
        });
    }

    private async saveStorage(): Promise<void> {
        if (!this.ready) throw new Error('Flashcards are not ready to save.');
        try {
            await this.saveQueue.run(() => this.storageService.save(JSON.parse(JSON.stringify(this.storage))));
        } catch (error) {
            new Notice(t('HiNote could not save flashcards. Check vault storage before continuing.'));
            throw error;
        }
    }

    private saveStorageDebounced = (): void => {
        if (this.disposed) return;
        if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            void this.saveStorage().catch(error => console.error('[HiNote] Flashcard save failed:', error));
        }, 1000);
    };

    private runStorageMutation<T>(
        mutate: (draft: FSRSStorage) => { changed: boolean; result: T }
    ): Promise<T> {
        this.requireStorage();
        return this.saveQueue.run(async () => {
            const draft: FSRSStorage = JSON.parse(JSON.stringify(this.storage));
            const outcome = mutate(draft);
            if (!outcome.changed) return outcome.result;
            await this.storageService.save(draft);
            this.storage = draft;
            this.groupRepository = this.createGroupRepository();
            if (!this.disposed) this.plugin.eventManager.emitFlashcardChanged();
            return outcome.result;
        });
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
        return this.cardService.addCard(text, answer, filePath, sourceId, sourceType);
    }
    
    /**
     * 统一的卡片学习入口，获取指定分组的卡片
     * @param groupId 分组ID
     * @returns 分组中的卡片列表
     */
    public getCardsForStudy(groupId: string): FlashcardState[] {
        return this.studyService.getCardsForStudy(groupId);
    }
    
    /**
     * 统一的学习进度跟踪方法
     * 这是记录学习进度的唯一入口点
     * @param cardId 卡片ID
     * @param rating 评分
     * @returns 更新后的卡片状态
     */
    public trackStudyProgress(
        cardId: string,
        rating: FSRSRating,
        groupId?: string,
        studyTimeMs = 0
    ): Promise<FlashcardState | null> {
        if (groupId === PAUSED_CARDS_GROUP) return Promise.resolve(null);
        return this.runReviewTransaction(() => cardId, async () => {
            const card = this.reviewDraft?.cards[cardId];
            const limits = this.createReviewDailyStats();
            if (!card || card.suspended || card.nextReview > Date.now()) return null;
            if (card.lastReview === 0 && !limits.canLearnNewCardsToday(groupId)) return null;
            if (card.lastReview > 0 && card.state !== 1 && card.state !== 3 && !limits.canReviewCardsToday(groupId)) return null;
            return this.reviewService.trackStudyProgress(cardId, rating, groupId, studyTimeMs);
        });
    }
    
    /**
     * 获取卡片在不同评分下的预测结果
     * @param cardId 卡片ID
     * @returns 不同评分下的预测结果，如果卡片不存在则返回 null
     */
    public getCardPredictions(cardId: string): Record<FSRSRating, FlashcardState> | null {
        const card = this.requireStorage().cards[cardId];
        return card ? this.fsrsService.getSchedulingCards(card) : null;
    }

    public canUndoReview(): boolean { return !this.reviewDraft && this.reviewService.canUndo(); }
    public getUndoCardId(): string | undefined { return this.reviewService.getUndoCardId(); }

    public async setCardSuspended(cardId: string, suspended: boolean): Promise<boolean> {
        return (await this.setCardsSuspended([cardId], suspended)) === 1;
    }

    public setCardsSuspended(cardIds: Iterable<string>, suspended: boolean): Promise<number> {
        const ids = new Set(cardIds);
        return this.runStorageMutation(draft => {
            let updated = 0;
            for (const id of ids) {
                const card = draft.cards[id];
                if (!card || Boolean(card.suspended) === suspended) continue;
                card.suspended = suspended;
                updated++;
            }
            return { changed: updated > 0, result: updated };
        });
    }
    public undoLastReview(): Promise<boolean> {
        return this.runReviewTransaction(() => this.reviewService.getUndoCardId(), () => this.reviewService.undoLastReview());
    }

    private createReviewDailyStats(): DailyStatsService {
        const storage = this.reviewDraft || this.requireStorage();
        return new DailyStatsService({
            getDailyStats: () => storage.dailyStats,
            setDailyStats: stats => { storage.dailyStats = stats; },
            getGlobalStats: () => storage.globalStats,
            getCardGroups: () => storage.cardGroups,
            getParameters: () => this.fsrsService.getParameters(),
            saveDebounced: () => {}
        });
    }

    /** Keep speculative ratings out of other views and queued saves until disk confirms them. */
    private runReviewTransaction<T>(getCardId: () => string | undefined, operation: () => Promise<T>): Promise<T> {
        this.requireStorage();
        return this.saveQueue.run(async () => {
            const cardId = getCardId();
            const draft: FSRSStorage = JSON.parse(JSON.stringify(this.storage));
            this.reviewDraft = draft;
            try {
                const result = await operation();
                if (result) {
                    const current = cardId ? this.storage.cards[cardId] : undefined;
                    const reviewed = cardId ? draft.cards[cardId] : undefined;
                    if (cardId && current && reviewed) {
                        this.storage.cards[cardId] = { ...current,
                            difficulty: reviewed.difficulty, stability: reviewed.stability,
                            retrievability: reviewed.retrievability, lastReview: reviewed.lastReview,
                            nextReview: reviewed.nextReview, reviews: reviewed.reviews, lapses: reviewed.lapses,
                            reviewHistory: reviewed.reviewHistory, state: reviewed.state,
                            learningSteps: reviewed.learningSteps, scheduledDays: reviewed.scheduledDays };
                    }
                    this.storage.globalStats = draft.globalStats;
                    this.storage.dailyStats = draft.dailyStats;
                }
                return result;
            } finally {
                this.reviewDraft = null;
                if (!this.disposed) this.plugin.eventManager.emitFlashcardChanged();
            }
        });
    }
    
    /**
     * 根据来源ID查找卡片
     * @param sourceId 来源ID（高亮或批注的ID）
     * @param sourceType 来源类型
     * @returns 找到的卡片列表
     */
    public findCardsBySourceId(sourceId: string, sourceType?: FlashcardSourceType): FlashcardState[] {
        return this.sourceCardService.findCardsBySourceId(sourceId, sourceType);
    }
    
    /**
     * 根据来源ID删除卡片
     * @param sourceId 来源ID（高亮或批注的ID）
     * @param sourceType 来源类型
     * @returns 删除的卡片数量
     */
    public deleteCardsBySourceId(sourceId: string, sourceType?: FlashcardSourceType): number {
        return this.sourceCardService.deleteCardsBySourceId(sourceId, sourceType);
    }
    
    /**
     * 根据来源ID更新卡片内容
     * @param sourceId 来源ID
     * @param sourceType 来源类型
     * @param newText 新的文本内容
     * @param newAnswer 新的答案内容
     * @returns 更新的卡片数量
     */
    public updateCardsBySourceId(sourceId: string, sourceType: FlashcardSourceType, newText?: string, newAnswer?: string): number {
        return this.sourceCardService.updateCardsBySourceId(sourceId, sourceType, newText, newAnswer);
    }

    /** 获取所有卡片的总数。 */
    public getTotalCardsCount(): number {
        return this.cardService.getTotalCardsCount();
    }

    public getProgress(): FlashcardProgress {
        return this.studyService.getProgress();
    }

    public getStats(): FSRSGlobalStats {
        return { ...this.storage.globalStats };
    }

    // UI状态管理
    public getUIState(): HiCardState {
        return this.uiStateService.getUIState();
    }

    public updateUIState(state: Partial<HiCardState>) {
        this.uiStateService.updateUIState(state);
    }

    public deleteCard(cardId: string): Promise<boolean> {
        return this.deleteCards([cardId]).then(count => count === 1);
    }

    public deleteCards(cardIds: Iterable<string>): Promise<number> {
        const ids = new Set(cardIds);
        return this.runStorageMutation(draft => {
            let deleted = 0;
            for (const id of ids) {
                if (!draft.cards[id]) continue;
                delete draft.cards[id];
                deleted++;
            }
            if (!deleted) return { changed: false, result: 0 };
            for (const group of draft.cardGroups) {
                if (group.cardIds) group.cardIds = group.cardIds.filter(id => !ids.has(id));
            }
            return { changed: true, result: deleted };
        });
    }

    public updateCard(
        cardId: string,
        updates: Pick<Partial<FlashcardState>, 'text' | 'answer' | 'filePath' | 'frontCustomized'>,
        manualGroupIds?: Iterable<string>
    ): Promise<boolean> {
        const selectedGroups = manualGroupIds ? new Set(manualGroupIds) : null;
        return this.runStorageMutation(draft => {
            const card = draft.cards[cardId];
            if (!card) return { changed: false, result: false };
            if (typeof updates.frontCustomized === 'boolean' && card.sourceType === 'highlight' && card.sourceId) {
                const source = this.plugin.highlightRepository.findHighlightById(card.sourceId);
                if (!source) throw new Error(t('The source highlight is unavailable. Try again after locating it.'));
                const text = updates.frontCustomized ? updates.text?.trim() : source.text;
                if (!text?.trim()) throw new Error(t('Card front cannot be empty.'));
                card.text = text;
                card.frontCustomized = updates.frontCustomized;
                card.answer = buildLinkedCardAnswer(text, source.comments || []);
            } else if (typeof updates.text === 'string') card.text = updates.text;
            if (typeof updates.answer === 'string') card.answer = updates.answer;
            if (typeof updates.filePath === 'string') card.filePath = updates.filePath || undefined;
            card.updatedAt = Date.now();
            if (selectedGroups) {
                const dynamicIds = new Set(draft.cardGroups.filter(group => group.filter?.trim()).map(group => group.id));
                const nextGroupIds = new Set((card.groupIds || []).filter(id => dynamicIds.has(id)));
                for (const group of draft.cardGroups) {
                    if (group.filter?.trim()) continue;
                    const selected = selectedGroups.has(group.id);
                    group.cardIds = (group.cardIds || []).filter(id => id !== cardId);
                    if (selected) {
                        group.cardIds.push(cardId);
                        nextGroupIds.add(group.id);
                    }
                }
                card.groupIds = [...nextGroupIds];
            }
            return { changed: true, result: true };
        });
    }

    public addCardsToGroup(cardIds: Iterable<string>, groupId: string): Promise<number> {
        const ids = new Set(cardIds);
        return this.runStorageMutation(draft => {
            const group = draft.cardGroups.find(item => item.id === groupId && !item.filter?.trim());
            if (!group) return { changed: false, result: 0 };
            group.cardIds ??= [];
            let added = 0;
            for (const id of ids) {
                const card = draft.cards[id];
                if (!card || group.cardIds.includes(id)) continue;
                group.cardIds.push(id);
                card.groupIds ??= [];
                if (!card.groupIds.includes(groupId)) card.groupIds.push(groupId);
                added++;
            }
            return { changed: added > 0, result: added };
        });
    }

    public resetCardProgress(cardId: string): Promise<boolean> {
        return this.runStorageMutation(draft => {
            const card = draft.cards[cardId];
            if (!card) return { changed: false, result: false };
            const reset = this.fsrsService.initializeCard(card.text, card.answer, card.filePath);
            draft.cards[cardId] = {
                ...reset,
                id: card.id,
                createdAt: card.createdAt,
                updatedAt: Date.now(),
                groupIds: card.groupIds ? [...card.groupIds] : undefined,
                sourceId: card.sourceId,
                sourceType: card.sourceType,
                frontCustomized: card.frontCustomized,
                suspended: false
            };
            return { changed: true, result: true };
        });
    }

    /**
     * 根据文件路径获取卡片
     * @param filePath 文件路径
     * @returns 该文件下的卡片列表
     */
    public getCardsByFile(filePath: string): FlashcardState[] {
        return this.cardService.getCardsByFile(filePath);
    }

    /**
     * 获取插件实例（公共方法，供外部访问）
     * @returns 插件实例
     */
    public getPlugin(): CommentPlugin {
        return this.plugin;
    }
    
    /**
     * 公共保存方法，供外部调用
     * @returns Promise<void>
     */
    public async saveStoragePublic(): Promise<void> {
        this.storage.parameters = this.fsrsService.getParameters();
        await this.saveStorage();
        if (!this.disposed) this.plugin.eventManager.emitFlashcardChanged();
    }

    public async renameGroupUIState(oldName: string, newName: string): Promise<void> {
        await this.uiStateService.renameGroupUIState(oldName, newName);
    }

    /**
     * 重置今天的学习统计。
     * @returns 如果找到并移除了今天的统计数据，返回 true。
     */
    public async resetTodayStats(): Promise<boolean> {
        this.requireStorage();
        return this.saveQueue.run(async () => {
            const day = new Date().toDateString();
            const dailyStats = this.storage.dailyStats.filter(stats => new Date(stats.date).toDateString() !== day);
            if (dailyStats.length === this.storage.dailyStats.length) return false;
            const snapshot = JSON.parse(JSON.stringify({ ...this.storage, dailyStats }));
            await this.storageService.save(snapshot);
            this.storage.dailyStats = dailyStats;
            if (!this.disposed) this.plugin.eventManager.emitFlashcardChanged();
            return true;
        });
    }

    public getDailyStats(): DailyStats[] {
        return this.dailyStatsService.getDailyStats();
    }

    /**
     * 检查今天是否还能学习新卡片
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public canLearnNewCardsToday(groupId?: string): boolean {
        return this.dailyStatsService.canLearnNewCardsToday(groupId);
    }

    /**
     * 检查今天是否还能复习卡片
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public canReviewCardsToday(groupId?: string): boolean {
        return this.dailyStatsService.canReviewCardsToday(groupId);
    }

    /**
     * 获取今天剩余的新卡片学习数量
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public getRemainingNewCardsToday(groupId?: string): number {
        return this.dailyStatsService.getRemainingNewCardsToday(groupId);
    }

    /**
     * 获取今天剩余的复习卡片数量
     * @param groupId 可选的分组ID，如果提供则使用分组特定的设置
     */
    public getRemainingReviewsToday(groupId?: string): number {
        return this.dailyStatsService.getRemainingReviewsToday(groupId);
    }
    /**
     * 创建新分组
     * @param group 分组数据（不含ID）
     * @returns 创建的分组
     */
    public async createCardGroup(group: Omit<CardGroup, 'id'>): Promise<CardGroup> {
        return this.groupService.createCardGroup(group);
    }
    
    /**
     * 更新分组
     * @param groupId 分组ID
     * @param updates 要更新的字段
     * @returns 是否更新成功
     */
    public async updateCardGroup(groupId: string, updates: Partial<Omit<CardGroup, 'id'>>): Promise<boolean> {
        return this.groupService.updateCardGroup(groupId, updates);
    }
    
    /**
     * 删除分组
     * @param groupId 分组ID
     * @param deleteCards 是否同时删除分组内的卡片
     * @returns 是否删除成功
     */
    public async deleteCardGroup(groupId: string, deleteCards = false): Promise<boolean> {
        return this.groupService.deleteCardGroup(groupId, deleteCards);
    }
    
    /**
     * 获取分组中的所有卡片（根据过滤条件）
     * @param group 分组对象
     * @returns 符合条件的卡片列表
     */
    public getCardsInGroup(group: CardGroup): FlashcardState[] {
        return this.groupService.getCardsInGroup(group);
    }
    
    /**
     * 将卡片添加到分组
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否添加成功
     */
    public addCardToGroup(cardId: string, groupId: string): boolean {
        return this.groupService.addCardToGroup(cardId, groupId);
    }
    
    /**
     * 从分组中移除卡片
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否移除成功
     */
    public removeCardFromGroup(cardId: string, groupId: string): boolean {
        return this.groupService.removeCardFromGroup(cardId, groupId);
    }
    
    /**
     * 获取分组的学习进度
     * @param groupId 分组ID
     * @returns 分组的学习进度
     */
    public getGroupProgress(groupId: string): FlashcardProgress | null {
        return this.groupService.getGroupProgress(groupId);
    }
    
    /**
     * 获取分组中的所有卡片
     * @param groupId 分组ID
     * @returns 分组中的卡片列表
     */
    public getCardsByGroupId(groupId: string): FlashcardState[] {
        return this.groupService.getCardsByGroupId(groupId);
    }
    
    /**
     * 获取所有卡片的数组
     * @returns 所有卡片的数组
     */
    public getAllCards(): FlashcardState[] {
        return this.cardService.getAllCards();
    }
    
    /**
     * 获取所有分组
     * @returns 所有分组列表
     */
    public getCardGroups(): CardGroup[] {
        return this.groupService.getCardGroups();
    }
    /**
     * 清理所有分组中的无效卡片引用
     * 这个方法会移除分组中指向不存在卡片的引用
     */
    public cleanupInvalidCardReferences(): number {
        return this.groupService.cleanupInvalidCardReferences();
    }
}

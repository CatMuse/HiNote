import { CardGroup, FlashcardState, FlashcardProgress } from '../types/FSRSTypes';
import { IdGenerator } from '../../utils/IdGenerator';

/**
 * 闪卡分组仓库类，负责管理闪卡分组数据
 */
export class CardGroupRepository {
    private plugin: any;
    private storage: any;
    
    constructor(plugin: any, storage: any) {
        this.plugin = plugin;
        this.storage = storage;
    }
    
    /**
     * 获取所有分组
     * @returns 所有分组列表
     */
    public getCardGroups(): CardGroup[] {
        return this.storage.cardGroups || [];
    }
    
    /**
     * 根据ID获取分组
     * @param groupId 分组ID
     * @returns 找到的分组或null
     */
    public getGroupById(groupId: string): CardGroup | null {
        return this.storage.cardGroups.find((g: CardGroup) => g.id === groupId) || null;
    }
    
    /**
     * 创建新分组
     * @param group 分组数据（不含ID）
     * @returns 创建的分组
     */
    public async createCardGroup(group: Omit<CardGroup, 'id'>): Promise<CardGroup> {
        
        // 确保 cardGroups 数组已初始化
        if (!Array.isArray(this.storage.cardGroups)) {
            this.storage.cardGroups = [];
        }
        
        // 生成唯一ID
        const id = IdGenerator.generateGroupId();
        
        // 创建新分组
        const newGroup: CardGroup = {
            id,
            name: group.name,
            filter: group.filter,
            createdTime: group.createdTime || Date.now(),
            sortOrder: group.sortOrder || this.storage.cardGroups.length,
            isReversed: group.isReversed || false,
            settings: group.settings || {
                useGlobalSettings: true
            },
            cardIds: []
        };
        
        // 添加到存储
        this.storage.cardGroups.push(newGroup);
        
        // 如果有筛选条件，自动添加符合条件的卡片
        if (group.filter && group.filter.trim().length > 0) {
            this.updateGroupCardIds(newGroup.id);
        }
        
        // 直接保存一次，确保分组数据被保存
        try {
            await this.plugin.fsrsManager.saveStoragePublic();
        } catch (error) {
            console.error('保存分组数据时出错:', error);
        }
        
        // 触发事件
        this.plugin.eventManager.emitFlashcardChanged();
        
        return newGroup;
    }
    
    /**
     * 更新分组
     * @param groupId 分组ID
     * @param updates 要更新的字段
     * @returns 是否更新成功
     */
    public async updateCardGroup(groupId: string, updates: Partial<CardGroup>): Promise<boolean> {
        
        const index = this.storage.cardGroups.findIndex((g: CardGroup) => g.id === groupId);
        if (index === -1) {
            return false;
        }
        
        // 更新分组
        this.storage.cardGroups[index] = {
            ...this.storage.cardGroups[index],
            ...updates
            // 移除 lastUpdated 字段，因为 FlashcardState 类型中没有这个字段
        };
        
        // 如果更新了筛选条件，自动更新卡片列表
        if (updates.filter) {
            this.updateGroupCardIds(groupId);
        }
        
        // 触发事件
        this.plugin.eventManager.emitFlashcardChanged();
        
        return true;
    }
    
    /**
     * 删除分组
     * @param groupId 分组ID
     * @param deleteCards 是否同时删除分组内的卡片
     * @returns 是否删除成功
     */
    public async deleteCardGroup(groupId: string, deleteCards = false): Promise<boolean> {
        const index = this.storage.cardGroups.findIndex((g: CardGroup) => g.id === groupId);
        if (index === -1) return false;
        
        // 保存被删除的分组，以便出错时恢复
        const deletedGroup = this.storage.cardGroups[index];
        
        // 如果当前UI状态使用了这个分组，重置UI状态
        const uiState = this.storage.uiState;
        
        // 清理UI状态中的分组信息
        if (uiState.currentGroupId === groupId) {
            uiState.currentGroupId = '';
            uiState.currentGroupName = ''; // 保持向后兼容
            uiState.currentIndex = 0;
            uiState.isFlipped = false;
            uiState.completionMessage = null;
        }
        
        // 清理分组完成消息
        if (uiState.groupCompletionMessages && groupId in uiState.groupCompletionMessages) {
            delete uiState.groupCompletionMessages[groupId];
        }
        
        // 清理分组学习进度（使用 groupId 作为键）
        if (uiState.groupProgress && groupId in uiState.groupProgress) {
            delete uiState.groupProgress[groupId];
        }
        
        // 获取该分组内的所有卡片
        const cardsInGroup = [...(deletedGroup.cardIds || [])];
        
        // 仅解除卡片与分组的关联，不再删除卡片
        for (const cardId of cardsInGroup) {
            this.removeCardFromGroup(cardId, groupId);
        }
        
        // 删除分组
        this.storage.cardGroups.splice(index, 1);
        
        // 触发事件
        this.plugin.eventManager.emitFlashcardChanged();
        
        return true;
    }
    
    /**
     * 将卡片添加到分组
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否添加成功
     */
    public addCardToGroup(cardId: string, groupId: string): boolean {
        // 查找分组
        const group = this.storage.cardGroups.find((g: CardGroup) => g.id === groupId);
        if (!group) return false;
        
        // 查找卡片
        const card = this.storage.cards[cardId];
        if (!card) return false;
        
        // 确保分组有cardIds数组
        if (!group.cardIds) {
            group.cardIds = [];
        }
        
        // 确保卡片有groupIds数组
        if (!card.groupIds) {
            card.groupIds = [];
        }
        
        // 如果卡片已经在分组中，直接返回成功
        if (group.cardIds.includes(cardId)) {
            return true;
        }
        
        // 将卡片添加到分组
        group.cardIds.push(cardId);
        
        // 将分组添加到卡片的分组列表
        if (!card.groupIds.includes(groupId)) {
            card.groupIds.push(groupId);
        }
        
        return true;
    }
    
    /**
     * 从分组中移除卡片
     * @param cardId 卡片ID
     * @param groupId 分组ID
     * @returns 是否移除成功
     */
    public removeCardFromGroup(cardId: string, groupId: string): boolean {
        // 查找分组
        const group = this.storage.cardGroups.find((g: CardGroup) => g.id === groupId);
        if (!group || !group.cardIds) return false;
        
        // 查找卡片
        const card = this.storage.cards[cardId];
        if (!card) return false;
        
        // 从分组中移除卡片
        group.cardIds = group.cardIds.filter((id: string) => id !== cardId);
        
        // 从卡片的分组列表中移除分组
        if (card.groupIds) {
            card.groupIds = card.groupIds.filter((id: string) => id !== groupId);
        }
        
        return true;
    }
    
    /**
     * 获取分组中的所有卡片
     * @param groupId 分组ID
     * @returns 分组中的卡片列表
     */
    public getCardsByGroupId(groupId: string): FlashcardState[] {
        
        const group = this.getGroupById(groupId);
        if (!group) {
            console.error(`[getCardsByGroupId] 错误: 未找到分组: ${groupId}`);
            return [];
        }
        
        
        // 检查存储中的卡片
        const allCardIds = Object.keys(this.storage.cards || {});
        
        // 如果分组有 cardIds 数组，直接返回这些卡片
        if (group.cardIds && group.cardIds.length > 0) {
            
            const filteredCards = group.cardIds
                .filter((id: string) => {
                    const exists = !!this.storage.cards[id];
                    if (!exists) {
                        console.warn(`[getCardsByGroupId] 卡片不存在: ${id}`);
                    }
                    return exists;
                })
                .map((id: string) => this.storage.cards[id]);
            
            return filteredCards;
        }
        
        // 如果没有卡片ID，但有筛选条件，则根据筛选条件获取卡片
        if (group.filter && group.filter.trim().length > 0) {
            
            const allCards = Object.values(this.storage.cards) as FlashcardState[];
            const filterConditions = group.filter.split(',').map(f => f.trim()).filter(f => f.length > 0);
            const wikiLinkRegex = /\[\[([^\]]+)\]\]/;
            
            const filteredCards = allCards.filter((card: FlashcardState) => {
                if (!card.filePath) return false;
                
                const filePath = card.filePath.toLowerCase();
                const fileName = filePath.split('/').pop() || '';
                const fileNameWithoutExt = fileName.replace(/\.md$/i, '');
                
                for (const condition of filterConditions) {
                    const conditionLower = condition.toLowerCase();
                    const wikiMatch = conditionLower.match(wikiLinkRegex);
                    
                    if (wikiMatch) {
                        const linkText = wikiMatch[1].toLowerCase();
                        if (fileNameWithoutExt === linkText || fileName === linkText) {
                            return true;
                        }
                    } else if (filePath.includes(conditionLower) ||
                              (card.text && card.text.toLowerCase().includes(conditionLower)) ||
                              (card.answer && card.answer.toLowerCase().includes(conditionLower))) {
                        return true;
                    }
                }
                return false;
            });
            
            return filteredCards;
        }
        
        return [];
    }
    
    /**
     * 获取分组的学习进度
     * @param groupId 分组ID
     * @returns 分组的学习进度
     */
    public getGroupProgress(groupId: string): FlashcardProgress | null {
        const group = this.getGroupById(groupId);
        if (!group) return null;
        
        const cards = this.getCardsByGroupId(groupId);
        const now = Date.now();
        
        return {
            due: cards.filter((c: FlashcardState) => c.nextReview <= now).length,
            newCards: cards.filter((c: FlashcardState) => c.lastReview === 0).length,
            learned: cards.filter((c: FlashcardState) => c.lastReview > 0).length,
            retention: this.calculateGroupRetention(cards)
        };
    }
    
    /**
     * 计算分组的记忆保持率
     * @private
     */
    private calculateGroupRetention(cards: FlashcardState[]): number {
        const reviewedCards = cards.filter((c: FlashcardState) => c.lastReview > 0);
        if (reviewedCards.length === 0) return 1;
        
        const totalRetention = reviewedCards.reduce((sum: number, card: FlashcardState) => sum + card.retrievability, 0);
        return totalRetention / reviewedCards.length;
    }
    
    /**
     * 删除卡片引用（从所有分组中移除）
     * @private
     */
    private deleteCardReference(cardId: string): void {
        // 从所有分组中移除卡片引用
        for (const group of this.storage.cardGroups) {
            if (group.cardIds) {
                group.cardIds = group.cardIds.filter((id: string) => id !== cardId);
            }
        }
    }
    
    /**
     * 获取卡片所属的分组
     * @param cardId 卡片ID
     * @returns 卡片所属的分组列表
     */
    public getGroupsByCardId(cardId: string): CardGroup[] {
        const card = this.storage.cards[cardId];
        if (!card || !card.groupIds) return [];
        
        return card.groupIds
            .map((id: string) => this.storage.cardGroups.find((g: CardGroup) => g.id === id))
            .filter((group: CardGroup | undefined) => group !== undefined);
    }
    
    /**
     * 更新分组的卡片列表，根据筛选条件自动添加符合条件的卡片
     * @param groupId 分组ID
     * @returns 是否更新成功
     */
    public updateGroupCardIds(groupId: string): boolean {
        const group = this.getGroupById(groupId);
        if (!group || !group.filter || group.filter.trim().length === 0) {
            return false;
        }
        
        // 根据筛选条件获取符合条件的卡片
        const allCards = Object.values(this.storage.cards || {}) as FlashcardState[];
        const filterConditions = group.filter.split(',').map(f => f.trim()).filter(f => f.length > 0);
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/;
        
        // 筛选符合条件的卡片
        const matchedCards = allCards.filter((card: FlashcardState) => {
            if (!card.filePath) return false;
            
            const filePath = card.filePath.toLowerCase();
            const fileName = filePath.split('/').pop() || '';
            const fileNameWithoutExt = fileName.replace(/\.md$/i, '');
            
            for (const condition of filterConditions) {
                const conditionLower = condition.toLowerCase();
                const wikiMatch = conditionLower.match(wikiLinkRegex);
                
                if (wikiMatch) {
                    const linkText = wikiMatch[1].toLowerCase();
                    if (fileNameWithoutExt === linkText || fileName === linkText) {
                        return true;
                    }
                } else if (filePath.includes(conditionLower) ||
                          (card.text && card.text.toLowerCase().includes(conditionLower)) ||
                          (card.answer && card.answer.toLowerCase().includes(conditionLower))) {
                    return true;
                }
            }
            return false;
        });
        
        // 获取匹配卡片的ID列表
        const matchedCardIds = matchedCards.map(card => card.id);
        
        // 更新分组的cardIds数组
        if (!group.cardIds) {
            group.cardIds = [];
        }
        
        // 将符合条件的卡片ID添加到分组中
        let updated = false;
        for (const cardId of matchedCardIds) {
            if (!group.cardIds.includes(cardId)) {
                group.cardIds.push(cardId);
                updated = true;
            }
        }
        
        if (updated) {
            console.log(`[更新分组卡片] 分组 "${group.name}" 添加了 ${matchedCardIds.length} 个卡片`);
            // 触发保存
            this.plugin.fsrsManager.saveStorageDebounced();
        }
        
        return updated;
    }
}

import { CardGroup, FlashcardState, FlashcardProgress } from '../types/FSRSTypes';

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
        // 生成唯一ID
        const id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
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
        if (index === -1) return false;
        
        // 更新分组
        this.storage.cardGroups[index] = {
            ...this.storage.cardGroups[index],
            ...updates,
            lastUpdated: Date.now()
        };
        
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
    public async deleteCardGroup(groupId: string, deleteCards = true): Promise<boolean> {
        const index = this.storage.cardGroups.findIndex((g: CardGroup) => g.id === groupId);
        if (index === -1) return false;
        
        // 保存被删除的分组，以便出错时恢复
        const deletedGroup = this.storage.cardGroups[index];
        
        // 如果当前UI状态使用了这个分组，重置UI状态
        const uiState = this.storage.uiState;
        if (uiState.currentGroupName === groupId) {
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
                this.deleteCardReference(cardId);
            }
        } else {
            // 仅解除卡片与分组的关联
            for (const cardId of cardsInGroup) {
                this.removeCardFromGroup(cardId, groupId);
            }
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
        const group = this.storage.cardGroups.find((g: CardGroup) => g.id === groupId);
        if (!group || !group.cardIds) return [];
        
        return group.cardIds
            .map((id: string) => this.storage.cards[id])
            .filter((card: FlashcardState | undefined) => card !== undefined);
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
            due: cards.filter(c => c.nextReview <= now).length,
            newCards: cards.filter(c => c.lastReview === 0).length,
            learned: cards.filter(c => c.lastReview > 0).length,
            retention: this.calculateGroupRetention(cards)
        };
    }
    
    /**
     * 计算分组的记忆保持率
     * @private
     */
    private calculateGroupRetention(cards: FlashcardState[]): number {
        const reviewedCards = cards.filter(c => c.lastReview > 0);
        if (reviewedCards.length === 0) return 1;
        
        const totalRetention = reviewedCards.reduce((sum, card) => sum + card.retrievability, 0);
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
     * 从标签文本中提取标签
     * @param text 包含标签的文本
     * @returns 提取的标签数组
     */
    public extractTagsFromText(text: string): string[] {
        if (!text) return [];
        
        const tagRegex = /#([a-zA-Z0-9_\u4e00-\u9fa5]+)/g;
        const matches = [...text.matchAll(tagRegex)];
        
        return matches.map(match => match[1]);
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
}

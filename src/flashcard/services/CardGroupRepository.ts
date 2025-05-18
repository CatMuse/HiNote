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
        console.log(`开始创建新分组: ${group.name}, 过滤条件: ${group.filter}`);
        
        // 检查存储对象
        console.log('存储对象结构:', Object.keys(this.storage));
        
        // 确保 cardGroups 数组已初始化
        if (!Array.isArray(this.storage.cardGroups)) {
            console.log('初始化 cardGroups 数组');
            this.storage.cardGroups = [];
        }
        
        // 生成唯一ID
        const id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        console.log(`生成分组ID: ${id}`);
        
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
        console.log(`分组已添加到存储，当前分组数量: ${this.storage.cardGroups.length}`);
        console.log('存储中的分组:', this.storage.cardGroups.map((g: CardGroup) => g.name));
        
        // 直接保存一次，确保分组数据被保存
        try {
            await this.plugin.fsrsManager.saveStoragePublic();
            console.log('分组数据已直接保存');
        } catch (error) {
            console.error('保存分组数据时出错:', error);
        }
        
        // 触发事件
        this.plugin.eventManager.emitFlashcardChanged();
        console.log('分组创建完成，已触发事件');
        
        return newGroup;
    }
    
    /**
     * 更新分组
     * @param groupId 分组ID
     * @param updates 要更新的字段
     * @returns 是否更新成功
     */
    public async updateCardGroup(groupId: string, updates: Partial<CardGroup>): Promise<boolean> {
        console.log(`开始更新分组: ${groupId}`);
        
        const index = this.storage.cardGroups.findIndex((g: CardGroup) => g.id === groupId);
        if (index === -1) {
            console.log(`未找到分组: ${groupId}`);
            return false;
        }
        
        // 更新分组
        this.storage.cardGroups[index] = {
            ...this.storage.cardGroups[index],
            ...updates
            // 移除 lastUpdated 字段，因为 FlashcardState 类型中没有这个字段
        };
        
        console.log(`分组已更新: ${this.storage.cardGroups[index].name}`);
        
        // 注意: 移除了重复的保存逻辑，由调用方统一处理保存
        
        // 触发事件
        this.plugin.eventManager.emitFlashcardChanged();
        console.log('分组更新完成，已触发事件');
        
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
        const groupName = deletedGroup.name;
        
        // 清理UI状态中的分组信息
        if (uiState.currentGroupName === groupName) {
            uiState.currentGroupName = '';
            uiState.currentIndex = 0;
            uiState.isFlipped = false;
            uiState.completionMessage = null;
        }
        
        // 清理分组完成消息
        if (uiState.groupCompletionMessages && uiState.groupCompletionMessages[groupName] !== undefined) {
            delete uiState.groupCompletionMessages[groupName];
        }
        
        // 清理分组学习进度
        if (uiState.groupProgress && uiState.groupProgress[groupName]) {
            delete uiState.groupProgress[groupName];
        }
        
        // 获取该分组内的所有卡片
        const cardsInGroup = [...(deletedGroup.cardIds || [])];
        console.log(`删除分组 ${groupId}，包含 ${cardsInGroup.length} 张卡片，deleteCards=${deleteCards}`);
        
        // 仅解除卡片与分组的关联，不再删除卡片
        for (const cardId of cardsInGroup) {
            console.log(`从分组 ${groupId} 中移除卡片 ${cardId}`);
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
        console.log(`[getCardsByGroupId] 开始获取分组卡片, 分组ID: ${groupId}`);
        
        const group = this.getGroupById(groupId);
        if (!group) {
            console.error(`[getCardsByGroupId] 错误: 未找到分组: ${groupId}`);
            return [];
        }
        
        console.log(`[getCardsByGroupId] 找到分组:`, {
            id: group.id,
            name: group.name,
            filter: group.filter,
            cardIds: group.cardIds ? group.cardIds.length : 0
        });
        
        // 检查存储中的卡片
        const allCardIds = Object.keys(this.storage.cards || {});
        console.log(`[getCardsByGroupId] 存储中共有 ${allCardIds.length} 张卡片`);
        
        // 如果分组有 cardIds 数组，直接返回这些卡片
        if (group.cardIds && group.cardIds.length > 0) {
            console.log(`[getCardsByGroupId] 分组 ${group.name} 有 ${group.cardIds.length} 张卡片`);
            
            // 记录前5张卡片的ID，用于调试
            console.log(`[getCardsByGroupId] 前5张卡片ID:`, group.cardIds.slice(0, 5));
            
            const filteredCards = group.cardIds
                .filter((id: string) => {
                    const exists = !!this.storage.cards[id];
                    if (!exists) {
                        console.warn(`[getCardsByGroupId] 卡片不存在: ${id}`);
                    }
                    return exists;
                })
                .map((id: string) => this.storage.cards[id]);
                
            console.log(`[getCardsByGroupId] 成功获取 ${filteredCards.length}/${group.cardIds.length} 张有效卡片`);
            
            if (filteredCards.length > 0) {
                console.log(`[getCardsByGroupId] 第一张卡片示例:`, {
                    id: filteredCards[0].id,
                    text: filteredCards[0].text?.substring(0, 50) + '...',
                    answer: filteredCards[0].answer,
                    reviews: filteredCards[0].reviews
                });
            }
            
            return filteredCards;
        }
        
        // 如果没有卡片ID，但有筛选条件，则根据筛选条件获取卡片
        if (group.filter && group.filter.trim().length > 0) {
            console.log(`[getCardsByGroupId] 使用筛选条件获取卡片: ${group.filter}`);
            
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
            
            console.log(`[getCardsByGroupId] 根据筛选条件找到 ${filteredCards.length} 张卡片`);
            return filteredCards;
        }
        
        console.log(`[getCardsByGroupId] 分组 ${group.name} 没有卡片ID和筛选条件，返回空数组`);
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
    
    // 标签相关功能已移除
    
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

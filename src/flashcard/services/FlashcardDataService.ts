import { FSRSStorage, FlashcardState, CardGroup } from '../types/FSRSTypes';

/**
 * 闪卡数据服务类
 * 负责闪卡数据的导入导出、格式转换和与其他系统的互操作性
 */
export class FlashcardDataService {
    private plugin: any;
    private storage: FSRSStorage;

    constructor(plugin: any, storage: FSRSStorage) {
        this.plugin = plugin;
        this.storage = storage;
    }

    /**
     * 导出完整的 FSRS 数据
     * @returns 导出的存储数据
     */
    public exportData(): FSRSStorage {
        return JSON.parse(JSON.stringify(this.storage));
    }

    /**
     * 导入完整的 FSRS 数据
     * @param data 要导入的数据
     * @returns 是否导入成功
     */
    public importData(data: FSRSStorage): boolean {
        try {
            // 验证数据结构
            if (typeof data.version !== 'string' || !data.cards || !data.globalStats) {
                throw new Error('无效的 FSRS 数据结构');
            }
            
            // 更新存储
            Object.assign(this.storage, data);
            
            return true;
        } catch (error) {
            console.error('导入 FSRS 数据失败:', error);
            return false;
        }
    }

    /**
     * 导出卡片为 Anki 格式
     * @param cardIds 要导出的卡片 ID 数组，如果为空则导出所有卡片
     * @returns Anki 格式的导出数据（CSV 字符串）
     */
    public exportToAnki(cardIds?: string[]): string {
        const cards = cardIds 
            ? cardIds.map(id => this.storage.cards[id]).filter(Boolean)
            : Object.values(this.storage.cards);
        
        if (cards.length === 0) {
            return '';
        }
        
        // Anki 格式: 正面;背面;标签
        const csvRows = cards.map(card => {
            // 标签功能已移除
            const tagsStr = '';
            
            // 转义分号和换行符
            const front = this.escapeForCsv(card.text);
            const back = this.escapeForCsv(card.answer);
            
            return `${front};${back};${tagsStr}`;
        });
        
        // 添加标题行
        csvRows.unshift('正面;背面;标签');
        
        return csvRows.join('\n');
    }
    
    /**
     * 从 Anki 格式导入卡片
     * @param ankiData Anki 格式的导入数据（CSV 字符串）
     * @param groupId 要将卡片添加到的分组 ID，如果为空则不添加到任何分组
     * @returns 导入的卡片数量
     */
    public importFromAnki(ankiData: string, groupId?: string): number {
        try {
            const lines = ankiData.split('\n').filter(line => line.trim());
            
            // 跳过标题行
            const dataLines = lines.length > 1 && lines[0].includes(';') ? lines.slice(1) : lines;
            
            let importedCount = 0;
            
            for (const line of dataLines) {
                const parts = line.split(';');
                if (parts.length < 2) continue;
                
                const front = this.unescapeFromCsv(parts[0]);
                const back = this.unescapeFromCsv(parts[1]);
                // 标签功能已移除
                
                // 创建新卡片
                const card = this.createCard(front, back);
                
                // 添加到存储
                this.storage.cards[card.id] = card;
                
                // 如果指定了分组，添加到分组
                if (groupId) {
                    const group = this.storage.cardGroups.find(g => g.id === groupId);
                    if (group) {
                        if (!group.cardIds) {
                            group.cardIds = [];
                        }
                        group.cardIds.push(card.id);
                        
                        if (!card.groupIds) {
                            card.groupIds = [];
                        }
                        card.groupIds.push(groupId);
                    }
                }
                
                importedCount++;
            }
            
            return importedCount;
        } catch (error) {
            console.error('从 Anki 导入数据失败:', error);
            return 0;
        }
    }
    
    /**
     * 导出分组数据
     * @param groupIds 要导出的分组 ID 数组，如果为空则导出所有分组
     * @returns 导出的分组数据
     */
    public exportGroups(groupIds?: string[]): CardGroup[] {
        const groups = groupIds
            ? this.storage.cardGroups.filter(g => groupIds.includes(g.id))
            : this.storage.cardGroups;
            
        return JSON.parse(JSON.stringify(groups));
    }
    
    /**
     * 导入分组数据
     * @param groups 要导入的分组数据
     * @returns 导入的分组数量
     */
    public importGroups(groups: CardGroup[]): number {
        try {
            let importedCount = 0;
            
            for (const group of groups) {
                // 检查分组是否已存在
                const existingIndex = this.storage.cardGroups.findIndex(g => g.id === group.id);
                
                if (existingIndex >= 0) {
                    // 更新现有分组
                    this.storage.cardGroups[existingIndex] = {
                        ...this.storage.cardGroups[existingIndex],
                        ...group
                    };
                } else {
                    // 添加新分组
                    this.storage.cardGroups.push({
                        ...group
                    });
                }
                
                importedCount++;
            }
            
            return importedCount;
        } catch (error) {
            console.error('导入分组数据失败:', error);
            return 0;
        }
    }
    
    /**
     * 导出卡片数据
     * @param cardIds 要导出的卡片 ID 数组，如果为空则导出所有卡片
     * @returns 导出的卡片数据
     */
    public exportCards(cardIds?: string[]): FlashcardState[] {
        const cards = cardIds
            ? cardIds.map(id => this.storage.cards[id]).filter(Boolean)
            : Object.values(this.storage.cards);
            
        return JSON.parse(JSON.stringify(cards));
    }
    
    /**
     * 导入卡片数据
     * @param cards 要导入的卡片数据
     * @returns 导入的卡片数量
     */
    public importCards(cards: FlashcardState[]): number {
        try {
            let importedCount = 0;
            
            for (const card of cards) {
                // 添加或更新卡片
                this.storage.cards[card.id] = {
                    ...card,
                    // 更新最后复习时间代替 lastUpdated
                    lastReview: card.lastReview || 0,
                    nextReview: card.nextReview || Date.now()
                };
                
                importedCount++;
            }
            
            return importedCount;
        } catch (error) {
            console.error('导入卡片数据失败:', error);
            return 0;
        }
    }
    
    // 标签相关功能已移除
    
    /**
     * 创建新卡片
     * @private
     */
    private createCard(front: string, back: string): FlashcardState {
        const now = Date.now();
        const id = `card-${now}-${Math.random().toString(36).substring(2, 9)}`;
        
        return {
            id,
            text: front,
            answer: back,
            difficulty: 0,
            stability: 0,
            retrievability: 1,
            lastReview: 0,
            nextReview: now,
            reviews: 0,
            lapses: 0,
            reviewHistory: [],
            createdAt: now,
            groupIds: []
        };
    }
    
    /**
     * 为 CSV 转义字符串
     * @private
     */
    private escapeForCsv(text: string): string {
        if (!text) return '';
        // 转义双引号和分号
        return `"${text.replace(/"/g, '""').replace(/;/g, '\\;')}"`;
    }
    
    /**
     * 从 CSV 反转义字符串
     * @private
     */
    private unescapeFromCsv(text: string): string {
        if (!text) return '';
        
        // 移除首尾引号
        let result = text.trim();
        if (result.startsWith('"') && result.endsWith('"')) {
            result = result.substring(1, result.length - 1);
        }
        
        // 反转义双引号和分号
        return result.replace(/""/g, '"').replace(/\\;/g, ';');
    }
}

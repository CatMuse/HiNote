import { FlashcardState, CardGroup } from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { HighlightInfo as HiNote } from '../../types';

/**
 * 闪卡工厂类，负责闪卡的创建、更新和管理
 * 所有闪卡创建相关的逻辑都应该集中在这个类中
 */
export class FlashcardFactory {
    private fsrsService: FSRSService;
    private plugin: any;

    constructor(plugin: any, fsrsService: FSRSService) {
        this.plugin = plugin;
        this.fsrsService = fsrsService;
    }
    
    /**
     * 获取存储对象
     * @private
     */
    private get storage(): any {
        return this.plugin.fsrsManager.storage;
    }

    /**
     * 创建卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 创建的卡片
     */
    public createCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 使用FSRS服务创建卡片
        try {
            // 使用 initializeCard 方法创建卡片
            const card = this.fsrsService.initializeCard(text, answer, filePath);
            return card;
        } catch (err) {
            console.error('创建卡片时出错:', err);
            // 如果创建失败，再尝试一次
            try {
                return this.fsrsService.initializeCard(text, answer, filePath);
            } catch (e) {
                console.error('第二次尝试创建卡片失败:', e);
                // 如果仍然失败，则使用最简单的方式创建卡片
                const now = new Date();
                // 创建一个简单的卡片对象
                return this.fsrsService.initializeCard(text, answer, filePath);
            }
        }
    }
    
    /**
     * 添加卡片到存储中
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 添加的卡片
     */
    public addCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 创建新卡片
        const card = this.createCard(text, answer, filePath);
        
        // 确保 storage.cards 存在
        if (!this.storage.cards) {
            this.storage.cards = {};
        }
        
        // 保存卡片
        this.storage.cards[card.id] = card;
        
        // 触发事件，让FSRSManager来处理保存
        try {
            this.plugin.eventManager.emitFlashcardChanged();
        } catch (err) {
            console.error('保存卡片时出错:', err);
        }
        
        return card;
    }
    
    /**
     * 根据文件路径获取卡片
     * @param filePath 文件路径
     * @returns 该文件的所有卡片
     */
    public getCardsByFile(filePath: string): FlashcardState[] {
        if (!this.storage.cards) {
            return [];
        }
        
        return (Object.values(this.storage.cards) as FlashcardState[]).filter((card: FlashcardState) => card.filePath === filePath);
    }
    
    /**
     * 删除卡片
     * @param cardId 要删除的卡片ID
     * @returns 是否删除成功
     */
    public deleteCard(cardId: string): boolean {
        try {
            if (!this.storage.cards || !this.storage.cards[cardId]) {
                return false;
            }
            
            // 删除卡片
            delete this.storage.cards[cardId];
            
            // 触发事件，让FSRSManager来处理保存
            this.plugin.eventManager.emitFlashcardChanged();
            
            return true;
        } catch (err) {
            console.error('删除卡片时出错:', err);
            return false;
        }
    }
}

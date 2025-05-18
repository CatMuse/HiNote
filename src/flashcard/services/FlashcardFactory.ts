import { FlashcardState, CardGroup } from '../types/FSRSTypes';
import { FSRSService } from './FSRSService';
import { HiNote } from '../../CommentStore';

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
     * 根据内容查找卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 找到的卡片或null
     */
    public findCardByContent(text: string, answer: string, filePath?: string): FlashcardState | null {
        // 确保 storage.cards 存在
        if (!this.storage.cards) {
            return null;
        }
        
        // 获取所有卡片
        const allCards = Object.values(this.storage.cards) as FlashcardState[];
        
        // 查找匹配的卡片
        const matchingCard = allCards.find((card: FlashcardState) => {
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
     * 创建或更新卡片
     * @param text 卡片正面文本
     * @param answer 卡片背面答案
     * @param filePath 文件路径
     * @returns 创建或更新后的卡片
     */
    public createOrUpdateCard(text: string, answer: string, filePath?: string): FlashcardState {
        try {
            // 先查找是否存在匹配的卡片
            const existingCard = this.findCardByContent(text, answer, filePath);
            
            if (existingCard) {
                // 如果存在匹配的卡片，更新它
                this.storage.cards[existingCard.id] = {
                    ...existingCard,
                    text: text,
                    answer: answer
                    // lastReview 保持不变，因为我们使用了展开运算符
                };
                
                // 触发事件，让FSRSManager来处理保存
                this.plugin.eventManager.emitFlashcardChanged();
                
                return this.storage.cards[existingCard.id];
            } else {
                // 如果不存在匹配的卡片，创建新卡片
                return this.addCard(text, answer, filePath);
            }
        } catch (err) {
            console.error('创建或更新卡片时出错:', err);
            // 如果出错，尝试创建新卡片
            return this.createCard(text, answer, filePath);
        }
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
    
    /**
     * 根据文件路径获取卡片
     * @param filePath 文件路径
     * @returns 该文件下的卡片列表
     */
    public getCardsByFile(filePath: string): FlashcardState[] {
        if (!this.storage.cards) {
            return [];
        }
        
        return Object.values(this.storage.cards)
            .filter((card: any) => card.filePath === filePath) as FlashcardState[];
    }
    
    /**
     * 删除指定文件路径下的卡片
     * @param filePath 文件路径
     * @param text 可选，特定的高亮文本
     * @param answer 可选，特定的评论内容
     * @returns 删除的卡片数量
     */
    public deleteCardsByContent(filePath: string, text?: string, answer?: string): number {
        const cards = this.getCardsByFile(filePath);
        let deletedCount = 0;
        
        for (const card of cards) {
            if (!text && !answer || // 如果没有指定text和answer，删除该文件的所有卡片
                (text && card.text === text) || // 如果指定了text，匹配text
                (answer && card.answer === answer)) { // 如果指定了answer，匹配answer
                if (this.deleteCard(card.id)) {
                    deletedCount++;
                }
            }
        }
        
        return deletedCount;
    }
    
    /**
     * 更新卡片内容（用于高亮文本或批注更新时）
     * @param text 更新的文本内容
     * @param answer 更新的答案内容
     * @param filePath 文件路径
     */
    public updateCardContent(text: string, answer: string, filePath?: string): void {
        if (!filePath || !this.storage.cards) {
            return;
        }
        
        // 获取指定文件的所有卡片
        const cardsInFile = Object.values(this.storage.cards).filter((card: any) => 
            card.filePath === filePath
        ) as FlashcardState[];
        
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
        
        // 触发事件，让FSRSManager来处理保存
        try {
            this.plugin.eventManager.emitFlashcardChanged();
        } catch (err) {
            console.error('更新卡片内容时出错:', err);
        }
    }
}

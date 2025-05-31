import { Notice } from "obsidian";
import { FSRSRating, FlashcardState, DailyStats } from "../types/FSRSTypes";
import { t } from "../../i18n";

/**
 * 闪卡操作类，负责处理卡片的翻转、评分等操作
 */
export class FlashcardOperations {
    private component: any;
    
    constructor(component: any) {
        this.component = component;
    }
    
    /**
     * 翻转卡片
     */
    public flipCard(): void {
        const flipped = !this.component.isCardFlipped();
        this.component.setCardFlipped(flipped);
        
        // 只需要切换卡片的 CSS 类，所有的样式和动画效果都由 CSS 处理
        const cardElement = document.querySelector('.flashcard');
        if (cardElement) {
            if (flipped) {
                cardElement.classList.add('is-flipped');
            } else {
                cardElement.classList.remove('is-flipped');
            }
        }
        
        this.component.saveState();
    }
    
    /**
     * 下一张卡片
     */
    public nextCard(): void {
        const cards = this.component.getCards();
        if (cards.length === 0) return;
        
        let nextIndex = this.component.getCurrentIndex() + 1;
        if (nextIndex >= cards.length) {
            nextIndex = 0;
        }
        
        this.component.setCurrentIndex(nextIndex);
        this.component.setCardFlipped(false);
        this.component.saveState();
        this.component.getRenderer().render();
    }
    
    /**
     * 对卡片进行评分
     * @param rating 评分
     */
    public rateCard(rating: FSRSRating): void {
        const cards = this.component.getCards();
        const currentIndex = this.component.getCurrentIndex();
        
        if (cards.length === 0 || currentIndex >= cards.length) {
            return;
        }
        
        const currentCard = cards[currentIndex];
        if (!currentCard) return;
        
        // 调用 FSRS 管理器进行评分，使用统一的学习进度跟踪方法
        this.component.getFsrsManager().trackStudyProgress(currentCard.id, rating);
        
        // 移除当前卡片
        cards.splice(currentIndex, 1);
        
        // 如果没有更多卡片，显示完成消息
        if (cards.length === 0) {
            // 检查当前分组
            const groupName = this.component.getCurrentGroupName();
            
            // 显示完成消息
            let message = t('No cards due for review');
            
            // 自定义分组
            if (groupName) {
                const group = this.component.getFsrsManager().getCardGroups().find((g: any) => g.name === groupName);
                if (group) {
                    message = t('Group completed: ') + group.name + t('. Add more cards in Settings, but remember: more cards = more reviews.');
                }
            } else {
                message = t('All flashcards completed for today!');
            }
            
            // 设置分组完成消息
            this.component.setGroupCompletionMessage(groupName, message);
            
            // 更新进度
            this.component.updateProgress();
            
            // 重新渲染
            this.component.getRenderer().render();
            
            // 不再显示通知，因为已经在界面上显示了完成消息
            
            return;
        }
        
        // 调整当前索引
        if (currentIndex >= cards.length) {
            this.component.setCurrentIndex(0);
        }
        
        // 重置翻转状态
        this.component.setCardFlipped(false);
        
        // 保存状态
        this.component.saveState();
        
        // 更新进度
        this.component.updateProgress();
        
        // 重新渲染
        this.component.getRenderer().render();
    }
    
    /**
     * 刷新当前卡片列表，考虑每日学习限制
     * 注意：此方法只从已有的卡片中获取数据，不会自动创建新卡片
     */
    public refreshCardList(): void {
        // 获取当前分组
        const groupName = this.component.getCurrentGroupName();
        const fsrsManager = this.component.getFsrsManager();
        
        // 先保存当前状态，以防是切换分组
        const currentCards = this.component.getCards();
        const currentGroupName = this.component.getCurrentGroupName();
        if (currentCards.length > 0 && currentGroupName && currentGroupName !== groupName) {
            // 如果是切换分组，先保存当前分组的状态
            const currentCards = this.component.getCards();
            const currentIndex = this.component.getCurrentIndex();
            const currentCardId = currentCards.length > 0 && currentIndex < currentCards.length ? 
                currentCards[currentIndex].id : undefined;
                
            const currentProgress = {
                currentIndex: currentIndex,
                isFlipped: this.component.isCardFlipped(),
                currentCardId: currentCardId
            };

            // 更新分组进度
            const uiState = fsrsManager.getUIState();
            if (!uiState.groupProgress) {
                uiState.groupProgress = {};
            }
            uiState.groupProgress[currentGroupName] = currentProgress;
            fsrsManager.updateUIState(uiState);
        }
        
        // 获取分组 ID
        const group = fsrsManager.getCardGroups().find((g: any) => g.name === groupName);
        if (!group) {
            console.error(`未找到名称为 ${groupName} 的分组`);
            return;
        }
        
        // 使用分组 ID 获取卡片
        const cards = fsrsManager.getCardsForStudy(group.id);
        
        // 获取保存的UI状态（在设置卡片列表之前）
        const savedProgress = this.component.getGroupProgress(groupName);
        
        // 清除分组完成消息
        this.component.setGroupCompletionMessage(groupName, null);
        
        // 设置卡片列表
        this.component.setCards(cards);
        
        if (cards.length > 0) {
            // 恢复保存的UI状态
            if (savedProgress) {
                let newIndex = 0; // 默认从第一张卡片开始
                
                // 如果有保存的卡片ID，尝试通过ID找到对应的卡片
                if (savedProgress.currentCardId) {
                    // 在新的卡片列表中查找保存的卡片ID
                    const foundIndex = cards.findIndex((card: FlashcardState) => card.id === savedProgress.currentCardId);
                    if (foundIndex !== -1) {
                        // 如果找到了卡片，使用该索引
                        newIndex = foundIndex;
                    } else {
                        // 如果没有找到，使用保存的索引（确保不超出范围）
                        newIndex = Math.min(savedProgress.currentIndex, cards.length - 1);
                    }
                } else {
                    // 如果没有保存卡片ID，使用保存的索引（确保不超出范围）
                    newIndex = Math.min(savedProgress.currentIndex, cards.length - 1);
                }
                
                // 设置当前索引和翻转状态
                this.component.setCurrentIndex(newIndex);
                this.component.setCardFlipped(savedProgress.isFlipped);
            } else {
                // 如果没有保存的状态，从头开始
                this.component.setCurrentIndex(0);
                this.component.setCardFlipped(false);
            }
        } else {
            // If there are no cards, show completion message
            let message = t('No cards due for review');
            
            // Custom group
            if (groupName) {
                const group = fsrsManager.getCardGroups().find((g: any) => g.name === groupName);
                if (group) {
                    message = t('Group completed: ') + group.name + t('. Add more cards in Settings, but remember: more cards = more reviews.');
                }
            } else {
                message = t('All flashcards completed for today!');
            }
            
            this.component.setGroupCompletionMessage(groupName, message);
        }
        
        // 保存状态
        this.component.saveState();
    }
}
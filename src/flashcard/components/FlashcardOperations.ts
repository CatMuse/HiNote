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
                const group = this.component.getFsrsManager().getCardGroups().find((g: any) => g.id === groupName);
                if (group) {
                    message = t('No cards due for review in group: ') + group.name;
                }
            } else {
                message = t('You have completed all flashcards for today!');
            }
            
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
        
        // 使用统一的卡片获取方法
        let cards: FlashcardState[] = [];
        
        // 使用统一的卡片获取方法，传入分组ID
        console.log(`使用统一的方法获取分组 ${groupName} 的卡片`);
        cards = fsrsManager.getCardsForStudy(groupName);
        console.log(`获取到 ${cards.length} 张卡片`);
        
        // 清除完成消息并设置卡片列表
        this.component.setCompletionMessage(null);
        this.component.setGroupCompletionMessage(groupName, null);
        
        // 设置卡片列表
        this.component.setCards(cards);
        this.component.setCurrentIndex(0);
        this.component.setCardFlipped(false);
        this.component.saveState();
        
        // 输出调试信息
        console.log('设置卡片列表后的状态:', {
            cards: this.component.getCards().length,
            currentIndex: this.component.getCurrentIndex(),
            isFlipped: this.component.isCardFlipped(),
            completionMessage: this.component.getCompletionMessage(),
            groupCompletionMessage: this.component.getGroupCompletionMessage(groupName)
        });
        
        // 处理完成，返回
        return;
    }
    
    /**
     * 设置键盘快捷键
     */
    public setupKeyboardShortcuts(): void {
        // 移除之前的事件监听器
        if (this.component.getBoundHandleKeyDown()) {
            document.removeEventListener('keydown', this.component.getBoundHandleKeyDown());
        }
        
        // 创建新的事件监听器
        this.component.setBoundHandleKeyDown(this.handleKeyDown.bind(this));
        
        // 添加事件监听器
        document.addEventListener('keydown', this.component.getBoundHandleKeyDown());
    }
    
    /**
     * 处理键盘事件
     * @param e 键盘事件
     */
    public handleKeyDown(e: KeyboardEvent): void {
        // 如果不是激活状态，不处理键盘事件
        if (!this.component.isComponentActive()) {
            return;
        }
        
        // 获取当前卡片
        const cards = this.component.getCards();
        const currentIndex = this.component.getCurrentIndex();
        
        if (cards.length === 0 || currentIndex >= cards.length) {
            return;
        }
        
        // 处理空格键翻转卡片
        if (e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            
            if (this.component.isCardFlipped()) {
                // 如果已经翻转，按空格键相当于评分为"Good"
                this.rateCard(3);
            } else {
                // 如果未翻转，翻转卡片
                this.flipCard();
            }
            
            return;
        }
        
        // 如果卡片已翻转，处理评分快捷键
        if (this.component.isCardFlipped()) {
            // 处理数字键 1-4 评分
            if (e.key >= '1' && e.key <= '4') {
                e.preventDefault();
                const rating = parseInt(e.key) as FSRSRating;
                this.rateCard(rating);
                return;
            }
        }
        
        // 处理左右箭头键切换卡片
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            
            if (e.key === 'ArrowRight') {
                // 下一张卡片
                this.nextCard();
            } else {
                // 上一张卡片
                let prevIndex = currentIndex - 1;
                if (prevIndex < 0) {
                    prevIndex = cards.length - 1;
                }
                
                this.component.setCurrentIndex(prevIndex);
                this.component.setCardFlipped(false);
                this.component.saveState();
                this.component.getRenderer().render();
            }
            
            return;
        }
    }
}
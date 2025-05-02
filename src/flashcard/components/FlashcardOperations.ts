import { Notice } from "obsidian";
import { FSRSRating, FlashcardState } from "../types/FSRSTypes";
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
    public flipCard() {
        this.component.setCardFlipped(!this.component.isCardFlipped());
        this.component.saveState();
        this.component.getRenderer().render();
    }
    
    /**
     * 下一张卡片
     */
    public nextCard() {
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
    public rateCard(rating: FSRSRating) {
        const cards = this.component.getCards();
        const currentIndex = this.component.getCurrentIndex();
        
        if (cards.length === 0 || currentIndex >= cards.length) {
            return;
        }
        
        const currentCard = cards[currentIndex];
        if (!currentCard) return;
        
        // 调用 FSRS 管理器进行评分
        this.component.getFsrsManager().rateCard(currentCard.id, rating);
        
        // 移除当前卡片
        cards.splice(currentIndex, 1);
        
        // 如果没有更多卡片，显示完成消息
        if (cards.length === 0) {
            // 检查当前分组
            const groupName = this.component.getCurrentGroupName();
            
            // 设置完成消息
            let completionMessage = t('You have completed all flashcards for today!');
            
            if (groupName === 'Due Cards') {
                completionMessage = t('You have completed all due cards for today!');
            } else if (groupName === 'New Cards') {
                completionMessage = t('You have completed all new cards for today!');
            } else if (groupName === 'Recent Cards') {
                completionMessage = t('You have completed all recently added cards!');
            } else if (groupName !== 'All cards') {
                // 自定义分组
                const group = this.component.getFsrsManager().getCardGroups().find((g: any) => g.id === groupName);
                if (group) {
                    completionMessage = t('You have completed All cards in group: ') + group.name;
                }
            }
            
            // 保存完成消息
            if (groupName === 'All cards') {
                this.component.setCompletionMessage(completionMessage);
            } else {
                this.component.setGroupCompletionMessage(groupName, completionMessage);
            }
            
            // 更新进度
            this.component.updateProgress();
            
            // 重新渲染
            this.component.getRenderer().render();
            
            // 显示通知
            new Notice(completionMessage);
            
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
    public refreshCardList() {
        // 获取当前分组
        const groupName = this.component.getCurrentGroupName();
        
        // 根据分组获取卡片
        let cards = [];
        
        if (groupName === 'All cards') {
            // 获取所有卡片
            const allCards = Object.values(this.component.getFsrsManager().exportData().cards);
            
            // 按照下次复习时间排序
            cards = allCards.sort((a: any, b: any) => a.nextReview - b.nextReview);
        } else if (groupName === 'Due Cards') {
            // 获取待复习卡片
            cards = this.component.getFsrsManager().getDueCards();
        } else if (groupName === 'New Cards') {
            // 获取新卡片
            cards = this.component.getFsrsManager().getNewCards();
        } else if (groupName === 'Recent Cards') {
            // 获取最近添加的卡片
            cards = this.component.getFsrsManager().getLatestCards();
        } else {
            // 获取自定义分组的卡片
            cards = this.component.getFsrsManager().getCardsByGroupId(groupName);
        }
        
        // 应用每日学习限制
        if (groupName === 'All cards' || groupName === 'Due Cards') {
            // 获取 FSRS 参数
            const params = this.component.getFsrsManager().fsrsService.getParameters();
            
            // 获取今天已学习的新卡片数量和已复习的卡片数量
            const dailyStats = this.component.getFsrsManager().exportData().dailyStats;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const todayStats = dailyStats.find((stats: any) => stats.date === today.getTime());
            const newCardsLearned = todayStats ? todayStats.newCardsLearned : 0;
            const cardsReviewed = todayStats ? todayStats.cardsReviewed : 0;
            
            // 分离新卡片和复习卡片
            const newCards = cards.filter((card: any) => card.reviews === 0);
            const reviewCards = cards.filter((card: any) => card.reviews > 0);
            
            // 应用每日新卡片限制
            const remainingNewCards = Math.max(0, params.newCardsPerDay - newCardsLearned);
            const limitedNewCards = newCards.slice(0, remainingNewCards);
            
            // 应用每日复习卡片限制
            const remainingReviews = Math.max(0, params.reviewsPerDay - cardsReviewed);
            const limitedReviewCards = reviewCards.slice(0, remainingReviews);
            
            // 合并卡片，优先显示复习卡片
            cards = [...limitedReviewCards, ...limitedNewCards];
        }
        
        // 更新卡片列表
        this.component.setCards(cards);
        
        // 检查是否有完成消息
        if (cards.length === 0) {
            if (groupName === 'All cards') {
                if (!this.component.getCompletionMessage()) {
                    this.component.setCompletionMessage(t('You have completed all flashcards for today!'));
                }
            } else {
                const groupCompletionMessage = this.component.getGroupCompletionMessage(groupName);
                if (!groupCompletionMessage) {
                    let message = t('No flashcards available in this group.');
                    
                    if (groupName === 'Due Cards') {
                        message = t('You have completed all due cards for today!');
                    } else if (groupName === 'New Cards') {
                        message = t('You have completed all new cards for today!');
                    } else if (groupName === 'Recent Cards') {
                        message = t('You have completed all recently added cards!');
                    } else {
                        // 自定义分组
                        const group = this.component.getFsrsManager().getCardGroups().find((g: any) => g.id === groupName);
                        if (group) {
                            message = t('No flashcards available in group: ') + group.name;
                        }
                    }
                    
                    this.component.setGroupCompletionMessage(groupName, message);
                }
            }
        }
        
        // 恢复进度
        const progress = this.component.getGroupProgress(groupName);
        if (progress) {
            this.component.setCurrentIndex(progress.currentIndex);
            this.component.setCardFlipped(progress.isFlipped);
        } else {
            this.component.setCurrentIndex(0);
            this.component.setCardFlipped(false);
        }
        
        // 保存状态
        this.component.saveState();
    }
    
    /**
     * 设置键盘快捷键
     */
    public setupKeyboardShortcuts() {
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
    public handleKeyDown(e: KeyboardEvent) {
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
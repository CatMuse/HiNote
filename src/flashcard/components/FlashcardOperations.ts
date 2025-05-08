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
    public flipCard() {
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
            // 处理自定义分组
            console.log(`开始获取自定义分组 ${groupName} 的卡片`);
            
            // 直接从存储中获取卡片，而不经过任何过滤
            const fsrsManager = this.component.getFsrsManager();
            const cardGroups = fsrsManager.getCardGroups();
            const group = cardGroups.find((g: any) => g.id === groupName || g.name === groupName);
            
            if (group) {
                console.log(`找到分组 ${group.name}(${group.id})，卡片ID数量: ${group.cardIds ? group.cardIds.length : 0}`);
                
                // 直接从存储中获取卡片
                if (group.cardIds && group.cardIds.length > 0) {
                    const allCards = fsrsManager.exportData().cards;
                    cards = group.cardIds
                        .map((id: string) => {
                            const card = allCards[id];
                            if (card) {
                                console.log(`找到卡片 ${id}，内容: ${card.text.substring(0, 20)}...`);
                            } else {
                                console.log(`卡片 ${id} 不存在`);
                            }
                            return card;
                        })
                        .filter((card: any) => card !== undefined);
                }
            } else {
                console.log(`分组 ${groupName} 不存在，检查所有分组:`, 
                    cardGroups.map((g: any) => ({ id: g.id, name: g.name })));
            }
            
            console.log(`自定义分组 ${groupName} 中的卡片数量: ${cards.length}`);
            
            // 对于自定义分组，始终清除完成消息并设置卡片列表，无论卡片数量是否为0
            console.log('自定义分组不应用复习状态过滤，显示所有卡片');
            
            // 清除完成消息，确保显示卡片
            this.component.setCompletionMessage(null);
            this.component.setGroupCompletionMessage(groupName, null);
            
            // 直接设置卡片列表，不应用任何过滤
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
            
            // 自定义分组处理完成，直接返回
            return;
        }
        
        // 应用每日学习限制
        // 只对系统预定义的分组应用限制，自定义分组显示所有卡片
        // 如果是自定义分组，前面已经处理过了，这里不需要再处理
        if ((groupName === 'All cards' || groupName === 'Due Cards') && cards.length > 0) {
            // 获取 FSRS 参数
            const params = this.component.getFsrsManager().fsrsService.getParameters();
            
            // 获取今天已学习的新卡片数量和已复习的卡片数量
            const dailyStats = this.component.getFsrsManager().exportData().dailyStats;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = today.getTime();
            
            // 调试日期比较问题
            console.log("当前日期时间戳:", todayTimestamp);
            console.log("学习设置:", params.newCardsPerDay, params.reviewsPerDay);
            console.log("所有日期统计:", dailyStats.map((s: DailyStats) => ({ date: s.date, newCards: s.newCardsLearned, reviewed: s.cardsReviewed })));
            
            // 使用日期字符串比较而不是时间戳，避免毫秒级别的差异
            const todayDateStr = today.toDateString();
            let todayStats = dailyStats.find((stats: any) => {
                const statsDate = new Date(stats.date);
                return statsDate.toDateString() === todayDateStr;
            });
            
            // 如果今日统计不存在，创建一个新的统计记录
            if (!todayStats) {
                todayStats = {
                    date: today.getTime(),
                    newCardsLearned: 0,
                    cardsReviewed: 0,
                    reviewCount: 0,
                    newCount: 0,
                    againCount: 0,
                    hardCount: 0,
                    goodCount: 0,
                    easyCount: 0
                };
                
                // 将新的统计数据添加到数组中
                this.component.getFsrsManager().exportData().dailyStats.push(todayStats);
                
                // 保存更新
                this.component.getFsrsManager().saveStorage();
            }
            
            console.log("今日统计:", todayStats);
            
            const newCardsLearned = todayStats.newCardsLearned;
            const cardsReviewed = todayStats.cardsReviewed;
            
            console.log("今日已学习新卡片:", newCardsLearned, "/", params.newCardsPerDay);
            console.log("今日已复习卡片:", cardsReviewed, "/", params.reviewsPerDay);
            
            // 分离新卡片和复习卡片
            const newCards = cards.filter((card: any) => card.reviews === 0);
            const reviewCards = cards.filter((card: any) => card.reviews > 0);
            
            console.log("可用新卡片数量:", newCards.length);
            console.log("可用复习卡片数量:", reviewCards.length);
            
            // 应用每日新卡片限制
            const remainingNewCards = Math.max(0, params.newCardsPerDay - newCardsLearned);
            const limitedNewCards = newCards.slice(0, remainingNewCards);
            
            // 应用每日复习卡片限制
            const remainingReviews = Math.max(0, params.reviewsPerDay - cardsReviewed);
            const limitedReviewCards = reviewCards.slice(0, remainingReviews);
            
            console.log("剩余新卡片额度:", remainingNewCards);
            console.log("剩余复习额度:", remainingReviews);
            console.log("将显示新卡片数量:", limitedNewCards.length);
            console.log("将显示复习卡片数量:", limitedReviewCards.length);
            
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
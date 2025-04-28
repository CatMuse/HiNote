import { FlashcardProgress, FlashcardState } from "../types/FSRSTypes";
import { t } from "../../i18n";

/**
 * 闪卡进度管理器，负责处理进度统计和显示
 */
export class FlashcardProgressManager {
    private component: any;
    
    constructor(component: any) {
        this.component = component;
    }
    
    /**
     * 获取分组进度
     * @returns 分组进度信息
     */
    public getGroupProgress(): FlashcardProgress {
        // 获取当前分组
        const groupName = this.component.getCurrentGroupName();
        
        // 获取卡片
        let cards: FlashcardState[] = [];
        
        if (groupName === 'All Cards') {
            // 获取所有卡片
            cards = Object.values(this.component.getFsrsManager().exportData().cards);
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
        
        // 如果是自定义分组，可能需要获取所有自定义分组的卡片
        let allCustomGroupCards: FlashcardState[] = [];
        if (groupName !== 'All Cards' && groupName !== 'Due Cards' && 
            groupName !== 'New Cards' && groupName !== 'Recent Cards') {
            
            // 获取所有自定义分组的卡片（去重）
            const getCustomGroupCards = (): FlashcardState[] => {
                const fsrsManager = this.component.getFsrsManager();
                const cardGroups = fsrsManager.getCardGroups();
                
                let customGroupCards: FlashcardState[] = [];
                const cardIds = new Set<string>();
                
                cardGroups.forEach((group: any) => {
                    const groupCards = fsrsManager.getCardsByGroupId(group.id);
                    groupCards.forEach((card: any) => {
                        if (!cardIds.has(card.id)) {
                            cardIds.add(card.id);
                            customGroupCards.push(card);
                        }
                    });
                });
                
                return customGroupCards;
            };
            
            allCustomGroupCards = getCustomGroupCards();
        }
        
        // 计算进度
        const due = cards.filter(card => this.component.getFsrsManager().fsrsService.isDue(card)).length;
        const newCards = cards.filter(card => card.reviews === 0).length;
        const learned = cards.filter(card => card.reviews > 0).length;
        
        // 计算记忆保持率
        const retention = this.calculateRetention(cards);
        
        return {
            due,
            newCards,
            learned,
            retention
        };
    }
    
    /**
     * 计算记忆保持率
     * @param cards 卡片列表
     * @returns 记忆保持率
     */
    public calculateRetention(cards: FlashcardState[]) {
        // 只考虑已学习过的卡片
        const learnedCards = cards.filter(card => card.reviews > 0);
        
        if (learnedCards.length === 0) {
            return 1; // 如果没有已学习的卡片，返回 100%
        }
        
        // 计算平均可提取性
        const totalRetrievability = learnedCards.reduce((sum, card) => sum + card.retrievability, 0);
        return totalRetrievability / learnedCards.length;
    }
    
    /**
     * 更新进度显示
     */
    public updateProgress() {
        const progressContainer = this.component.getProgressContainer();
        if (!progressContainer) return;
        
        progressContainer.empty();
        
        // 获取分组进度
        const progress = this.getGroupProgress();
        
        // 创建进度条容器
        const progressBarContainer = progressContainer.createEl('div', { cls: 'flashcard-progress-bar-container' });
        
        // 创建进度条
        const progressBar = progressBarContainer.createEl('div', { cls: 'flashcard-progress-bar' });
        
        // 计算进度百分比
        const total = progress.due + progress.newCards;
        const current = this.component.getCards().length;
        const percent = total > 0 ? Math.round(((total - current) / total) * 100) : 100;
        
        // 设置进度条宽度
        progressBar.style.width = `${percent}%`;
        
        // 创建进度文本
        const progressText = progressBarContainer.createEl('div', { cls: 'flashcard-progress-text' });
        
        // 设置进度文本
        if (total > 0) {
            progressText.textContent = `${total - current}/${total} (${percent}%)`;
        } else {
            progressText.textContent = t('No cards to review');
        }
        
        // 创建统计信息容器
        const statsContainer = progressContainer.createEl('div', { cls: 'flashcard-stats-container' });
        
        // 添加待复习数量
        const dueContainer = statsContainer.createEl('div', { cls: 'flashcard-stat-item' });
        dueContainer.createEl('div', { cls: 'flashcard-stat-label', text: t('Due') });
        dueContainer.createEl('div', { cls: 'flashcard-stat-value', text: progress.due.toString() });
        
        // 添加新卡片数量
        const newContainer = statsContainer.createEl('div', { cls: 'flashcard-stat-item' });
        newContainer.createEl('div', { cls: 'flashcard-stat-label', text: t('New') });
        newContainer.createEl('div', { cls: 'flashcard-stat-value', text: progress.newCards.toString() });
        
        // 添加已学习数量
        const learnedContainer = statsContainer.createEl('div', { cls: 'flashcard-stat-item' });
        learnedContainer.createEl('div', { cls: 'flashcard-stat-label', text: t('Learned') });
        learnedContainer.createEl('div', { cls: 'flashcard-stat-value', text: progress.learned.toString() });
        
        // 添加记忆保持率
        const retentionContainer = statsContainer.createEl('div', { cls: 'flashcard-stat-item' });
        retentionContainer.createEl('div', { cls: 'flashcard-stat-label', text: t('Retention') });
        retentionContainer.createEl('div', { 
            cls: 'flashcard-stat-value', 
            text: `${Math.round(progress.retention * 100)}%` 
        });
        
        // 如果是特定分组，添加分组信息
        if (this.component.getCurrentGroupName() !== 'All Cards' && 
            this.component.getCurrentGroupName() !== 'Due Cards' && 
            this.component.getCurrentGroupName() !== 'New Cards' && 
            this.component.getCurrentGroupName() !== 'Recent Cards') {
            
            // 获取分组信息
            const group = this.component.getFsrsManager().getCardGroups().find((g: any) => g.id === this.component.getCurrentGroupName());
            
            if (group) {
                // 添加分组名称
                const groupNameContainer = progressContainer.createEl('div', { cls: 'flashcard-group-name-container' });
                groupNameContainer.createEl('div', { cls: 'flashcard-group-name', text: group.name });
                
                // 添加分组过滤条件
                if (group.filter) {
                    groupNameContainer.createEl('div', { 
                        cls: 'flashcard-group-filter', 
                        text: t('Filter') + ': ' + group.filter 
                    });
                }
            }
        }
        
        // 添加当前卡片索引信息
        const indexContainer = progressContainer.createEl('div', { cls: 'flashcard-index-container' });
        
        // 计算当前索引
        const currentIndex = this.component.getCurrentIndex() + 1;
        const totalCards = this.component.getCards().length;
        
        // 设置索引文本
        if (totalCards > 0) {
            indexContainer.textContent = `${currentIndex}/${totalCards}`;
        } else {
            indexContainer.textContent = '0/0';
        }
    }
    
    /**
     * 保存当前状态
     */
    public saveState() {
        // 获取当前分组
        const groupName = this.component.getCurrentGroupName();
        
        // 获取 UI 状态
        const uiState = this.component.getFsrsManager().getUIState();
        
        // 更新 UI 状态
        uiState.currentGroupName = groupName;
        uiState.currentIndex = this.component.getCurrentIndex();
        uiState.isFlipped = this.component.isCardFlipped();
        
        // 更新分组完成消息
        if (this.component.getCompletionMessage()) {
            uiState.completionMessage = this.component.getCompletionMessage();
        }
        
        // 更新分组进度
        if (!uiState.groupProgress) {
            uiState.groupProgress = {};
        }
        
        uiState.groupProgress[groupName] = {
            currentIndex: this.component.getCurrentIndex(),
            isFlipped: this.component.isCardFlipped()
        };
        
        // 更新分组完成消息
        if (!uiState.groupCompletionMessages) {
            uiState.groupCompletionMessages = {};
        }
        
        if (this.component.getGroupCompletionMessage(groupName)) {
            uiState.groupCompletionMessages[groupName] = this.component.getGroupCompletionMessage(groupName);
        }
        
        // 保存 UI 状态
        this.component.getFsrsManager().updateUIState(uiState);
    }
}
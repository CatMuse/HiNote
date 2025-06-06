import { FlashcardProgress, FlashcardState } from "../types/FSRSTypes";
import { t } from "../../i18n";
import { setIcon } from "obsidian";

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
        // 获取当前分组 ID
        const groupId = this.component.getCurrentGroupId();
        
        // 获取卡片
        let cards: FlashcardState[] = [];
        
        // 获取所有分组的卡片用于统计
        const getAllGroupCards = (): FlashcardState[] => {
            const fsrsManager = this.component.getFsrsManager();
            const cardGroups = fsrsManager.getCardGroups();
            
            let allGroupCards: FlashcardState[] = [];
            const cardIds = new Set<string>();
            
            cardGroups.forEach((group: any) => {
                const groupCards = fsrsManager.getCardsByGroupId(group.id);
                groupCards.forEach((card: any) => {
                    if (!cardIds.has(card.id)) {
                        cardIds.add(card.id);
                        allGroupCards.push(card);
                    }
                });
            });
            
            return allGroupCards;
        };
        
        // 获取分组卡片
        if (groupId) {
            // 获取自定义分组的卡片
            cards = this.component.getFsrsManager().getCardsByGroupId(groupId);
        } else {
            // 如果没有选择分组，获取所有分组的卡片（去重）
            cards = getAllGroupCards();
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
        
        // 获取进度数据
        const progress = this.getGroupProgress();
        
        // 创建进度文本容器
        const progressText = progressContainer.createEl("div", { cls: "flashcard-progress-text" });
        
        // 添加分组名称
        progressText.createSpan({
            text: this.component.getCurrentGroupName() || t('Groups'),
            cls: "group-name"
        });

        // 添加分隔符
        progressText.createSpan({
            text: "|",
            cls: "separator"
        });
        
        // 添加统计信息
        const stats = [
            { label: t('Due'), value: progress.due },
            { label: t('New'), value: progress.newCards },
            { label: t('Learned'), value: progress.learned },
            { label: t('Retention'), value: `${(progress.retention * 100).toFixed(1)}%` }
        ];

        stats.forEach((stat, index) => {
            // 添加分隔符
            if (index > 0) {
                progressText.createSpan({
                    text: "|",
                    cls: "separator"
                });
            }

            const statEl = progressText.createEl("div", { cls: "stat" });
            statEl.createSpan({ text: stat.label + ": " });
            statEl.createSpan({ 
                text: stat.value.toString(),
                cls: "stat-value"
            });
            
            // 为 Retention 添加问号图标和提示
            if (stat.label === t('Retention')) {
                const helpIcon = statEl.createSpan({ cls: "help-icon" });
                setIcon(helpIcon, "help-circle");
                helpIcon.setAttribute("aria-label", 
                    t('Retention = (Total Reviews - Forget Count) / Total Reviews\n' +
                    'This metric reflects your learning effectiveness, higher means better memory retention')
                );
            }
        });
        
        // 创建进度条容器
        const progressBarContainer = progressContainer.createEl('div', { cls: 'flashcard-progress-bar-container' });
        
        // 创建进度条
        const progressBar = progressBarContainer.createEl('div', { cls: 'flashcard-progress-bar' });
        
        // 获取当前卡片列表
        
        // 计算进度百分比
        const total = progress.due + progress.newCards;
        const current = this.component.getCards().length;
        const percent = total > 0 ? Math.round(((total - current) / total) * 100) : 100;
        
        // 设置进度条宽度
        progressBar.style.width = `${percent}%`;
        
        // 如果有选择分组，添加分组信息
        if (this.component.getCurrentGroupName()) {
            
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
        
        // 获取当前分组ID
        const groupId = this.component.getCurrentGroupId();
        
        // 获取当前学习列表中的卡片数量
        const remainingCards = this.component.getCards().length;
        
        // 获取今日需要学习的卡片数量
        const fsrsManager = this.component.getFsrsManager();
        const cardsForToday = groupId ? fsrsManager.getCardsForStudy(groupId) : [];
        const totalTodayCards = cardsForToday.length;
        
        // 设置索引文本，显示当前学习的卡片序号/总数
        if (totalTodayCards > 0 || remainingCards > 0) {
            // 使用当前学习列表长度和初始学习列表长度中的较大值
            // 这样可以避免在学习过程中总数变化
            const totalToShow = Math.max(totalTodayCards, remainingCards);
            // 计算当前学习的是第几张卡片
            const currentCardNumber = totalToShow - remainingCards + 1;
            // 如果还有卡片，显示当前卡片序号/总数
            if (remainingCards > 0) {
                indexContainer.textContent = `${currentCardNumber}/${totalToShow}`;
            } else {
                // 如果没有卡片了，显示完成状态
                indexContainer.textContent = `${totalToShow}/${totalToShow}`;
            }
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
        
        // 更新分组完成消息，无论是设置还是清除
        uiState.completionMessage = this.component.getCompletionMessage();
        
        // 更新分组进度
        if (!uiState.groupProgress) {
            uiState.groupProgress = {};
        }
        
        uiState.groupProgress[groupName] = {
            currentIndex: this.component.getCurrentIndex(),
            isFlipped: this.component.isCardFlipped()
        };
        
        // 更新分组完成消息，无论是设置还是清除
        if (!uiState.groupCompletionMessages) {
            uiState.groupCompletionMessages = {};
        }
        
        // 始终更新完成消息，即使是 null
        uiState.groupCompletionMessages[groupName] = this.component.getGroupCompletionMessage(groupName);
        
        // 保存 UI 状态
        this.component.getFsrsManager().updateUIState(uiState);
    }
}
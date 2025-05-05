import { MarkdownRenderer, Component, setIcon, Notice, TFile } from "obsidian";
import { CardGroup, FlashcardProgress } from "../types/FSRSTypes";
import { t } from "../../i18n";

/**
 * 闪卡渲染器，负责所有UI渲染相关的功能
 */
export class FlashcardRenderer {
    private component: any;
    
    constructor(component: any) {
        this.component = component;
    }
    
    /**
     * 渲染激活界面
     */
    public renderActivation() {
        const container = this.component.getContainer();
        container.empty();
        container.addClass('flashcard-mode');

        const activationContainer = container.createEl('div', {
            cls: 'flashcard-activation-container'
        });

        const header = activationContainer.createEl('div', {
            cls: 'flashcard-activation-header',
            text: t('Activate HiCard')
        });

        const description = activationContainer.createEl('div', {
            cls: 'flashcard-activation-description',
            text: t('Enter your license key to activate HiCard feature.')
        });

        const inputContainer = activationContainer.createEl('div', {
            cls: 'flashcard-activation-input-container'
        });

        const input = inputContainer.createEl('input', {
            cls: 'flashcard-activation-input',
            type: 'text',
            placeholder: t('Enter license key')
        });

        const button = inputContainer.createEl('button', {
            cls: 'flashcard-activation-button',
            text: t('Activate')
        });

        button.addEventListener('click', async () => {
            const licenseKey = input.value.trim();
            if (!licenseKey) {
                new Notice(t('Please enter a license key'));
                return;
            }

            const activated = await this.component.getLicenseManager().activateLicense(licenseKey);
            if (activated) {
                new Notice(t('HiCard activated successfully!'));
                this.render();
            } else {
                new Notice(t('Invalid license key'));
            }
        });
    }
    
    /**
     * 渲染主界面
     */
    public render() {
        const container = this.component.getContainer();
        container.empty();
        container.addClass('flashcard-mode');

        // 创建进度指示器
        const progressContainer = container.createEl("div", { cls: "flashcard-progress-container" });
        this.component.setProgressContainer(progressContainer);
        
        // 创建进度文本容器
        const progressText = progressContainer.createEl("div", { cls: "flashcard-progress-text" });
        
        // 添加分组名称
        progressText.createSpan({
            text: this.component.getCurrentGroupName(),
            cls: "group-name"
        });

        // 添加分隔符
        progressText.createSpan({
            text: "|",
            cls: "separator"
        });

        // 获取统计数据
        const progress = this.component.getProgressManager().getGroupProgress();
        
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
                    t('记忆保持率 = (总复习次数 - 遗忘次数) / 总复习次数\n' +
                    '该指标反映了你的学习效果，越高说明记忆效果越好')
                );
            }
        });
        
        // 更新进度条
        this.component.updateProgress();

        // 创建主容器
        const mainContainer = container.createEl("div", { cls: "flashcard-main-container" });

        // 创建左侧边栏
        const sidebar = mainContainer.createEl("div", { cls: "flashcard-sidebar" });
        
        // 添加默认分组
        const defaultGroups = sidebar.createEl("div", { cls: "flashcard-default-groups" });
        
        const defaultGroupList = defaultGroups.createEl("div", { cls: "flashcard-group-list" });
        const allCards = this.component.getFsrsManager().getLatestCards();
        const now = Date.now();
        
        // 获取所有自定义分组的卡片
        const allCustomGroups = this.component.getFsrsManager().getCardGroups() || [];
        console.log('所有自定义分组:', allCustomGroups.map((g: any) => g.name));
        
        let customGroupCards: any[] = [];
        
        // 合并所有自定义分组的卡片
        allCustomGroups.forEach((group: any) => {
            console.log(`处理分组 ${group.name}，ID: ${group.id}，cardIds:`, group.cardIds);
            const groupCards = this.component.getFsrsManager().getCardsByGroupId(group.id);
            console.log(`分组 ${group.name} 中的卡片数量:`, groupCards.length);
            customGroupCards = [...customGroupCards, ...groupCards];
        });
        
        // 去重（如果一张卡片在多个分组中出现）
        const uniqueCustomCards = Array.from(new Map(customGroupCards.map((card: any) => 
            [card.id, card]
        )).values());
        
        console.log('所有自定义分组卡片数量（去重后）:', uniqueCustomCards.length);
        
        const defaultGroupItems = [
            { 
                name: t('All cards'), 
                icon: 'gallery-thumbnails',
                getCards: () => uniqueCustomCards
            },
            { 
                name: t('Due Today'), 
                icon: 'calendar-clock',
                getCards: () => uniqueCustomCards.filter((c: any) => c.nextReview <= now)
            },
            { 
                name: t('New Cards'), 
                icon: 'sparkle',
                getCards: () => uniqueCustomCards.filter((c: any) => c.lastReview === 0)
            },
            { 
                name: t('Learned'), 
                icon: 'check-small',
                getCards: () => uniqueCustomCards.filter((c: any) => c.lastReview > 0)
            }
        ];

        defaultGroupItems.forEach((group, index) => {
            const cards = group.getCards();
            const groupItem = defaultGroupList.createEl("div", { 
                cls: `flashcard-group-item ${group.name === this.component.getCurrentGroupName() ? 'active' : ''}` 
            });
            
            const leftSection = groupItem.createEl("div", { cls: "flashcard-group-item-left" });
            const iconSpan = leftSection.createEl("div", { cls: "flashcard-group-icon" });
            setIcon(iconSpan, group.icon);
            leftSection.createEl("span", { 
                cls: "flashcard-group-name",
                text: group.name 
            });
            
            groupItem.createEl("span", { 
                cls: "flashcard-group-count",
                text: cards.length.toString()
            });
            
            // 添加点击事件
            groupItem.addEventListener('click', () => {
                // 保存当前分组的完成状态
                this.component.setGroupCompletionMessage(
                    this.component.getCurrentGroupName(), 
                    this.component.getCompletionMessage()
                );
                
                // 保存当前分组的学习进度
                const currentProgress = {
                    currentIndex: this.component.getCurrentIndex(),
                    isFlipped: this.component.isCardFlipped()
                };
                
                // 使用分组名称作为标识符
                this.component.setCurrentGroupName(group.name);
                
                // 移除其他组的激活状态
                const allGroups = container.querySelectorAll('.flashcard-group-item');
                allGroups.forEach((g: Element) => g.classList.remove('active'));
                
                // 激活当前组
                groupItem.classList.add('active');
                
                // 恢复当前分组的完成状态
                this.component.setCompletionMessage(
                    this.component.getGroupCompletionMessage(group.name) || null
                );
                
                // 更新当前卡片列表
                this.component.refreshCardList();
                
                // 恢复当前分组的学习进度
                const savedProgress = this.component.getGroupProgress(group.name);
                if (savedProgress && !this.component.getCompletionMessage()) {
                    this.component.setCurrentIndex(savedProgress.currentIndex);
                    this.component.setCardFlipped(savedProgress.isFlipped);
                } else {
                    // 如果没有保存的进度或有完成消息，从头开始
                    this.component.setCurrentIndex(0);
                    this.component.setCardFlipped(false);
                }
                
                this.component.saveState();
                this.render();
            });
        });
        
        // 添加自定义分组
        const customGroups = sidebar.createEl("div", { cls: "flashcard-custom-groups" });
        const addButton = customGroups.createEl("div", { cls: "flashcard-add-group" });
        setIcon(addButton, 'plus');
        addButton.addEventListener('click', () => this.component.getGroupManager().showCreateGroupModal());
        
        const customGroupList = customGroups.createEl("div", { cls: "flashcard-group-list" });
        const customGroupItems = this.component.getFsrsManager().getCardGroups() || [];
        
        customGroupItems.forEach((group: any) => {
            const groupItem = customGroupList.createEl("div", { 
                cls: `flashcard-group-item ${group.name === this.component.getCurrentGroupName() ? 'active' : ''}`
            });
            
            // 标题和操作按钮行
            const header = groupItem.createEl("div", { cls: "flashcard-group-item-header" });
            
            // 左侧标题
            const title = header.createEl("div", { cls: "flashcard-group-title" });
            const iconSpan = title.createEl("span", { cls: "flashcard-group-icon" });
            setIcon(iconSpan, group.filter.startsWith('#') ? 'hash' : 'gallery-horizontal-end');
            title.createEl("span", { 
                cls: "flashcard-group-name",
                text: group.name 
            });
            
            // 操作按钮
            const actions = header.createEl("div", { cls: "flashcard-group-actions" });
            const editButton = actions.createEl("div", { cls: "flashcard-group-action" });
            setIcon(editButton, 'edit');
            editButton.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                this.component.getGroupManager().showEditGroupModal(group);
            });

            const deleteButton = actions.createEl("div", { cls: "flashcard-group-action" });
            setIcon(deleteButton, 'trash');
            deleteButton.addEventListener('click', async (e: MouseEvent) => {
                e.stopPropagation();
                if (confirm(t('确定要删除分组 "') + group.name + t('" 吗？'))) {
                    try {
                        const deleted = await this.component.getFsrsManager().deleteCardGroup(group.id);
                        if (deleted) {
                            // 如果删除的是当前分组，切换到 All cards
                            if (this.component.getCurrentGroupName() === group.name) {
                                this.component.setCurrentGroupName('All cards');
                            }
                            new Notice(t('分组删除成功'));
                            this.render();
                        } else {
                            new Notice(t('删除分组失败'));
                        }
                    } catch (error) {
                        console.error('删除分组失败:', error);
                        new Notice(t('删除分组失败'));
                    }
                }
            });
            
            // 统计数据
            const groupStats = this.component.getFsrsManager().getGroupProgress(group.id);
            if (groupStats) {
                const statsSection = groupItem.createEl("div", { cls: "flashcard-group-stats" });
                
                // Due Today
                const dueSpan = statsSection.createEl("div", { 
                    cls: "flashcard-group-stat",
                    attr: { 'data-tooltip': t('Due Today') }
                });
                const dueIcon = dueSpan.createEl("span", { cls: "flashcard-stat-icon" });
                setIcon(dueIcon, 'calendar-clock');
                dueSpan.createEl("span", { text: groupStats.due.toString() });

                // New Cards
                const newSpan = statsSection.createEl("div", { 
                    cls: "flashcard-group-stat",
                    attr: { 'data-tooltip': t('New Cards') }
                });
                const newIcon = newSpan.createEl("span", { cls: "flashcard-stat-icon" });
                setIcon(newIcon, 'sparkle');
                newSpan.createEl("span", { text: groupStats.newCards.toString() });

                // Learned
                const learnedSpan = statsSection.createEl("div", { 
                    cls: "flashcard-group-stat",
                    attr: { 'data-tooltip': t('Learned') }
                });
                const learnedIcon = learnedSpan.createEl("span", { cls: "flashcard-stat-icon" });
                setIcon(learnedIcon, 'check-small');
                learnedSpan.createEl("span", { text: groupStats.learned.toString() });
            }
            
            // 添加点击事件以显示组内卡片
            groupItem.addEventListener('click', () => {
                // 保存当前分组的完成状态
                this.component.setGroupCompletionMessage(
                    this.component.getCurrentGroupName(), 
                    this.component.getCompletionMessage()
                );
                
                // 保存当前分组的学习进度
                const currentProgress = {
                    currentIndex: this.component.getCurrentIndex(),
                    isFlipped: this.component.isCardFlipped()
                };
                
                this.component.setCurrentGroupName(group.name);
                
                // 移除其他组的激活状态
                const allGroups = container.querySelectorAll('.flashcard-group-item');
                allGroups.forEach((g: Element) => g.classList.remove('active'));
                
                // 激活当前组
                groupItem.classList.add('active');
                
                // 恢复当前分组的完成状态
                this.component.setCompletionMessage(
                    this.component.getGroupCompletionMessage(group.name) || null
                );
                
                // 更新当前卡片列表
                this.component.refreshCardList();
                
                // 恢复当前分组的学习进度
                const savedProgress = this.component.getGroupProgress(group.name);
                if (savedProgress && !this.component.getCompletionMessage()) {
                    this.component.setCurrentIndex(savedProgress.currentIndex);
                    this.component.setCardFlipped(savedProgress.isFlipped);
                } else {
                    // 如果没有保存的进度或有完成消息，从头开始
                    this.component.setCurrentIndex(0);
                    this.component.setCardFlipped(false);
                }
                
                this.component.saveState();
                this.render();
            });
        });

        // 创建右侧内容区域
        const contentArea = mainContainer.createEl("div", { cls: "flashcard-content-area" });

        // 创建闪卡容器
        const cardContainer = contentArea.createEl("div", { cls: "flashcard-container" });
        
        // 获取当前卡片
        const cards = this.component.getCards();
        const currentIndex = this.component.getCurrentIndex();
        const currentCard = cards.length > 0 && currentIndex < cards.length ? cards[currentIndex] : null;
        
        if (cards.length === 0) {
            cardContainer.createEl("div", {
                cls: "flashcard-empty", 
                text: t("No cards due for review") 
            });
            return;
        }

        // 显示完成消息（如果有）
        if (this.component.getCompletionMessage()) {
            const completionContainer = cardContainer.createEl("div", { 
                cls: "flashcard-completion-message" 
            });
            
            // 添加一个图标
            const iconEl = completionContainer.createEl("div", { cls: "completion-icon" });
            setIcon(iconEl, "check-circle");
            
            // 添加标题
            completionContainer.createEl("h3", { 
                text: t("学习完成！") 
            });
            
            // 添加消息
            completionContainer.createEl("p", { 
                text: this.component.getCompletionMessage() 
            });
            
            // 添加按钮继续学习
            const continueButton = completionContainer.createEl("button", {
                cls: "flashcard-return-button",
                text: t("继续学习")
            });
            
            continueButton.addEventListener("click", () => {
                // 清除完成消息
                this.component.setCompletionMessage(null);
                
                // 清除当前分组的完成状态
                this.component.setGroupCompletionMessage(this.component.getCurrentGroupName(), null);
                
                // 重置当前分组的每日学习统计
                const fsrsManager = this.component.getFsrsManager();
                const dailyStats = fsrsManager.exportData().dailyStats;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayDateStr = today.toDateString();
                
                const todayStatsIndex = dailyStats.findIndex((stats: any) => {
                    const statsDate = new Date(stats.date);
                    return statsDate.toDateString() === todayDateStr;
                });
                
                if (todayStatsIndex !== -1) {
                    // 重置今日学习统计
                    dailyStats[todayStatsIndex].newCardsLearned = 0;
                    dailyStats[todayStatsIndex].cardsReviewed = 0;
                    fsrsManager.saveStorage();
                }
                
                // 重新开始学习
                this.component.setCurrentIndex(0);
                this.component.setCardFlipped(false);
                this.component.saveState();
                this.render();
            });
            
            return;
        }

        // 创建卡片
        if (currentCard) {
            // 根据卡片翻转状态添加相应的类
            const cardClasses = ["flashcard"];
            if (this.component.isCardFlipped()) {
                cardClasses.push("is-flipped");
            }
            
            const card = cardContainer.createEl("div", { cls: cardClasses.join(" ") });
            
            // 检查卡片是否属于任何反转的分组
            const allGroups = this.component.getFsrsManager().getCardGroups();
            const cardGroups = allGroups.filter((group: any) => {
                const groupCards = this.component.getFsrsManager().getCardsInGroup(group);
                return groupCards.some((c: any) => c.id === currentCard?.id);
            });
            
            // 如果卡片属于任何一个反转的分组，则保持反转状态
            const isReversed = cardGroups.some((group: any) => group.isReversed);

            // 根据 isReversed 决定正反面内容
            let frontContent = isReversed ? currentCard.answer : currentCard.text;
            let backContent = isReversed ? currentCard.text : currentCard.answer;
            
            // 创建卡片正面
            const frontSide = card.createEl("div", { 
                cls: "flashcard-side flashcard-front"
            });
            const frontEl = frontSide.createEl("div", {
                cls: "flashcard-content markdown-rendered"
            });
            
            // 使用 Markdown 渲染正面内容
            this.renderMarkdownContent(frontEl, frontContent, currentCard.filePath);

            // 创建卡片背面
            const backSide = card.createEl("div", { 
                cls: "flashcard-side flashcard-back"
            });
            const backEl = backSide.createEl("div", {
                cls: "flashcard-content markdown-rendered"
            });
            
            // 使用 Markdown 渲染背面内容
            this.renderMarkdownContent(backEl, backContent, currentCard.filePath);

            // 添加卡片点击事件
            card.addEventListener("click", () => this.component.flipCard());
            
            // 创建评分按钮容器（无论是否翻转都创建）
            const ratingContainer = cardContainer.createEl("div", { cls: "flashcard-rating" });
            
            // 获取卡片预测信息
            const predictions = currentCard ? this.component.getFsrsManager().getCardPredictions(currentCard.id) : null;
            
            this.component.getRatingButtons().forEach((btn: any) => {
                const button = ratingContainer.createEl("button", {
                    cls: 'flashcard-rating-button',
                    attr: {
                        'data-rating': btn.ratingText,
                        'title': `${btn.label} (${btn.key})`
                    }
                });
                
                // 添加标签
                button.createSpan({ text: btn.label });
                
                // 添加预测的下次复习时间
                if (predictions && predictions[btn.rating]) {
                    // 使用 ts-fsrs 预测的下次复习时间
                    const nextReview = new Date(predictions[btn.rating].nextReview);
                    const now = new Date();
                    const diffDays = Math.round((nextReview.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    
                    // 添加预测信息
                    const predictionSpan = button.createSpan({ 
                        cls: 'prediction-info'
                    });
                    
                    // 只显示天数
                    predictionSpan.createSpan({ 
                        text: this.component.getUtils().formatInterval(diffDays),
                        cls: 'days' 
                    });
                } else {
                    // 如果没有预测信息，使用简单的计算方式
                    const interval = currentCard?.lastReview === 0 ? btn.stability :
                        Math.round(btn.stability * 1.5); // 简单的下次复习间隔计算
                    button.createSpan({ 
                        text: this.component.getUtils().formatInterval(interval),
                        cls: 'days' 
                    });
                }
                
                button.addEventListener("click", (e: MouseEvent) => {
                    e.stopPropagation(); // 防止点击评分按钮时触发卡片翻转
                    this.component.rateCard(btn.rating);
                });
            });
            
            if (this.component.isCardFlipped()) {
                card.classList.add('is-flipped');
            }

            // 显示进度
            cardContainer.createEl("div", { 
                cls: "flashcard-counter",
                text: `${currentIndex + 1}/${cards.length}`
            });

            // 如果有关联文件，显示文件名
            if (currentCard.filePath) {
                const sourceEl = cardContainer.createEl("div", {
                    cls: "flashcard-source"
                });
                const fileNameText = sourceEl.createEl("span", {
                    text: currentCard.filePath.split('/').pop() || ""
                });
                
                // 添加页面预览功能
                this.component.getUtils().addPagePreview(fileNameText, currentCard.filePath);
                
                // 添加跳转到文件的点击事件
                fileNameText.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    // 跳转到文件
                    const file = this.component.getApp().vault.getAbstractFileByPath(currentCard.filePath);
                    if (file && file instanceof TFile) {
                        this.component.getApp().workspace.getLeaf().openFile(file);
                    }
                });
            }
        } else {
            // 如果没有当前卡片，显示提示信息
            cardContainer.createEl("div", {
                cls: "flashcard-empty-state",
                text: t("No cards available")
            });
        }
    }
    
    /**
     * 使用 Obsidian 的 MarkdownRenderer 渲染 Markdown 内容
     * @param containerEl 容器元素
     * @param content 内容
     * @param filePath 文件路径
     */
    private async renderMarkdownContent(containerEl: HTMLElement, content: string, filePath?: string) {
        // 清空容器
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
        
        // 检查content是否为空
        if (!content) {
            console.warn('renderMarkdownContent: content is empty or undefined');
            containerEl.textContent = '';
            return;
        }
        
        // 处理 HTML 内容，将其转换为 Markdown
        let markdownContent = content;
        
        // 如果内容包含 HTML 标签，将其转换为 Markdown
        if (typeof content === 'string' && content.includes('<') && content.includes('>')) {
            markdownContent = content
                .replace(/<\/?b>/g, '**')  // Convert <b> tags to markdown bold
                .replace(/<\/?i>/g, '_')   // Convert <i> tags to markdown italic
                .replace(/<\/?u>/g, '')    // Remove underline tags
                .replace(/<\/?strong>/g, '**') // Convert <strong> tags to markdown bold
                .replace(/<\/?em>/g, '_')  // Convert <em> tags to markdown italic
                .replace(/<br\s*\/?>/g, '\n') // Convert <br> to newlines
                .replace(/<\/?p>/g, '\n')  // Convert <p> tags to newlines
                .replace(/<\/?div>/g, '\n') // Convert <div> tags to newlines
                .replace(/<span class="highlight-tag">(.*?)<\/span>/g, '$1') // Extract tag text
                .replace(/<hr>/g, '---\n') // Convert <hr> to markdown horizontal rule
                .replace(/<[^>]*>/g, '');  // Remove any remaining HTML tags
        }
        
        // 分割内容并处理每一部分
        const parts = markdownContent.split('---\n');
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;
            
            // 创建容器来放置当前部分
            const partContainer = containerEl.createEl('div', { cls: 'flashcard-paragraph markdown-rendered' });
            
            try {
                // 使用 Obsidian 的 MarkdownRenderer.render 方法渲染 Markdown
                // 使用新的 Component 实例代替 this，避免继承复杂的样式规则
                await MarkdownRenderer.render(
                    this.component.getApp(),
                    part,
                    partContainer,
                    filePath || '',
                    new Component()
                );
                
                // 添加自定义样式类以修复可能的样式问题
                const lists = partContainer.querySelectorAll('ul, ol');
                lists.forEach(list => {
                    list.addClass('flashcard-markdown-list');
                });
            } catch (error) {
                console.error('Error rendering markdown in flashcard:', error);
                
                // 如果渲染失败，回退到纯文本渲染
                partContainer.textContent = part;
            }
            
            // 添加水平分隔线（除了最后一部分）
            if (i < parts.length - 1) {
                containerEl.createEl('hr');
            }
        }
    }
}

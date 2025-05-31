import { MarkdownRenderer, Component, setIcon, Notice, TFile } from "obsidian";
import { CardGroup, FlashcardProgress, FlashcardState, FSRS_RATING } from "../types/FSRSTypes";
import { t } from "../../i18n";
import { FlashcardStatsPanel } from "./FlashcardStatsPanel";

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
        
        // 更新进度显示（这将由 FlashcardProgress.ts 中的 updateProgress 方法处理）
        this.component.updateProgress();

        // 创建主容器
        const mainContainer = container.createEl("div", { cls: "flashcard-main-container" });

        // 创建左侧边栏
        const sidebar = mainContainer.createEl("div", { cls: "flashcard-sidebar" });
        
        // 添加统计面板
        const statsContainer = sidebar.createEl("div", { cls: "flashcard-stats-container" });
        const statsPanel = new FlashcardStatsPanel(statsContainer, this.component.getFsrsManager());
        statsPanel.render();
        
        // 添加自定义分组（现在是唯一的分组类型）
        const customGroups = sidebar.createEl("div", { cls: "flashcard-groups" });
        
        // 添加标题和操作区
        const customGroupHeader = customGroups.createEl("div", { cls: "flashcard-groups-header" });
        
        // 添加分组按钮（直接添加到header中，跳过中间层级）
        const addButton = customGroupHeader.createEl("div", { cls: "flashcard-add-group", attr: { 'aria-label': t('添加分组') } });
        
        // 直接在按钮上设置图标，简化DOM结构
        setIcon(addButton, 'plus');
        
        addButton.addEventListener('click', () => this.component.getGroupManager().showCreateGroupModal());
        
        const customGroupList = customGroups.createEl("div", { cls: "flashcard-group-list" });
        const groupItems = this.component.getFsrsManager().getCardGroups() || [];
        
        groupItems.forEach((group: any) => {
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
            
            // 编辑按钮
            const editButton = actions.createEl("div", { 
                cls: "flashcard-group-action", 
                attr: { 'aria-label': t('编辑分组') } 
            });
            setIcon(editButton, 'edit');
            editButton.addEventListener('click', (e: MouseEvent) => {
                e.stopPropagation();
                this.component.getGroupManager().showEditGroupModal(group);
            });

            // 删除按钮
            const deleteButton = actions.createEl("div", { 
                cls: "flashcard-group-action", 
                attr: { 'aria-label': t('删除分组') } 
            });
            setIcon(deleteButton, 'trash');
            deleteButton.addEventListener('click', async (e: MouseEvent) => {
                e.stopPropagation();
                if (confirm(t('确定要删除分组 "') + group.name + t('" 吗？'))) {
                    try {
                        const deleted = await this.component.getFsrsManager().deleteCardGroup(group.id);
                        if (deleted) {
                            // 如果删除的是当前分组，切换到另一个分组（如果有）
                            if (this.component.getCurrentGroupName() === group.name) {
                                const remainingGroups = this.component.getFsrsManager().getCardGroups() || [];
                                if (remainingGroups.length > 0) {
                                    // 切换到第一个可用的分组
                                    this.component.setCurrentGroupName(remainingGroups[0].name);
                                } else {
                                    // 如果没有分组了，设置一个空名称
                                    this.component.setCurrentGroupName('');
                                }
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
        
        // 不再使用全局完成消息，只使用分组完成消息

        // 先检查是否有组完成消息
        const groupName = this.component.getCurrentGroupName();
        const groupCompletionMessage = this.component.getGroupCompletionMessage(groupName);
        
        // 检查是否还有分组
        const hasGroups = this.component.getFsrsManager().getCardGroups().length > 0;
        
        // 如果没有分组或者卡片数组为空，显示完成消息或默认提示
        if (!hasGroups || cards.length === 0) {
            // 如果有分组完成消息，显示完成消息
            if (groupCompletionMessage) {
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
                    text: groupCompletionMessage 
                });
            } else {
                // 如果没有完成消息，显示默认提示
                cardContainer.createEl("div", {
                    cls: "flashcard-empty", 
                    text: t("No cards due for review")
                });
            }
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
                // 确保始终使用 FSRS 算法的预测结果
                if (predictions && predictions[btn.rating]) {
                    // 使用 ts-fsrs 预测的下次复习时间
                    const nextReview = new Date(predictions[btn.rating].nextReview);
                    const now = new Date();
                    const diffMs = nextReview.getTime() - now.getTime();
                    
                    // 添加预测信息
                    const predictionSpan = button.createSpan({ 
                        cls: 'prediction-info'
                    });
                    
                    // 根据时间差显示不同的单位
                    let formattedInterval = '';
                    
                    if (diffMs < 60 * 60 * 1000) { // 小于1小时
                        // 显示分钟
                        const diffMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));
                        formattedInterval = `${diffMinutes}m`;
                    } else if (diffMs < 24 * 60 * 60 * 1000) { // 小于1天
                        // 显示小时
                        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
                        formattedInterval = `${diffHours}h`;
                    } else {
                        // 显示天数
                        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                        // 格式化时间间隔
                        if (diffDays < 1) {
                            const hours = Math.round(diffDays * 24);
                            formattedInterval = `${hours}h`;
                        } else if (diffDays < 30) {
                            formattedInterval = `${Math.round(diffDays)}d`;
                        } else if (diffDays < 365) {
                            formattedInterval = `${Math.round(diffDays / 30)}mo`;
                        } else {
                            formattedInterval = `${Math.round(diffDays / 365)}y`;
                        }
                    }
                    
                    predictionSpan.createSpan({ 
                        text: formattedInterval,
                        cls: 'days' 
                    });
                } else {
                    // 如果没有预测信息，生成更精确的默认间隔
                    // 使用当前卡片的状态动态计算间隔
                    let intervalHours = 0; // 默认间隔（小时）
                    
                    const isNewCard = currentCard?.reviews === 0;
                    const hasLapses = currentCard?.lapses > 0;
                    
                    switch (btn.rating) {
                        case FSRS_RATING.AGAIN:
                            // Again 应该有更短的间隔
                            intervalHours = isNewCard ? 0.25 : (hasLapses ? 0.5 : 1); // 新卡片15分钟，有遗忘史的30分钟，其他1小时
                            break;
                        case FSRS_RATING.HARD:
                            // Hard 应该有较短的间隔
                            intervalHours = isNewCard ? 24 : (hasLapses ? 36 : 48); // 新卡片1天，有遗忘史的1.5天，其他2天
                            break;
                        case FSRS_RATING.GOOD:
                            // Good 应该有中等间隔
                            intervalHours = isNewCard ? 24 * 3 : (hasLapses ? 24 * 5 : 24 * 7); // 新卡片3天，有遗忘史的5天，其他7天
                            break;
                        case FSRS_RATING.EASY:
                            // Easy 应该有较长的间隔
                            intervalHours = isNewCard ? 24 * 5 : (hasLapses ? 24 * 9 : 24 * 14); // 新卡片5天，有遗忘史的9天，其他14天
                            break;
                    }
                    
                    // 计算间隔时间（分钟、小时或天）
                    const intervalDays = intervalHours / 24;
                    let formattedInterval = '';
                    
                    if (intervalHours < 1) {
                        // 小于1小时的显示分钟
                        const intervalMinutes = Math.round(intervalHours * 60);
                        formattedInterval = `${intervalMinutes}m`; // 分钟格式
                    } else if (intervalHours < 24) {
                        // 1-24小时的显示小时
                        formattedInterval = `${Math.round(intervalHours)}h`; // 小时格式
                    } else {
                        // 大于等于24小时的显示天
                        // 格式化时间间隔
                        if (intervalDays < 1) {
                            const hours = Math.round(intervalDays * 24);
                            formattedInterval = `${hours}h`;
                        } else if (intervalDays < 30) {
                            formattedInterval = `${Math.round(intervalDays)}d`;
                        } else if (intervalDays < 365) {
                            formattedInterval = `${Math.round(intervalDays / 30)}mo`;
                        } else {
                            formattedInterval = `${Math.round(intervalDays / 365)}y`;
                        }
                    }
                    
                    button.createSpan({ 
                        text: formattedInterval,
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
            // 获取当前分组ID
            const groupId = this.component.getCurrentGroupId();
            
            // 获取当前学习列表中的卡片数量
            const remainingCards = cards.length;
            
            // 获取今日需要学习的卡片数量
            const fsrsManager = this.component.getFsrsManager();
            const cardsForToday = groupId ? fsrsManager.getCardsForStudy(groupId) : [];
            const totalTodayCards = cardsForToday.length;
            
            // 使用当前学习列表长度和初始学习列表长度中的较大值
            // 这样可以避免在学习过程中总数变化
            const totalToShow = Math.max(totalTodayCards, remainingCards);
            
            // 计算当前学习的是第几张卡片
            const currentCardNumber = totalToShow - remainingCards + 1;
            
            cardContainer.createEl("div", { 
                cls: "flashcard-counter",
                text: `${currentCardNumber}/${totalToShow}`
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
            containerEl.textContent = '请添加答案';
            return;
        }
        
        // 判断当前渲染的是卡片正面还是背面
        const isCardFront = containerEl.closest('.flashcard-front') !== null;
        
        // 处理挖空符号 {{}}
        let markdownContent = content;
        if (isCardFront) {
            // 在卡片正面，将 {{}} 内的内容替换为长度相应的下划线
            markdownContent = content.replace(/\{\{([^{}]+)\}\}/g, (match, p1) => {
                // 计算原文本的长度，中文字符算三个单位，英文字符算一个单位
                const originalLength = p1.split('').reduce((acc: number, char: string) => {
                    // 判断是否是中文字符
                    const isChinese = /[\u4e00-\u9fa5]/.test(char);
                    return acc + (isChinese ? 3 : 1);
                }, 0);
                
                // 对于较长的文本，进一步增加长度
                let adjustedLength = originalLength;
                if (p1.length > 5) {
                    adjustedLength = Math.floor(adjustedLength * 1.2); // 增加 20% 的长度
                }
                
                // 生成相应长度的下划线，最少 8 个下划线
                const underscores = '_'.repeat(Math.max(8, adjustedLength));
                return underscores;
            });
        } else {
            // 在卡片背面，去除 {{}} 符号，保留内容
            markdownContent = content.replace(/\{\{([^{}]+)\}\}/g, '$1');
        }
        
        try {
            // 使用 Obsidian 的 MarkdownRenderer.render 方法渲染 Markdown
            await MarkdownRenderer.render(
                this.component.getApp(),
                markdownContent,
                containerEl,
                filePath || '',
                new Component()
            );
            
            // 添加自定义样式类以修复可能的样式问题
            const lists = containerEl.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.addClass('flashcard-markdown-list');
            });
            
            // 如果是卡片正面，添加挂空样式
            if (isCardFront) {
                const blanks = containerEl.querySelectorAll('p');
                blanks.forEach(p => {
                    if (p.textContent && p.textContent.includes('______')) {
                        p.addClass('flashcard-cloze');
                    }
                });
            }
        } catch (error) {
            console.error('Error rendering markdown in flashcard:', error);
            
            // 如果渲染失败，回退到纯文本渲染
            containerEl.textContent = markdownContent;
        }
    }
}

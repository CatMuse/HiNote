import { Notice, setIcon, TFile, MarkdownRenderer, Component } from "obsidian";
import { HiNote } from "../../CommentStore";
import { LicenseManager } from "../../services/LicenseManager";
import { FSRSManager } from "../../services/FSRSManager";
import { 
    FlashcardState, 
    FSRS_RATING, 
    FSRSRating, 
    CardGroup,
    FlashcardProgress
} from "../../types/FSRSTypes";
import { t } from "../../i18n";

export class FlashcardComponent extends Component {
    private progressContainer: HTMLElement | null = null;
    private container: HTMLElement;
    private currentIndex: number = 0;
    private isFlipped: boolean = false;
    private cards: FlashcardState[] = [];
    private isActive: boolean = false;
    private licenseManager: LicenseManager;
    private fsrsManager: FSRSManager;
    private currentCard: FlashcardState | null = null;
    private currentGroupName: string = 'All Cards';
    private app: any;
    private boundHandleKeyDown: (e: KeyboardEvent) => void;
    private completionMessage: string | null = null;
    // 存储每个分组的完成状态
    private groupCompletionMessages: Record<string, string | null> = {};
    // 存储每个分组的学习进度
    private groupProgress: Record<string, { currentIndex: number, isFlipped: boolean }> = {};

    // 评分按钮配置
    private readonly ratingButtons = [
        { label: t('Again'), rating: FSRS_RATING.AGAIN, key: '1', ratingText: 'again', stability: 0.1 },
        { label: t('Hard'), rating: FSRS_RATING.HARD, key: '2', ratingText: 'hard', stability: 0.5 },
        { label: t('Good'), rating: FSRS_RATING.GOOD, key: '3', ratingText: 'good', stability: 2 },
        { label: t('Easy'), rating: FSRS_RATING.EASY, key: '4', ratingText: 'easy', stability: 4 }
    ];

    private formatInterval(days: number): string {
        if (days < 1) {
            const hours = Math.round(days * 24);
            return `${hours}h`;
        } else if (days < 30) {
            return `${Math.round(days)}d`;
        } else if (days < 365) {
            return `${Math.round(days / 30)}mo`;
        } else {
            return `${Math.round(days / 365)}y`;
        }
    }

    constructor(container: HTMLElement, plugin: any) {
        super();
        this.container = container;
        this.fsrsManager = plugin.fsrsManager;
        this.app = plugin.app;
        
        // 添加键盘快捷键
        this.setupKeyboardShortcuts();

        // 加载保存的状态
        const savedState = this.fsrsManager.getUIState();
        this.currentGroupName = savedState.currentGroupName;
        this.currentIndex = savedState.currentIndex;
        this.isFlipped = savedState.isFlipped;
        this.completionMessage = savedState.completionMessage || null;
        this.groupCompletionMessages = savedState.groupCompletionMessages || {};
        this.groupProgress = savedState.groupProgress || {};
    }

    setLicenseManager(licenseManager: LicenseManager) {
        this.licenseManager = licenseManager;
    }

    setCards(highlights: HiNote[]) {
        // --- 新增：自动同步删除已被移除的高亮/批注对应的闪卡 ---
        // 1. 按文件分组 highlights
        const highlightsByFile: Record<string, HiNote[]> = {};
        for (const h of highlights) {
            if (!h.filePath) continue;
            if (!highlightsByFile[h.filePath]) highlightsByFile[h.filePath] = [];
            highlightsByFile[h.filePath].push(h);
        }
        // 2. 对每个文件，找出所有实际应存在的卡片内容
        for (const filePath in highlightsByFile) {
            const fileHighlights = highlightsByFile[filePath];
            const validPairs = new Set(
                fileHighlights.filter(h=>h.comments?.length)
                    .map(h => h.text + '||' + h.comments.map(c => c.content).join('<hr>'))
            );
            // 3. 获取当前文件所有闪卡
            const allCards = this.fsrsManager.getCardsByFile(filePath);
            for (const card of allCards) {
                const key = card.text + '||' + card.answer;
                if (!validPairs.has(key)) {
                    this.fsrsManager.deleteCardsByContent(filePath, card.text, card.answer);
                }
            }
        }
        // --- 新增结束 ---

        // 为每个高亮创建或更新闪卡
        for (const highlight of highlights) {
            let isCloze = false;
            let clozeText = highlight.text;
            let clozeAnswer = '';
            // 检查是否为挖空格式：{{内容}}
            const clozeMatch = highlight.text.match(/\{\{([^{}]+)\}\}/);
            if (clozeMatch) {
                isCloze = true;
                clozeAnswer = clozeMatch[1];
                // 正面隐藏内容，动态下划线长度
                clozeText = highlight.text.replace(/\{\{([^{}]+)\}\}/g, (match, p1) => '＿'.repeat(p1.length));
            }

            // 修正逻辑：只要有批注 或 有挖空格式（即使 comments 为空数组），都识别为闪卡
            if ((highlight.comments && highlight.comments.length > 0) || isCloze) {
                // 合并所有评论作为答案
                let answer = highlight.comments?.length ? highlight.comments.map(c => c.content).join('<hr>') : '';
                // 挖空格式优先，若有则拼接答案
                if (isCloze) {
                    answer = answer ? (answer + '<hr>' + clozeAnswer) : clozeAnswer;
                }
                // 检查是否已存在相同内容的卡片
                if (highlight.filePath) {
                    const existingCards = this.fsrsManager.getCardsByFile(highlight.filePath)
                        .filter(card => card.text === clozeText);
                    if (existingCards.length === 0) {
                        // 创建新卡片
                        this.fsrsManager.addCard(clozeText, answer, highlight.filePath);
                    } else {
                        // 更新现有卡片
                        this.fsrsManager.updateCardContent(clozeText, answer, highlight.filePath);
                    }
                }
            }
        }

        // 获取当前分组的卡片
        if (this.currentGroupName === 'All Cards') {
            this.cards = this.fsrsManager.getLatestCards();
        } else if (this.currentGroupName === 'Due Today') {
            this.cards = this.fsrsManager.getDueCards();
        } else if (this.currentGroupName === 'New Cards') {
            this.cards = this.fsrsManager.getLatestCards().filter(c => c.lastReview === 0);
        } else if (this.currentGroupName === 'Learned') {
            this.cards = this.fsrsManager.getLatestCards().filter(c => c.lastReview > 0);
        } else {
            // 自定义分组
            const group = this.fsrsManager.getCardGroups().find(g => g.name === this.currentGroupName);
            if (group) {
                
                this.cards = this.fsrsManager.getCardsInGroup(group);
            } else {
                this.cards = this.fsrsManager.getLatestCards();
            }
        }

        this.currentIndex = 0;
        this.isFlipped = false;
        this.currentCard = this.cards[0] || null;
        
        // 只有在激活状态下才渲染
        if (this.isActive) {
            this.activate();
        }
    }

    cleanup() {
        // 移除事件监听器
        document.removeEventListener('keydown', this.boundHandleKeyDown);
        this.deactivate();
    }

    async activate() {
        // 检查许可证
        if (!this.licenseManager) {

            return;
        }

        const isActivated = await this.licenseManager.isActivated();
        this.isActive = true;
        
        if (!isActivated) {
            this.renderActivation();
        } else {
            this.render();
        }
    }

    private renderActivation() {
        this.container.empty();
        this.container.addClass('flashcard-mode');

        const activationContainer = this.container.createEl('div', {
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

            const activated = await this.licenseManager.activateLicense(licenseKey);
            if (activated) {
                new Notice(t('HiCard activated successfully!'));
                this.render();
            } else {
                new Notice(t('Invalid license key'));
            }
        });
    }

    deactivate() {
        // 保存状态
        this.saveState();
        this.isActive = false;
        this.container.empty();
        this.container.removeClass('flashcard-mode');
        // 移除所有可能的 flashcard 相关类
        this.container.removeClass('flashcard-container');
        this.container.removeClass('is-flipped');
        // 确保移除所有子元素
        const cardContainer = this.container.querySelector('.flashcard-container');
        if (cardContainer) {
            cardContainer.remove();
        }
    }

    private showGroupModal(group?: CardGroup) {
        const modal = document.createElement('div');
        modal.className = 'flashcard-modal';
        
        // 阻止模态框中的事件冒泡
        modal.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });
        
        const modalContent = document.createElement('div');
        modalContent.className = 'flashcard-modal-content';
        
        const title = document.createElement('h3');
        title.textContent = group ? t('Edit Group') : t('Create New Group');
        modalContent.appendChild(title);
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = t('Group Name');
        nameInput.className = 'flashcard-modal-input';
        if (group) nameInput.value = group.name;
        modalContent.appendChild(nameInput);
        
        const filterInput = document.createElement('textarea');
        filterInput.placeholder = t('支持以下格式：\n- 文件夹：folder1, folder1/folder2\n- 笔记：[[note1]], [[note2]]\n- 标签：#tag1, #tag2\n- 通配符：*.excalidraw.md\n- 内容：直接输入要搜索的文本');
        filterInput.className = 'flashcard-modal-input';
        filterInput.rows = 3;
        if (group) filterInput.value = group.filter;
        modalContent.appendChild(filterInput);

        // 添加反转卡片选项
        const reverseContainer = document.createElement('div');
        reverseContainer.className = 'flashcard-modal-option';

        const reverseCheckbox = document.createElement('input');
        reverseCheckbox.type = 'checkbox';
        reverseCheckbox.className = 'flashcard-modal-checkbox';
        reverseCheckbox.checked = group?.isReversed || false;
        reverseContainer.appendChild(reverseCheckbox);

        const reverseLabel = document.createElement('label');
        reverseLabel.textContent = t('反转卡片（使用评论作为问题）');
        reverseLabel.className = 'flashcard-modal-label';
        reverseContainer.appendChild(reverseLabel);

        modalContent.appendChild(reverseContainer);
        
        // 添加学习设置选项
        const settingsContainer = document.createElement('div');
        settingsContainer.className = 'flashcard-modal-settings';
        
        // 添加标题和全局设置选项在同一行
        const settingsHeader = document.createElement('div');
        settingsHeader.className = 'flashcard-modal-settings-header';
        
        // 添加标题
        const settingsTitle = document.createElement('h4');
        settingsTitle.textContent = t('Learning settings');
        settingsTitle.className = 'settings-title';
        settingsHeader.appendChild(settingsTitle);
        
        // 添加使用全局设置选项
        const useGlobalContainer = document.createElement('div');
        useGlobalContainer.className = 'flashcard-modal-option use-global-option';
        
        const useGlobalCheckbox = document.createElement('input');
        useGlobalCheckbox.type = 'checkbox';
        useGlobalCheckbox.className = 'flashcard-modal-checkbox';
        useGlobalCheckbox.id = 'use-global-settings';
        useGlobalCheckbox.checked = group?.settings?.useGlobalSettings !== false; // 默认使用全局设置
        useGlobalContainer.appendChild(useGlobalCheckbox);
        
        const useGlobalLabel = document.createElement('label');
        useGlobalLabel.textContent = t('Use global settings');
        useGlobalLabel.className = 'flashcard-modal-label';
        useGlobalLabel.htmlFor = 'use-global-settings';
        useGlobalContainer.appendChild(useGlobalLabel);
        
        settingsHeader.appendChild(useGlobalContainer);
        settingsContainer.appendChild(settingsHeader);
        
        // 添加每日新卡片数量设置
        const newCardsContainer = document.createElement('div');
        newCardsContainer.className = 'flashcard-modal-option slider-option';
        
        const newCardsLabel = document.createElement('label');
        newCardsLabel.textContent = t('New cards per day:');
        newCardsLabel.className = 'flashcard-modal-label';
        newCardsContainer.appendChild(newCardsLabel);
        
        const newCardsSliderContainer = document.createElement('div');
        newCardsSliderContainer.className = 'slider-with-value';
        
        const newCardsSlider = document.createElement('input');
        newCardsSlider.type = 'range';
        newCardsSlider.min = '5';
        newCardsSlider.max = '100';
        newCardsSlider.step = '5';
        newCardsSlider.className = 'flashcard-modal-slider';
        newCardsSlider.value = group?.settings?.newCardsPerDay?.toString() || '20';
        // 确保值是5的倍数
        const newCardsValue = parseInt(newCardsSlider.value);
        if (newCardsValue < 5) {
            newCardsSlider.value = '5';
        } else if (newCardsValue % 5 !== 0) {
            newCardsSlider.value = (Math.round(newCardsValue / 5) * 5).toString();
        }
        newCardsSliderContainer.appendChild(newCardsSlider);
        
        const newCardsValueDisplay = document.createElement('span');
        newCardsValueDisplay.className = 'slider-value';
        newCardsValueDisplay.textContent = newCardsSlider.value;
        newCardsSliderContainer.appendChild(newCardsValueDisplay);
        
        // 更新滑块值显示
        newCardsSlider.addEventListener('input', () => {
            newCardsValueDisplay.textContent = newCardsSlider.value;
        });
        
        newCardsContainer.appendChild(newCardsSliderContainer);
        settingsContainer.appendChild(newCardsContainer);
        
        // 添加每日复习数量设置
        const reviewsContainer = document.createElement('div');
        reviewsContainer.className = 'flashcard-modal-option slider-option';
        
        const reviewsLabel = document.createElement('label');
        reviewsLabel.textContent = t('Reviews per day:');
        reviewsLabel.className = 'flashcard-modal-label';
        reviewsContainer.appendChild(reviewsLabel);
        
        const reviewsSliderContainer = document.createElement('div');
        reviewsSliderContainer.className = 'slider-with-value';
        
        const reviewsSlider = document.createElement('input');
        reviewsSlider.type = 'range';
        reviewsSlider.min = '10';
        reviewsSlider.max = '300';
        reviewsSlider.step = '10';
        reviewsSlider.className = 'flashcard-modal-slider';
        reviewsSlider.value = group?.settings?.reviewsPerDay?.toString() || '100';
        // 确保值是10的倍数
        const reviewsValue = parseInt(reviewsSlider.value);
        if (reviewsValue < 10) {
            reviewsSlider.value = '10';
        } else if (reviewsValue % 10 !== 0) {
            reviewsSlider.value = (Math.round(reviewsValue / 10) * 10).toString();
        }
        reviewsSliderContainer.appendChild(reviewsSlider);
        
        const reviewsValueDisplay = document.createElement('span');
        reviewsValueDisplay.className = 'slider-value';
        reviewsValueDisplay.textContent = reviewsSlider.value;
        reviewsSliderContainer.appendChild(reviewsValueDisplay);
        
        // 更新滑块值显示
        reviewsSlider.addEventListener('input', () => {
            reviewsValueDisplay.textContent = reviewsSlider.value;
        });
        
        reviewsContainer.appendChild(reviewsSliderContainer);
        settingsContainer.appendChild(reviewsContainer);
        
        // 根据是否使用全局设置启用/禁用自定义设置
        const updateSettingsState = () => {
            const useGlobal = useGlobalCheckbox.checked;
            newCardsSlider.disabled = useGlobal;
            reviewsSlider.disabled = useGlobal;
            newCardsContainer.classList.toggle('disabled', useGlobal);
            reviewsContainer.classList.toggle('disabled', useGlobal);
        };
        
        useGlobalCheckbox.addEventListener('change', updateSettingsState);
        updateSettingsState(); // 初始化状态
        
        modalContent.appendChild(settingsContainer);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flashcard-modal-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = t('Cancel');
        cancelButton.className = 'flashcard-modal-button';
        cancelButton.onclick = () => {
            document.body.removeChild(modal);
        };
        
        const actionButton = document.createElement('button');
        actionButton.textContent = group ? t('Save') : t('Create');
        actionButton.className = 'flashcard-modal-button primary';
        actionButton.onclick = async () => {
            const name = nameInput.value.trim();
            const filter = filterInput.value.trim();
            
            if (!name || !filter) {
                new Notice(t('Please fill in all fields'));
                return;
            }
            
            try {
                actionButton.disabled = true;
                actionButton.textContent = group ? t('Saving...') : t('Creating...');
                
                // 准备学习设置
                const settings = {
                    useGlobalSettings: useGlobalCheckbox.checked,
                    newCardsPerDay: parseInt(newCardsSlider.value),
                    reviewsPerDay: parseInt(reviewsSlider.value)
                };
                
                if (group) {
                    // 编辑现有组
                    const updated = await this.fsrsManager.updateCardGroup(group.id, {
                        name,
                        filter,
                        isReversed: reverseCheckbox.checked,
                        settings
                    });
                    
                    if (updated) {
                        // 如果当前分组是正在编辑的分组，更新名称
                        if (this.currentGroupName === group.name) {
                            this.currentGroupName = name;
                        }
                        
                        document.body.removeChild(modal);
                        this.render();
                        new Notice(t('Group updated successfully'));
                    } else {
                        new Notice(t('Failed to update group'));
                    }
                } else {
                    // 创建新组
                    const newGroup = await this.fsrsManager.createCardGroup({
                        name,
                        filter,
                        sortOrder: this.fsrsManager.getCardGroups().length,
                        createdTime: Date.now(),
                        isReversed: reverseCheckbox.checked,
                        settings
                    });
                    
                    // 设置当前分组
                    this.currentGroupName = name;
                    
                    document.body.removeChild(modal);
                    this.render();
                    new Notice(t('Group created successfully'));
                }
            } catch (error) {

                new Notice(t('Failed to create or update group'));
            } finally {
                actionButton.disabled = false;
                actionButton.textContent = group ? t('Save') : t('Create');
            }
        };
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(actionButton);
        modalContent.appendChild(buttonContainer);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // 聚焦到名称输入框
        nameInput.focus();
    }

    private showCreateGroupModal() {
        this.showGroupModal();
    }

    private showEditGroupModal(group: CardGroup) {
        this.showGroupModal(group);
    }

    private renderGroupStats(container: HTMLElement, groupId?: string) {
        const stats = groupId 
            ? this.fsrsManager.getGroupProgress(groupId)
            : this.fsrsManager.getProgress();
        
        if (!stats) return;

        const statsContainer = container.createEl('div', {
            cls: 'flashcard-stats-container'
        });

        // Due Today
        const dueContainer = statsContainer.createEl('div', {
            cls: 'flashcard-stat-item'
        });
        dueContainer.createEl('span', {
            cls: 'flashcard-stat-label',
            text: t('Due Today')
        });
        dueContainer.createEl('span', {
            cls: 'flashcard-stat-value',
            text: stats.due.toString()
        });

        // New Cards
        const newContainer = statsContainer.createEl('div', {
            cls: 'flashcard-stat-item'
        });
        newContainer.createEl('span', {
            cls: 'flashcard-stat-label',
            text: t('New Cards')
        });
        newContainer.createEl('span', {
            cls: 'flashcard-stat-value',
            text: stats.newCards.toString()
        });

        // Learned
        const learnedContainer = statsContainer.createEl('div', {
            cls: 'flashcard-stat-item'
        });
        learnedContainer.createEl('span', {
            cls: 'flashcard-stat-label',
            text: t('Learned')
        });
        learnedContainer.createEl('span', {
            cls: 'flashcard-stat-value',
            text: stats.learned.toString()
        });
    }

    private render() {
        if (!this.isActive) {
            this.deactivate();
            return;
        }
        
        this.container.empty();
        this.container.addClass('flashcard-mode');

        // 创建进度指示器
        this.progressContainer = this.container.createEl("div", { cls: "flashcard-progress-container" });
        
        // 创建进度文本容器
        const progressText = this.progressContainer.createEl("div", { cls: "flashcard-progress-text" });
        
        // 添加分组名称
        progressText.createSpan({
            text: this.currentGroupName,
            cls: "group-name"
        });

        // 添加分隔符
        progressText.createSpan({
            text: "|",
            cls: "separator"
        });

        // 获取统计数据
        const progress = this.getGroupProgress();
        
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
        
        // // 添加每日学习限制信息，先隐藏
        // progressText.createSpan({
        //     text: "|",
        //     cls: "separator"
        // });
        
        // const limitsEl = progressText.createEl("div", { cls: "stat" });
        // limitsEl.createEl("span", { text: t('Limits:') });
        
        // // 获取当前分组ID（如果是自定义分组）
        // const currentGroup = this.fsrsManager.getCardGroups().find(g => g.name === this.currentGroupName);
        // const currentGroupId = currentGroup?.id;
        
        // // 根据当前分组获取剩余学习限制
        // const newRemaining = this.fsrsManager.getRemainingNewCardsToday(currentGroupId);
        // const reviewRemaining = this.fsrsManager.getRemainingReviewsToday(currentGroupId);
        
        // limitsEl.createEl("span", { 
        //     text: `${newRemaining} ${t('New')}, ${reviewRemaining} ${t('Review')}`,
        //     cls: "stat-value"
        // });
        
        // 更新进度条
        this.updateProgress();

        // 创建主容器
        const mainContainer = this.container.createEl("div", { cls: "flashcard-main-container" });

        // 创建左侧边栏
        const sidebar = mainContainer.createEl("div", { cls: "flashcard-sidebar" });
        
        // 添加默认分组
        const defaultGroups = sidebar.createEl("div", { cls: "flashcard-default-groups" });
        
        const defaultGroupList = defaultGroups.createEl("div", { cls: "flashcard-group-list" });
        const allCards = this.fsrsManager.getLatestCards();
        const now = Date.now();
        
        // 获取所有自定义分组的卡片
        const allCustomGroups = this.fsrsManager.getCardGroups() || [];
        let customGroupCards: FlashcardState[] = [];
        
        // 合并所有自定义分组的卡片
        allCustomGroups.forEach(group => {
            const groupCards = this.fsrsManager.getCardsInGroup(group);
            customGroupCards = [...customGroupCards, ...groupCards];
        });
        
        // 去重（如果一张卡片在多个分组中出现）
        const uniqueCustomCards = Array.from(new Map(customGroupCards.map(card => 
            [card.id, card]
        )).values());
        
        const defaultGroupItems = [
            { 
                name: t('All Cards'), 
                icon: 'gallery-thumbnails',
                getCards: () => uniqueCustomCards
            },
            { 
                name: t('Due Today'), 
                icon: 'calendar-clock',
                getCards: () => uniqueCustomCards.filter(c => c.nextReview <= now)
            },
            { 
                name: t('New Cards'), 
                icon: 'sparkle',
                getCards: () => uniqueCustomCards.filter(c => c.lastReview === 0)
            },
            { 
                name: t('Learned'), 
                icon: 'check-small',
                getCards: () => uniqueCustomCards.filter(c => c.lastReview > 0)
            }
        ];

        defaultGroupItems.forEach((group, index) => {
            const cards = group.getCards();
            const groupItem = defaultGroupList.createEl("div", { 
                cls: `flashcard-group-item ${group.name === this.currentGroupName ? 'active' : ''}` 
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
                this.groupCompletionMessages[this.currentGroupName] = this.completionMessage;
                
                // 保存当前分组的学习进度
                this.groupProgress[this.currentGroupName] = {
                    currentIndex: this.currentIndex,
                    isFlipped: this.isFlipped
                };
                
                this.currentGroupName = group.name;
                
                // 移除其他组的激活状态
                const allGroups = this.container.querySelectorAll('.flashcard-group-item');
                allGroups.forEach(g => g.classList.remove('active'));
                
                // 激活当前组
                groupItem.classList.add('active');
                
                // 恢复当前分组的完成状态
                this.completionMessage = this.groupCompletionMessages[group.name] || null;
                
                // 更新当前卡片列表
                this.cards = cards;
                
                // 恢复当前分组的学习进度
                if (this.groupProgress[group.name] && !this.completionMessage) {
                    this.currentIndex = this.groupProgress[group.name].currentIndex;
                    this.isFlipped = this.groupProgress[group.name].isFlipped;
                } else {
                    // 如果没有保存的进度或有完成消息，从头开始
                    this.currentIndex = 0;
                    this.isFlipped = false;
                }
                
                this.currentCard = this.cards[this.currentIndex] || null;
                this.saveState();
                this.render();
            });
        });
        
        // 添加自定义分组
        const customGroups = sidebar.createEl("div", { cls: "flashcard-custom-groups" });
        const addButton = customGroups.createEl("div", { cls: "flashcard-add-group" });
        setIcon(addButton, 'plus');
        addButton.addEventListener('click', () => this.showCreateGroupModal());
        
        const customGroupList = customGroups.createEl("div", { cls: "flashcard-group-list" });
        const customGroupItems = this.fsrsManager.getCardGroups() || [];
        
        customGroupItems.forEach(group => {
            const groupItem = customGroupList.createEl("div", { 
                cls: `flashcard-group-item ${group.name === this.currentGroupName ? 'active' : ''}`
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
            editButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditGroupModal(group);
            });

            const deleteButton = actions.createEl("div", { cls: "flashcard-group-action" });
            setIcon(deleteButton, 'trash');
            deleteButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (confirm(t('确定要删除分组 "') + group.name + t('" 吗？'))) {
                    try {
                        const deleted = await this.fsrsManager.deleteCardGroup(group.id);
                        if (deleted) {
                            // 如果删除的是当前分组，切换到 All Cards
                            if (this.currentGroupName === group.name) {
                                this.currentGroupName = 'All Cards';
                            }
                            new Notice(t('分组删除成功'));
                            this.render();
                        } else {
                            new Notice(t('删除分组失败'));
                        }
                    } catch (error) {

                        new Notice(t('删除分组失败'));
                    }
                }
            });
            
            // 统计数据
            const groupStats = this.fsrsManager.getGroupProgress(group.id);
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
                this.groupCompletionMessages[this.currentGroupName] = this.completionMessage;
                
                // 保存当前分组的学习进度
                this.groupProgress[this.currentGroupName] = {
                    currentIndex: this.currentIndex,
                    isFlipped: this.isFlipped
                };
                
                this.currentGroupName = group.name;
                
                // 移除其他组的激活状态
                const allGroups = this.container.querySelectorAll('.flashcard-group-item');
                allGroups.forEach(g => g.classList.remove('active'));
                
                // 激活当前组
                groupItem.classList.add('active');
                
                // 恢复当前分组的完成状态
                this.completionMessage = this.groupCompletionMessages[group.name] || null;
                
                // 更新当前卡片列表
                const groupCards = this.fsrsManager.getCardsInGroup(group);
                this.cards = groupCards;
                
                // 恢复当前分组的学习进度
                if (this.groupProgress[group.name] && !this.completionMessage) {
                    this.currentIndex = this.groupProgress[group.name].currentIndex;
                    this.isFlipped = this.groupProgress[group.name].isFlipped;
                } else {
                    // 如果没有保存的进度或有完成消息，从头开始
                    this.currentIndex = 0;
                    this.isFlipped = false;
                }
                
                this.currentCard = this.cards[this.currentIndex] || null;
                this.saveState();
                this.render();
            });
        });

        // 创建右侧内容区域
        const contentArea = mainContainer.createEl("div", { cls: "flashcard-content-area" });

        // 创建闪卡容器
        const cardContainer = contentArea.createEl("div", { cls: "flashcard-container" });
        
        if (this.cards.length === 0) {
            cardContainer.createEl("div", {
                cls: "flashcard-empty", 
                text: t("No cards due for review") 
            });
            return;
        }

        // 显示完成消息（如果有）
        if (this.completionMessage) {
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
                text: this.completionMessage 
            });
            
            // 添加按钮返回第一张卡片
            const returnButton = completionContainer.createEl("button", {
                cls: "flashcard-return-button",
                text: t("返回第一张卡片")
            });
            
            returnButton.addEventListener("click", () => {
                this.completionMessage = null;
                // 清除当前分组的完成状态
                this.groupCompletionMessages[this.currentGroupName] = null;
                // 清除当前分组的学习进度
                this.groupProgress[this.currentGroupName] = {
                    currentIndex: 0,
                    isFlipped: false
                };
                this.currentIndex = 0;
                this.currentCard = this.cards[0] || null;
                this.isFlipped = false;
                this.saveState();
                this.render();
            });
            
            return;
        }

        // 创建卡片
        if (this.currentCard) {
            const card = cardContainer.createEl("div", { cls: "flashcard" });
            
            // 检查卡片是否属于任何反转的分组
            const allGroups = this.fsrsManager.getCardGroups();
            const cardGroups = allGroups.filter(group => {
                const groupCards = this.fsrsManager.getCardsInGroup(group);
                return groupCards.some(c => c.id === this.currentCard?.id);
            });
            
            // 如果卡片属于任何一个反转的分组，则保持反转状态
            const isReversed = cardGroups.some(group => group.isReversed);

            // 根据 isReversed 决定正反面内容
            let frontContent = isReversed ? this.currentCard.answer : this.currentCard.text;
            let backContent = isReversed ? this.currentCard.text : this.currentCard.answer;
            const frontIsHTML = isReversed; // 评论内容需要作为 HTML 渲染
            
            // 过滤掉仅包含标签的评论
            const filterTagOnlyComments = (content: string): string => {
                // 将评论按 <hr> 分割
                const comments = content.split('<hr>');
                // 过滤掉仅包含标签的评论
                const filteredComments = comments.filter(comment => {
                    // 检查评论是否仅包含标签
                    const onlyContainsTags = /^(#[^\s#]+\s*)+$/.test(comment.trim());
                    return !onlyContainsTags;
                });
                // 重新组合评论
                return filteredComments.join('<hr>');
            };
            
            // 根据模式处理内容
            if (isReversed) {
                // 反转模式下，正面是评论
                frontContent = filterTagOnlyComments(frontContent);

            } else {
                // 正常模式下，背面是评论
                backContent = filterTagOnlyComments(backContent);

            }
            
            // 创建卡片正面
            const frontSide = card.createEl("div", { 
                cls: "flashcard-side flashcard-front"
            });
            const frontEl = frontSide.createEl("div", {
                cls: "flashcard-content markdown-rendered"
            });
            
            // 使用 Markdown 渲染正面内容
            this.renderMarkdownContent(frontEl, frontContent, this.currentCard.filePath);

            // 创建卡片背面
            const backSide = card.createEl("div", { 
                cls: "flashcard-side flashcard-back"
            });
            const backEl = backSide.createEl("div", {
                cls: "flashcard-content markdown-rendered"
            });
            
            // 使用 Markdown 渲染背面内容
            this.renderMarkdownContent(backEl, backContent, this.currentCard.filePath);

            // 添加卡片点击事件
            card.addEventListener("click", () => this.flipCard());
            
            // 创建评分按钮容器（无论是否翻转都创建）
            const ratingContainer = cardContainer.createEl("div", { cls: "flashcard-rating" });
            
            this.ratingButtons.forEach(btn => {
                const button = ratingContainer.createEl("button", {
                    cls: 'flashcard-rating-button',
                    attr: {
                        'data-rating': btn.ratingText,
                        'title': `${btn.label} (${btn.key})`
                    }
                });
                
                // 添加标签和预测的下次复习时间
                button.createSpan({ text: btn.label });
                const interval = this.currentCard?.lastReview === 0 ? btn.stability :
                    this.fsrsManager.fsrsService.calculateNextInterval(0.9, btn.stability);
                button.createSpan({ 
                    text: this.formatInterval(interval),
                    cls: 'days' 
                });
                button.addEventListener("click", (e) => {
                    e.stopPropagation(); // 防止点击评分按钮时触发卡片翻转
                    this.rateCard(btn.rating);
                });
            });
            
            if (this.isFlipped) {
                card.classList.add('is-flipped');
            }

            // 显示进度
            cardContainer.createEl("div", { 
                cls: "flashcard-counter",
                text: `${this.currentIndex + 1}/${this.cards.length}`
            });

            // 如果有关联文件，显示文件名
            if (this.currentCard.filePath) {
                const sourceEl = cardContainer.createEl("div", {
                    cls: "flashcard-source"
                });
                const fileNameText = sourceEl.createEl("span", {
                    text: this.currentCard.filePath.split('/').pop() || ""
                });
                
                // 添加页面预览功能
                this.addPagePreview(fileNameText, this.currentCard.filePath);
            }
        } else {
            // 如果没有当前卡片，显示提示信息
            cardContainer.createEl("div", {
                cls: "flashcard-empty-state",
                text: t("No cards available")
            });
        }
    }

    private setupKeyboardShortcuts() {
        // 创建绑定到this的事件处理函数
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this.boundHandleKeyDown);
    }

    private handleKeyDown(e: KeyboardEvent) {
        // 如果组件不活跃，不处理任何键盘事件
        if (!this.isActive) return;
        
        // 如果在输入框中，不阻止任何键盘事件
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            return;
        }
        
        // 检查事件是否发生在 flashcard 容器内或其子元素中
        const isInsideFlashcard = this.container.contains(e.target as Node) || 
                                 this.container === e.target;
        
        // 如果不在 flashcard 容器内，不处理事件
        if (!isInsideFlashcard) return;
        
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.flipCard();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (!this.isFlipped) {
                this.previousCard();
            }
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (!this.isFlipped) {
                this.nextCard();
            }
        } else if (this.isFlipped) {
            const rating = this.ratingButtons.find(btn => btn.key === e.key);
            if (rating) {
                e.preventDefault();
                this.rateCard(rating.rating);
            }
        }
    }

    private rateCard(rating: FSRSRating) {
        if (!this.currentCard) return;
        
        // 更新卡片状态
        const updatedCard = this.fsrsManager.reviewCard(this.currentCard.id, rating);
        if (updatedCard) {
            // 更新当前卡片的状态
            this.cards[this.currentIndex] = updatedCard;
            
            // 检查是否还有卡片可以学习
            let hasMoreCards = false;
            
            // 获取当前分组ID（如果是自定义分组）
            const currentGroup = this.fsrsManager.getCardGroups().find(g => g.name === this.currentGroupName);
            const currentGroupId = currentGroup?.id;
            
            // 如果是新卡片，检查是否还能学习新卡片
            if (this.currentGroupName === 'New Cards' && !this.fsrsManager.canLearnNewCardsToday()) {
                this.completionMessage = t('您今天的新卡片学习配额已用完！明天再来学习吧。');
            } 
            // 如果是到期卡片，检查是否还能复习卡片
            else if (this.currentGroupName === 'Due Today' && !this.fsrsManager.canReviewCardsToday()) {
                this.completionMessage = t('您今天的复习配额已用完！明天再来复习吧。');
            }
            // 如果是自定义分组，检查分组特定的学习限制
            else if (currentGroupId) {
                const isNewCard = updatedCard.reviews === 1; // 刚刚从新卡片变为已学习卡片
                
                if (isNewCard && !this.fsrsManager.canLearnNewCardsToday(currentGroupId)) {
                    this.completionMessage = t('您今天在 "') + this.currentGroupName + t('" 分组的新卡片学习配额已用完！明天再来学习吧。');
                } else if (!isNewCard && !this.fsrsManager.canReviewCardsToday(currentGroupId)) {
                    this.completionMessage = t('您今天在 "') + this.currentGroupName + t('" 分组的复习配额已用完！明天再来复习吧。');
                } else if (this.currentIndex < this.cards.length - 1) {
                    this.currentIndex++;
                    hasMoreCards = true;
                } else {
                    // 设置完成消息
                    this.completionMessage = t('恭喜！您已完成 "') + this.currentGroupName + t('" 中的所有卡片学习。');
                    
                    // 回到第一张卡片
                    this.currentIndex = 0;
                    hasMoreCards = this.cards.length > 0;
                }
            }
            // 如果还有卡片，继续学习
            else if (this.currentIndex < this.cards.length - 1) {
                this.currentIndex++;
                hasMoreCards = true;
            } 
            // 如果是最后一张卡片，显示完成提示
            else {
                // 设置完成消息
                this.completionMessage = t('恭喜！您已完成 "') + this.currentGroupName + t('" 中的所有卡片学习。');
                
                // 回到第一张卡片
                this.currentIndex = 0;
                hasMoreCards = this.cards.length > 0;
            }
            
            this.currentCard = hasMoreCards ? this.cards[this.currentIndex] : null;
            this.isFlipped = false;
            this.saveState();
            this.render();
            this.updateProgress();
            
            // 更新卡片列表（可能有些卡片因为每日限制而不再显示）
            if (this.currentGroupName === 'New Cards' || this.currentGroupName === 'Due Today') {
                this.refreshCardList();
            }
        }
    }
    
    /**
     * 刷新当前卡片列表，考虑每日学习限制
     */
    private refreshCardList() {
        if (this.currentGroupName === 'New Cards') {
            // 只获取新卡片
            const allCards = this.fsrsManager.getLatestCards();
            this.cards = allCards.filter(c => c.lastReview === 0);
        } else if (this.currentGroupName === 'Due Today') {
            // 只获取到期卡片
            const allCards = this.fsrsManager.getLatestCards();
            const now = Date.now();
            this.cards = allCards.filter(c => c.nextReview <= now);
        } else if (this.currentGroupName === 'All Cards') {
            // 获取所有卡片
            this.cards = this.fsrsManager.getLatestCards();
        } else if (this.currentGroupName === 'Learned') {
            // 获取已学习卡片
            const allCards = this.fsrsManager.getLatestCards();
            this.cards = allCards.filter(c => c.lastReview > 0);
        } else {
            // 获取自定义分组卡片
            const group = this.fsrsManager.getCardGroups().find(g => g.name === this.currentGroupName);
            if (group) {
                // 获取分组中的所有卡片
                let groupCards = this.fsrsManager.getCardsInGroup(group);
                
                // 如果分组有特定设置且不使用全局设置，应用分组特定的限制
                if (group.settings && !group.settings.useGlobalSettings) {
                    // 检查新卡片限制
                    const remainingNewCards = this.fsrsManager.getRemainingNewCardsToday(group.id);
                    if (remainingNewCards <= 0) {
                        // 如果今天的新卡片配额已用完，过滤掉新卡片
                        groupCards = groupCards.filter(c => c.lastReview > 0);
                    }
                    
                    // 检查复习卡片限制
                    const remainingReviews = this.fsrsManager.getRemainingReviewsToday(group.id);
                    if (remainingReviews <= 0) {
                        // 如果今天的复习配额已用完，过滤掉到期的已学习卡片
                        const now = Date.now();
                        groupCards = groupCards.filter(c => c.lastReview === 0 || c.nextReview > now);
                    }
                }
                
                this.cards = groupCards;
            }
        }
        
        // 只有在没有完成消息的情况下才重置当前卡片
        if (!this.completionMessage) {
            // 如果当前索引超出范围，重置为0
            if (this.currentIndex >= this.cards.length) {
                this.currentIndex = 0;
            }
            
            this.currentCard = this.cards[this.currentIndex] || null;
            this.isFlipped = false;
        }
        
        this.saveState();
        this.render();
    }

    private flipCard() {
        if (!this.currentCard) return;
        
        this.isFlipped = !this.isFlipped;
        const cardEl = this.container.querySelector(".flashcard");
        if (!cardEl) return;
        
        cardEl.classList.toggle("is-flipped", this.isFlipped);
        
        // 保存状态
        this.saveState();
        this.updateProgress();
    }

    private nextCard() {
        if (this.currentIndex < this.cards.length - 1) {
            this.currentIndex++;
            this.currentCard = this.cards[this.currentIndex];
            this.isFlipped = false;
            this.saveState();
            this.render();
            this.updateProgress();
        }
    }

    private saveState() {
        this.fsrsManager.updateUIState({
            currentGroupName: this.currentGroupName,
            currentIndex: this.currentIndex,
            isFlipped: this.isFlipped,
            completionMessage: this.completionMessage,
            groupCompletionMessages: this.groupCompletionMessages,
            groupProgress: this.groupProgress
        });
    }

    private getGroupProgress(): FlashcardProgress {
        // 初始化默认进度对象
        const defaultProgress: FlashcardProgress = {
            due: 0,
            newCards: 0,
            learned: 0,
            retention: 0
        };

        // 如果是默认分组，直接返回总体进度
        if (this.currentGroupName === 'All Cards') {
            return this.fsrsManager.getProgress() || defaultProgress;
        }

        // 如果是自定义分组，获取分组 ID 并返回分组进度
        const group = this.fsrsManager.getCardGroups().find(g => g.name === this.currentGroupName);
        if (group) {
            return this.fsrsManager.getGroupProgress(group.id) || defaultProgress;
        }

        // 如果是内置分组，根据分组名称计算进度
        const allCards = this.fsrsManager.getLatestCards();
        const now = Date.now();

        if (this.currentGroupName === 'Due Today') {
            const dueCards = allCards.filter(c => c.nextReview <= now);
            return {
                due: dueCards.length,
                newCards: dueCards.filter(c => c.lastReview === 0).length,
                learned: dueCards.filter(c => c.lastReview > 0).length,
                retention: this.calculateRetention(dueCards)
            };
        } else if (this.currentGroupName === 'New Cards') {
            const newCards = allCards.filter(c => c.lastReview === 0);
            return {
                due: newCards.filter(c => c.nextReview <= now).length,
                newCards: newCards.length,
                learned: 0,
                retention: 0
            };
        } else if (this.currentGroupName === 'Learned') {
            const learnedCards = allCards.filter(c => c.lastReview > 0);
            return {
                due: learnedCards.filter(c => c.nextReview <= now).length,
                newCards: 0,
                learned: learnedCards.length,
                retention: this.calculateRetention(learnedCards)
            };
        }

        // 默认返回总体进度
        return this.fsrsManager.getProgress() || defaultProgress;
    }

    private calculateRetention(cards: FlashcardState[]) {
        if (cards.length === 0) return 0;
        const reviewedCards = cards.filter(c => c.lastReview > 0);
        if (reviewedCards.length === 0) return 0;

        const totalReviews = reviewedCards.reduce((sum, card) => sum + card.reviews, 0);
        const totalLapses = reviewedCards.reduce((sum, card) => sum + card.lapses, 0);
        
        return totalReviews > 0 ? (totalReviews - totalLapses) / totalReviews : 0;
    }

    private updateProgress() {
        if (!this.progressContainer || this.cards.length === 0) return;
        
        // 更新进度条宽度和数字
        // 进度百分比应该基于已完成的卡片数量
        const completedCards = this.currentIndex;
        const progressWidth = (completedCards / this.cards.length) * 100;
        this.progressContainer.style.setProperty('--progress-width', `${progressWidth}%`);
        
        // 更新进度数字
        const progressText = this.progressContainer.querySelector('.progress-text');
        const progressString = `${this.currentIndex + 1}/${this.cards.length} | ${Math.round(progressWidth)}%`;
        
        if (progressText) {
            progressText.textContent = progressString;
        } else {
            const newProgressText = this.progressContainer.createSpan({ cls: 'progress-text' });
            newProgressText.textContent = progressString;
        }
        
        // 更新分组名称
        const groupName = this.progressContainer.querySelector('.group-name');
        if (groupName) {
            groupName.textContent = this.currentGroupName;
        }

        // 更新统计数据
        const progress = this.getGroupProgress();
        const statValues = this.progressContainer.querySelectorAll('.stat-value');
        if (statValues.length >= 4) {
            statValues[0].textContent = progress.due.toString();
            statValues[1].textContent = progress.newCards.toString();
            statValues[2].textContent = progress.learned.toString();
            statValues[3].textContent = `${(progress.retention * 100).toFixed(1)}%`;
            
            // 更新学习限制显示
            if (statValues.length >= 5) {
                // 获取当前分组ID（如果是自定义分组）
                const currentGroup = this.fsrsManager.getCardGroups().find(g => g.name === this.currentGroupName);
                const currentGroupId = currentGroup?.id;
                
                // 根据当前分组获取剩余学习限制
                const newRemaining = this.fsrsManager.getRemainingNewCardsToday(currentGroupId);
                const reviewRemaining = this.fsrsManager.getRemainingReviewsToday(currentGroupId);
                
                // 更新显示
                statValues[4].textContent = `${newRemaining} ${t('New')}, ${reviewRemaining} ${t('Review')}`;
            }
        }
    }

    private addPagePreview(element: HTMLElement, filePath: string | undefined) {
        if (!filePath) return;

        // 获取文件对象
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        let hoverTimeout: NodeJS.Timeout;

        // 添加悬停事件
        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = setTimeout(async () => {
                const target = event.target as HTMLElement;
                
                // 触发 Obsidian 的页面预览事件
                this.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300); // 300ms 的延迟显示
        });

        // 添加鼠标离开事件
        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });
    }

    private previousCard() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.currentCard = this.cards[this.currentIndex];
            this.isFlipped = false;
            this.saveState();
            this.render();
            this.updateProgress();
        }
    }

    // Helper method to safely render HTML content using DOM API
    private renderHTMLContent(containerEl: HTMLElement, htmlContent: string) {
        // Clear the container first
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
        
        // Split the content by <hr> tags to handle them separately
        const parts = htmlContent.split('<hr>');
        
        parts.forEach((part, index) => {
            if (part.trim()) {
                // For each part, create a paragraph element
                const paragraph = containerEl.createEl('div', { cls: 'flashcard-paragraph' });
                
                // Process the text content - handle basic formatting
                // This is a simplified approach that handles common HTML tags
                const text = part.trim()
                    .replace(/<\/?b>/g, '**')  // Convert <b> tags to markdown bold
                    .replace(/<\/?i>/g, '_')   // Convert <i> tags to markdown italic
                    .replace(/<\/?u>/g, '')    // Remove underline tags
                    .replace(/<\/?strong>/g, '**') // Convert <strong> tags to markdown bold
                    .replace(/<\/?em>/g, '_')  // Convert <em> tags to markdown italic
                    .replace(/<br\s*\/?>/g, '\n') // Convert <br> to newlines
                    .replace(/<\/?p>/g, '\n')  // Convert <p> tags to newlines
                    .replace(/<\/?div>/g, '\n') // Convert <div> tags to newlines
                    .replace(/<span class="highlight-tag">(.*?)<\/span>/g, '$1') // Extract tag text
                    .replace(/<[^>]*>/g, '');  // Remove any remaining HTML tags
                
                // Set the text content
                paragraph.setText(text);
            }
            
            // Add horizontal rule between parts (except after the last part)
            if (index < parts.length - 1) {
                containerEl.createEl('hr');
            }
        });
    }
    
    // 新方法：使用 Obsidian 的 MarkdownRenderer 渲染 Markdown 内容
    private async renderMarkdownContent(containerEl: HTMLElement, content: string, filePath?: string) {
        // 清空容器
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
        
        // 处理 HTML 内容，将其转换为 Markdown
        let markdownContent = content;
        
        // 如果内容包含 HTML 标签，将其转换为 Markdown
        if (content.includes('<') && content.includes('>')) {
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
                    this.app,
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

    // 清理方法
    destroy() {
        document.removeEventListener('keydown', this.boundHandleKeyDown);
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }
}

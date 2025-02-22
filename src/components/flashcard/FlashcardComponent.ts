import { Notice, setIcon, TFile } from "obsidian";
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

export class FlashcardComponent {
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
    
    // 评分按钮配置
    private readonly ratingButtons = [
        { label: 'Again', rating: FSRS_RATING.AGAIN, key: '1', ratingText: 'again', stability: 0.1 },
        { label: 'Hard', rating: FSRS_RATING.HARD, key: '2', ratingText: 'hard', stability: 0.5 },
        { label: 'Good', rating: FSRS_RATING.GOOD, key: '3', ratingText: 'good', stability: 2 },
        { label: 'Easy', rating: FSRS_RATING.EASY, key: '4', ratingText: 'easy', stability: 4 }
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
    }

    setLicenseManager(licenseManager: LicenseManager) {
        this.licenseManager = licenseManager;
    }



    setCards(highlights: HiNote[]) {
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
        this.deactivate();
    }

    async activate() {
        // 检查许可证
        if (!this.licenseManager) {
            console.error('License manager not set');
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
            text: 'Activate HiCard'
        });

        const description = activationContainer.createEl('div', {
            cls: 'flashcard-activation-description',
            text: 'Enter your license key to activate HiCard feature.'
        });

        const inputContainer = activationContainer.createEl('div', {
            cls: 'flashcard-activation-input-container'
        });

        const input = inputContainer.createEl('input', {
            cls: 'flashcard-activation-input',
            type: 'text',
            placeholder: 'Enter license key'
        });

        const button = inputContainer.createEl('button', {
            cls: 'flashcard-activation-button',
            text: 'Activate'
        });

        button.addEventListener('click', async () => {
            const licenseKey = input.value.trim();
            if (!licenseKey) {
                new Notice('Please enter a license key');
                return;
            }

            const activated = await this.licenseManager.activateLicense(licenseKey);
            if (activated) {
                new Notice('HiCard activated successfully!');
                this.render();
            } else {
                new Notice('Invalid license key');
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
        title.textContent = group ? 'Edit Group' : 'Create New Group';
        modalContent.appendChild(title);
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Group Name';
        nameInput.className = 'flashcard-modal-input';
        if (group) nameInput.value = group.name;
        modalContent.appendChild(nameInput);
        
        const filterInput = document.createElement('textarea');
        filterInput.placeholder = '支持以下格式：\n- 文件夹：folder1, folder1/folder2\n- 笔记：[[note1]], [[note2]]\n- 标签：#tag1, #tag2\n- 通配符：*.excalidraw.md\n- 内容：直接输入要搜索的文本';
        filterInput.className = 'flashcard-modal-input';
        filterInput.rows = 3;
        if (group) filterInput.value = group.filter;
        modalContent.appendChild(filterInput);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flashcard-modal-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'flashcard-modal-button';
        cancelButton.onclick = () => {
            document.body.removeChild(modal);
        };
        
        const actionButton = document.createElement('button');
        actionButton.textContent = group ? 'Save' : 'Create';
        actionButton.className = 'flashcard-modal-button primary';
        actionButton.onclick = async () => {
            const name = nameInput.value.trim();
            const filter = filterInput.value.trim();
            
            if (!name || !filter) {
                new Notice('请填写所有字段');
                return;
            }
            
            try {
                actionButton.disabled = true;
                actionButton.textContent = group ? '保存中...' : '创建中...';
                
                if (group) {
                    // 编辑现有组
                    const updated = await this.fsrsManager.updateCardGroup(group.id, {
                        name,
                        filter
                    });
                    
                    if (updated) {
                        // 如果当前分组是正在编辑的分组，更新名称
                        if (this.currentGroupName === group.name) {
                            this.currentGroupName = name;
                        }
                        
                        document.body.removeChild(modal);
                        this.render();
                        new Notice('分组更新成功');
                    } else {
                        new Notice('更新分组失败');
                    }
                } else {
                    // 创建新组
                    const newGroup = await this.fsrsManager.createCardGroup({
                        name,
                        filter,
                        sortOrder: this.fsrsManager.getCardGroups().length,
                        createdTime: Date.now()
                    });
                    
                    // 设置当前分组
                    this.currentGroupName = name;
                    
                    document.body.removeChild(modal);
                    this.render();
                    new Notice('分组创建成功');
                }
            } catch (error) {
                console.error('Failed to ' + (group ? 'update' : 'create') + ' group:', error);
                new Notice((group ? '更新' : '创建') + '分组失败');
            } finally {
                actionButton.disabled = false;
                actionButton.textContent = group ? '保存' : '创建';
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
            { label: "Due", value: progress.due },
            { label: "New", value: progress.newCards },
            { label: "Learned", value: progress.learned },
            { label: "Retention", value: `${(progress.retention * 100).toFixed(1)}%` }
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
            if (stat.label === "Retention") {
                const helpIcon = statEl.createSpan({ cls: "help-icon" });
                setIcon(helpIcon, "help-circle");
                helpIcon.setAttribute("aria-label", 
                    "记忆保持率 = (总复习次数 - 遗忘次数) / 总复习次数\n" +
                    "该指标反映了你的学习效果，越高说明记忆效果越好"
                );
            }
        });
        
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
        
        const defaultGroupItems = [
            { 
                name: "All Cards", 
                icon: 'gallery-thumbnails',
                getCards: () => allCards
            },
            { 
                name: "Due Today", 
                icon: 'calendar-clock',
                getCards: () => allCards.filter(c => c.nextReview <= now)
            },
            { 
                name: "New Cards", 
                icon: 'sparkle',
                getCards: () => allCards.filter(c => c.lastReview === 0)
            },
            { 
                name: "Learned", 
                icon: 'check-small',
                getCards: () => allCards.filter(c => c.lastReview > 0)
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
                this.currentGroupName = group.name;
                
                // 移除其他组的激活状态
                const allGroups = this.container.querySelectorAll('.flashcard-group-item');
                allGroups.forEach(g => g.classList.remove('active'));
                
                // 激活当前组
                groupItem.classList.add('active');
                
                // 更新当前卡片列表
                this.cards = cards;
                this.currentIndex = 0;
                this.currentCard = this.cards[0] || null;
                this.isFlipped = false;
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
            setIcon(iconSpan, group.filter.startsWith('#') ? 'hash' : 'file');
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
                if (confirm(`确定要删除分组 "${group.name}" 吗？`)) {
                    try {
                        const deleted = await this.fsrsManager.deleteCardGroup(group.id);
                        if (deleted) {
                            // 如果删除的是当前分组，切换到 All Cards
                            if (this.currentGroupName === group.name) {
                                this.currentGroupName = 'All Cards';
                            }
                            new Notice('分组删除成功');
                            this.render();
                        } else {
                            new Notice('删除分组失败');
                        }
                    } catch (error) {
                        console.error('Error deleting group:', error);
                        new Notice('删除分组失败');
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
                this.currentGroupName = group.name;
                
                // 移除其他组的激活状态
                const allGroups = this.container.querySelectorAll('.flashcard-group-item');
                allGroups.forEach(g => g.classList.remove('active'));
                
                // 激活当前组
                groupItem.classList.add('active');
                
                // 更新当前卡片列表
                const groupCards = this.fsrsManager.getCardsInGroup(group);
                this.cards = groupCards;
                this.currentIndex = 0;
                this.currentCard = this.cards[0] || null;
                this.isFlipped = false;
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

        // 创建卡片
        if (this.currentCard) {
            const card = cardContainer.createEl("div", { cls: "flashcard" });
            
            // 创建卡片正面
            const frontSide = card.createEl("div", { 
                cls: "flashcard-side flashcard-front"
            });
            frontSide.createEl("div", {
                cls: "flashcard-content",
                text: this.currentCard.text
            });

            // 创建卡片背面
            const backSide = card.createEl("div", { 
                cls: "flashcard-side flashcard-back"
            });
            const backContent = backSide.createEl("div", {
                cls: "flashcard-content"
            });
            backContent.innerHTML = this.currentCard.answer;

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
                text: `${this.currentIndex + 1} / ${this.cards.length}`
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
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            
            // 如果在输入框中，不阻止任何键盘事件
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.flipCard();
            } else if (this.isFlipped) {
                const rating = this.ratingButtons.find(btn => btn.key === e.key);
                if (rating) {
                    e.preventDefault();
                    this.rateCard(rating.rating);
                }
            }
        });
    }

    private rateCard(rating: FSRSRating) {
        if (!this.currentCard) return;
        
        // 更新卡片状态
        const updatedCard = this.fsrsManager.reviewCard(this.currentCard.id, rating);
        if (updatedCard) {
            // 移除当前卡片
            this.cards.splice(this.currentIndex, 1);
            
            // 如果还有卡片，继续显示
            if (this.cards.length > 0) {
                this.currentIndex = this.currentIndex % this.cards.length;
                this.currentCard = this.cards[this.currentIndex];
            } else {
                this.currentCard = null;
            }
            
            this.isFlipped = false;
            this.saveState();
            this.render();
            this.updateProgress();
        }
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
            isFlipped: this.isFlipped
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
        const progressWidth = ((this.currentIndex + 1) / this.cards.length) * 100;
        this.progressContainer.style.setProperty('--progress-width', `${progressWidth}%`);
        
        // 更新进度数字
        const progressText = this.progressContainer.querySelector('.progress-text');
        if (progressText) {
            progressText.textContent = `${this.currentIndex + 1}/${this.cards.length} ${Math.round(progressWidth)}%`;
        } else {
            const newProgressText = this.progressContainer.createSpan({ cls: 'progress-text' });
            newProgressText.textContent = `${this.currentIndex + 1}/${this.cards.length} ${Math.round(progressWidth)}%`;
        }
        
        // 更新分组名称
        const groupName = this.progressContainer.querySelector('.group-name');
        if (groupName) {
            groupName.textContent = this.currentGroupName;
        }

        // 更新统计数据
        const progress = this.getGroupProgress();
        const statValues = this.progressContainer.querySelectorAll('.stat-value');
        if (statValues.length === 4) {
            statValues[0].textContent = progress.due.toString();
            statValues[1].textContent = progress.newCards.toString();
            statValues[2].textContent = progress.learned.toString();
            statValues[3].textContent = `${(progress.retention * 100).toFixed(1)}%`;
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
            this.isFlipped = false;
            this.saveState();
            this.render();
            this.updateProgress();
        }
    }

    // 清理方法
    destroy() {
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }
}

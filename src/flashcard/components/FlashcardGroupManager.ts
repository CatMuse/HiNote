import { Modal, Setting, Notice } from "obsidian";
import { CardGroup, FlashcardState } from "../types/FSRSTypes";
import { t } from "../../i18n";

/**
 * 闪卡分组管理器，负责处理分组的创建、编辑和删除
 */
export class FlashcardGroupManager {
    private component: any;
    
    constructor(component: any) {
        this.component = component;
    }
    
    /**
     * 显示分组管理模态框
     * @param group 可选的分组，如果提供则进入编辑模式
     */
    public showGroupModal(group?: CardGroup) {
        const { app } = this.component.getApp();
        
        // 创建模态框
        const modal = new Modal(app);
        modal.titleEl.setText(t('Manage Card Groups'));
        modal.containerEl.addClass('flashcard-group-modal');
        
        // 创建分组列表容器
        const groupListContainer = modal.contentEl.createEl('div', { cls: 'flashcard-group-list' });
        
        // 获取所有分组
        const groups = this.component.getFsrsManager().getCardGroups();
        
        // 如果没有分组，显示空状态
        if (groups.length === 0) {
            const emptyState = groupListContainer.createEl('div', { cls: 'flashcard-empty-state' });
            emptyState.createEl('p', { text: t('No card groups created yet.') });
            emptyState.createEl('p', { text: t('Create a group to organize your flashcards.') });
        } else {
            // 创建分组列表
            const groupList = groupListContainer.createEl('ul', { cls: 'flashcard-group-list-items' });
            
            // 添加分组项
            groups.forEach((g: any) => {
                const groupItem = groupList.createEl('li', { cls: 'flashcard-group-item' });
                
                // 添加分组名称
                const groupName = groupItem.createEl('div', { 
                    cls: 'flashcard-group-name', 
                    text: g.name 
                });
                
                // 添加分组过滤条件
                if (g.filter) {
                    const groupFilter = groupItem.createEl('div', { 
                        cls: 'flashcard-group-filter', 
                        text: g.filter 
                    });
                }
                
                // 添加分组操作按钮
                const groupActions = groupItem.createEl('div', { cls: 'flashcard-group-actions' });
                
                // 添加编辑按钮
                const editBtn = groupActions.createEl('button', { 
                    cls: 'flashcard-edit-group-btn',
                    text: t('Edit')
                });
                
                editBtn.addEventListener('click', () => {
                    modal.close();
                    this.showEditGroupModal(g);
                });
                
                // 添加删除按钮
                const deleteBtn = groupActions.createEl('button', { 
                    cls: 'flashcard-delete-group-btn',
                    text: t('Delete')
                });
                
                deleteBtn.addEventListener('click', () => {
                    // 确认删除
                    const confirmModal = new Modal(app);
                    confirmModal.titleEl.setText(t('Delete Group'));
                    confirmModal.contentEl.createEl('p', { 
                        text: t('Are you sure you want to delete this group?') 
                    });
                    confirmModal.contentEl.createEl('p', { 
                        text: t('This will not delete the flashcards in this group.') 
                    });
                    
                    // 添加确认按钮
                    const confirmBtn = confirmModal.contentEl.createEl('button', { 
                        cls: 'flashcard-confirm-btn',
                        text: t('Delete')
                    });
                    
                    confirmBtn.addEventListener('click', async () => {
                        // 删除分组
                        const fsrsManager = this.component.getFsrsManager();
                        const storage = fsrsManager.exportData();
                        
                        // 从分组列表中移除
                        storage.cardGroups = storage.cardGroups.filter((group: any) => group.id !== g.id);
                        
                        // 保存更改
                        await fsrsManager.saveStoragePublic();
                        
                        // 如果当前选中的是这个分组，切换到"所有卡片"
                        if (this.component.getCurrentGroupName() === g.id) {
                            this.component.setCurrentGroupName('All cards');
                            this.component.refreshCardList();
                            this.component.getRenderer().render();
                        }
                        
                        // 关闭确认模态框
                        confirmModal.close();
                        
                        // 关闭分组管理模态框
                        modal.close();
                        
                        // 重新打开分组管理模态框
                        this.showGroupModal();
                        
                        // 显示通知
                        new Notice(t('Group deleted'));
                    });
                    
                    // 添加取消按钮
                    const cancelBtn = confirmModal.contentEl.createEl('button', { 
                        cls: 'flashcard-cancel-btn',
                        text: t('Cancel')
                    });
                    
                    cancelBtn.addEventListener('click', () => {
                        confirmModal.close();
                    });
                    
                    // 打开确认模态框
                    confirmModal.open();
                });
                
                // 添加同步按钮
                const syncBtn = groupActions.createEl('button', { 
                    cls: 'flashcard-sync-group-btn',
                    text: t('Sync')
                });
                
                syncBtn.addEventListener('click', async () => {
                    // 同步分组卡片
                    const count = await this.component.getFsrsManager().syncGroupCards(g.id);
                    
                    // 显示通知
                    new Notice(t('Synced ') + count + t(' cards'));
                    
                    // 如果当前选中的是这个分组，刷新卡片列表
                    if (this.component.getCurrentGroupName() === g.id) {
                        this.component.refreshCardList();
                        this.component.getRenderer().render();
                    }
                });
            });
        }
        
        // 添加创建分组按钮
        const createBtn = modal.contentEl.createEl('button', { 
            cls: 'flashcard-create-group-btn',
            text: t('Create New Group')
        });
        
        createBtn.addEventListener('click', () => {
            modal.close();
            this.showEditGroupModal();
        });
        
        // 打开模态框
        modal.open();
    }
    
    /**
     * 显示创建分组模态框
     */
    public showCreateGroupModal() {
        this.showEditGroupModal();
    }
    
    /**
     * 显示编辑分组模态框
     * @param group 要编辑的分组
     */
    public showEditGroupModal(group?: CardGroup) {
        const { app } = this.component.getApp();
        
        // 创建模态框
        const modal = new Modal(app);
        modal.titleEl.setText(group ? t('Edit Group') : t('Create Group'));
        modal.containerEl.addClass('flashcard-group-edit-modal');
        
        // 创建表单容器
        const formContainer = modal.contentEl.createEl('div', { cls: 'flashcard-group-form' });
        
        // 分组名称
        let groupName = group ? group.name : '';
        new Setting(formContainer)
            .setName(t('Group Name'))
            .setDesc(t('Enter a name for this group'))
            .addText(text => {
                text.setValue(groupName)
                    .onChange(value => {
                        groupName = value;
                    });
            });
        
        // 分组过滤条件
        let groupFilter = group ? group.filter : '';
        new Setting(formContainer)
            .setName(t('Filter'))
            .setDesc(t('Enter a filter for this group. Use file:path to filter by file path, tag:tagname to filter by tag.'))
            .addText(text => {
                text.setValue(groupFilter)
                    .setPlaceholder('file:daily-notes or tag:important')
                    .onChange(value => {
                        groupFilter = value;
                    });
            });
        
        // 是否反转卡片正反面
        let isReversed = group ? group.isReversed || false : false;
        new Setting(formContainer)
            .setName(t('Reverse Cards'))
            .setDesc(t('Show comments as questions and highlights as answers'))
            .addToggle(toggle => {
                toggle.setValue(isReversed)
                    .onChange(value => {
                        isReversed = value;
                    });
            });
        
        // 使用全局设置
        let useGlobalSettings = group ? (group.settings?.useGlobalSettings !== false) : true;
        new Setting(formContainer)
            .setName(t('Use Global Settings'))
            .setDesc(t('Use global settings for new cards per day and reviews per day'))
            .addToggle(toggle => {
                toggle.setValue(useGlobalSettings)
                    .onChange(value => {
                        useGlobalSettings = value;
                        // 更新设置状态
                        updateSettingsState();
                    });
            });
        
        // 每日新卡片数量
        let newCardsPerDay = group ? (group.settings?.newCardsPerDay || 20) : 20;
        const newCardsPerDaySetting = new Setting(formContainer)
            .setName(t('New Cards Per Day'))
            .setDesc(t('Maximum number of new cards to learn each day'))
            .addSlider(slider => {
                slider.setLimits(1, 100, 1)
                    .setValue(newCardsPerDay)
                    .setDynamicTooltip()
                    .onChange(value => {
                        newCardsPerDay = value;
                    });
                
                // 添加数值显示
                const valueDisplay = formContainer.createEl('span', {
                    cls: 'slider-value',
                    text: String(newCardsPerDay)
                });
                
                slider.sliderEl.parentElement?.appendChild(valueDisplay);
                
                slider.sliderEl.addEventListener('input', () => {
                    valueDisplay.textContent = String(slider.getValue());
                });
            });
        
        // 每日复习数量
        let reviewsPerDay = group ? (group.settings?.reviewsPerDay || 100) : 100;
        const reviewsPerDaySetting = new Setting(formContainer)
            .setName(t('Reviews Per Day'))
            .setDesc(t('Maximum number of reviews per day'))
            .addSlider(slider => {
                slider.setLimits(10, 500, 10)
                    .setValue(reviewsPerDay)
                    .setDynamicTooltip()
                    .onChange(value => {
                        reviewsPerDay = value;
                    });
                
                // 添加数值显示
                const valueDisplay = formContainer.createEl('span', {
                    cls: 'slider-value',
                    text: String(reviewsPerDay)
                });
                
                slider.sliderEl.parentElement?.appendChild(valueDisplay);
                
                slider.sliderEl.addEventListener('input', () => {
                    valueDisplay.textContent = String(slider.getValue());
                });
            });
        
        // 根据是否使用全局设置启用/禁用自定义设置
        const updateSettingsState = () => {
            if (useGlobalSettings) {
                newCardsPerDaySetting.setDisabled(true);
                reviewsPerDaySetting.setDisabled(true);
            } else {
                newCardsPerDaySetting.setDisabled(false);
                reviewsPerDaySetting.setDisabled(false);
            }
        };
        
        // 初始化设置状态
        updateSettingsState();
        
        // 添加保存按钮
        const saveBtn = modal.contentEl.createEl('button', { 
            cls: 'flashcard-save-group-btn',
            text: group ? t('Save') : t('Create')
        });
        
        saveBtn.addEventListener('click', async () => {
            // 验证输入
            if (!groupName) {
                new Notice(t('Group name cannot be empty'));
                return;
            }
            
            // 创建或更新分组
            const fsrsManager = this.component.getFsrsManager();
            
            if (group) {
                // 更新分组
                const storage = fsrsManager.exportData();
                const groupIndex = storage.cardGroups.findIndex((g: any) => g.id === group.id);
                
                if (groupIndex >= 0) {
                    storage.cardGroups[groupIndex] = {
                        ...group,
                        name: groupName,
                        filter: groupFilter,
                        isReversed,
                        settings: {
                            useGlobalSettings,
                            newCardsPerDay: useGlobalSettings ? undefined : newCardsPerDay,
                            reviewsPerDay: useGlobalSettings ? undefined : reviewsPerDay
                        },
                        lastUpdated: Date.now()
                    };
                    
                    // 保存更改
                    await fsrsManager.saveStoragePublic();
                    
                    // 如果当前选中的是这个分组，刷新卡片列表
                    if (this.component.getCurrentGroupName() === group.id) {
                        this.component.refreshCardList();
                        this.component.getRenderer().render();
                    }
                    
                    // 显示通知
                    new Notice(t('Group updated'));
                }
            } else {
                // 创建新分组
                await fsrsManager.createCardGroup({
                    name: groupName,
                    filter: groupFilter,
                    isReversed,
                    createdTime: Date.now(),
                    sortOrder: fsrsManager.getCardGroups().length,
                    settings: {
                        useGlobalSettings,
                        newCardsPerDay: useGlobalSettings ? undefined : newCardsPerDay,
                        reviewsPerDay: useGlobalSettings ? undefined : reviewsPerDay
                    }
                });
                
                // 显示通知
                new Notice(t('Group created'));
            }
            
            // 关闭模态框
            modal.close();
            
            // 如果是编辑模式，重新打开分组管理模态框
            if (group) {
                this.showGroupModal();
            }
        });
        
        // 添加取消按钮
        const cancelBtn = modal.contentEl.createEl('button', { 
            cls: 'flashcard-cancel-btn',
            text: t('Cancel')
        });
        
        cancelBtn.addEventListener('click', () => {
            modal.close();
            
            // 如果是编辑模式，重新打开分组管理模态框
            if (group) {
                this.showGroupModal();
            }
        });
        
        // 打开模态框
        modal.open();
    }
}
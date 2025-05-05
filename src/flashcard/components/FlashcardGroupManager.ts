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
                // 保存旧名称供后续使用
                const oldName = group.name;
                console.log(`分组名称更新: ${oldName} -> ${groupName}`);
                
                try {
                    // 使用 FSRSManager 的 updateCardGroup 方法更新分组
                    await fsrsManager.updateCardGroup(group.id, {
                        name: groupName,
                        filter: groupFilter,
                        isReversed,
                        settings: {
                            useGlobalSettings,
                            newCardsPerDay: useGlobalSettings ? undefined : newCardsPerDay,
                            reviewsPerDay: useGlobalSettings ? undefined : reviewsPerDay
                        },
                        lastUpdated: Date.now()
                    });
                    
                    // 获取存储对象
                    const storage = fsrsManager.exportData();
                    
                    // 更新 UI 状态中的分组完成消息和学习进度
                    if (storage.uiState) {
                        // 更新分组完成消息
                        if (storage.uiState.groupCompletionMessages && storage.uiState.groupCompletionMessages[oldName] !== undefined) {
                            storage.uiState.groupCompletionMessages[groupName] = storage.uiState.groupCompletionMessages[oldName];
                            delete storage.uiState.groupCompletionMessages[oldName];
                        }
                        
                        // 更新分组学习进度
                        if (storage.uiState.groupProgress && storage.uiState.groupProgress[oldName]) {
                            storage.uiState.groupProgress[groupName] = storage.uiState.groupProgress[oldName];
                            delete storage.uiState.groupProgress[oldName];
                        }
                        
                        // 如果当前选中的是这个分组，更新当前分组名称
                        if (storage.uiState.currentGroupName === oldName) {
                            storage.uiState.currentGroupName = groupName;
                        }
                        
                        // 保存 UI 状态更改
                        await fsrsManager.saveStoragePublic();
                    }
                    
                    // 如果当前选中的是这个分组，更新当前分组名称
                    if (this.component.getCurrentGroupName() === oldName) {
                        this.component.setCurrentGroupName(groupName);
                    }
                    
                    // 刷新界面
                    this.component.refreshCardList();
                    this.component.getRenderer().render();
                    
                    // 显示通知
                    new Notice(t('分组更新成功'));
                } catch (error) {
                    console.error('更新分组失败:', error);
                    new Notice(t('更新分组失败'));
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
                this.component.getRenderer().render();
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
                this.component.getRenderer().render();
            }
        });
        
        // 打开模态框
        modal.open();
    }
}
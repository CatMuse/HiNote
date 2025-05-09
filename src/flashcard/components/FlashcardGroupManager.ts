import { Modal, Setting, Notice, setIcon } from "obsidian";
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
        
        // 创建模态框容器
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'flashcard-modal-overlay';
        document.body.appendChild(modalOverlay);
        
        // 创建模态框
        const modalContainer = document.createElement('div');
        modalContainer.className = 'flashcard-modal-container';
        modalOverlay.appendChild(modalContainer);
        
        // 创建模态框内容
        const modalContent = document.createElement('div');
        modalContent.className = 'flashcard-modal-content';
        modalContainer.appendChild(modalContent);
        
        // 添加标题
        const modalHeader = document.createElement('div');
        modalHeader.className = 'flashcard-modal-header';
        modalContent.appendChild(modalHeader);
        
        const modalTitle = document.createElement('h3');
        modalTitle.textContent = group ? t('Edit group') : t('Create group');
        modalHeader.appendChild(modalTitle);
        
        // 创建表单容器
        const formContainer = document.createElement('div');
        formContainer.className = 'flashcard-group-form';
        modalContent.appendChild(formContainer);
        
        // 分组名称
        let groupName = group ? group.name : '';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'flashcard-modal-input';
        nameInput.placeholder = t('Enter name');
        nameInput.value = groupName;
        formContainer.appendChild(nameInput);
        nameInput.addEventListener('input', (e) => {
            groupName = (e.target as HTMLInputElement).value;
        });

        
        // 分组过滤条件 - 支持文件路径和笔记链接
        let groupFilter = group ? group.filter : '';
        const filterTextarea = document.createElement('textarea');
        filterTextarea.className = 'flashcard-modal-input';
        filterTextarea.placeholder = t('Support format: \nFolder: folder1, folder1/folder2\nNote: [[note1]], [[note2]]');
        filterTextarea.value = groupFilter;
        formContainer.appendChild(filterTextarea);
        filterTextarea.addEventListener('input', (e) => {
            groupFilter = (e.target as HTMLTextAreaElement).value;
        });
        
        // 是否反转卡片正反面
        let isReversed = group ? group.isReversed || false : false;
        const reverseContainer = document.createElement('div');
        reverseContainer.className = 'flashcard-modal-option';
        formContainer.appendChild(reverseContainer);
        
        const reverseCheckbox = document.createElement('input');
        reverseCheckbox.type = 'checkbox';
        reverseCheckbox.className = 'flashcard-modal-checkbox';
        reverseCheckbox.checked = isReversed;
        reverseContainer.appendChild(reverseCheckbox);
        
        const reverseLabel = document.createElement('label');
        reverseLabel.textContent = t('Reverse cards (use comments as questions)');
        reverseLabel.className = 'flashcard-modal-label';
        reverseContainer.appendChild(reverseLabel);
        
        reverseCheckbox.addEventListener('change', (e) => {
            isReversed = (e.target as HTMLInputElement).checked;
        });
        
        // 学习设置部分
        const settingsContainer = document.createElement('div');
        settingsContainer.className = 'flashcard-modal-settings';
        formContainer.appendChild(settingsContainer);
        
        // 添加标题和全局设置选项在同一行
        const settingsHeader = document.createElement('div');
        settingsHeader.className = 'flashcard-modal-settings-header';
        settingsContainer.appendChild(settingsHeader);
        
        // 添加标题和全局设置选项在同一行
        const settingsTitle = document.createElement('h4');
        settingsTitle.textContent = t('Learning settings');
        settingsTitle.className = 'settings-title';
        settingsHeader.appendChild(settingsTitle);
        
        // 使用全局设置
        let useGlobalSettings = group ? (group.settings?.useGlobalSettings !== false) : true;
        const globalSettingsContainer = document.createElement('div');
        globalSettingsContainer.className = 'flashcard-modal-option use-global-option';
        settingsHeader.appendChild(globalSettingsContainer);
        
        const globalCheckbox = document.createElement('input');
        globalCheckbox.type = 'checkbox';
        globalCheckbox.className = 'flashcard-modal-checkbox';
        globalCheckbox.id = 'use-global-settings';
        globalCheckbox.checked = useGlobalSettings;
        globalSettingsContainer.appendChild(globalCheckbox);
        
        const globalLabel = document.createElement('label');
        globalLabel.textContent = t('Use global settings');
        globalLabel.className = 'flashcard-modal-label';
        globalLabel.htmlFor = 'use-global-settings';
        globalSettingsContainer.appendChild(globalLabel);
        
        globalCheckbox.addEventListener('change', (e) => {
            useGlobalSettings = (e.target as HTMLInputElement).checked;
            // 更新设置状态
            updateSettingsState();
        });
        
        // 每日新卡片数量
        let newCardsPerDay = group ? (group.settings?.newCardsPerDay || 20) : 20;
        
        const newCardsContainer = document.createElement('div');
        newCardsContainer.className = 'flashcard-modal-option slider-option';
        settingsContainer.appendChild(newCardsContainer);
        
        const newCardsLabel = document.createElement('label');
        newCardsLabel.textContent = t('New cards per day: ');
        newCardsLabel.className = 'flashcard-modal-label';
        newCardsContainer.appendChild(newCardsLabel);
        
        const newCardsSliderContainer = document.createElement('div');
        newCardsSliderContainer.className = 'slider-with-value';
        newCardsContainer.appendChild(newCardsSliderContainer);
        
        const newCardsSlider = document.createElement('input');
        newCardsSlider.className = 'flashcard-modal-slider';
        newCardsSlider.type = 'range';
        newCardsSlider.min = '5';
        newCardsSlider.max = '100';
        newCardsSlider.step = '5';
        newCardsSlider.value = String(newCardsPerDay);
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
            newCardsPerDay = parseInt(newCardsSlider.value);
            newCardsValueDisplay.textContent = newCardsSlider.value;
        });
        
        const newCardsPerDaySetting = { setDisabled: (disabled: boolean) => {
            newCardsSlider.disabled = disabled;
            newCardsContainer.classList.toggle('disabled', disabled);
        }};
        
        // 每日复习数量
        let reviewsPerDay = group ? (group.settings?.reviewsPerDay || 100) : 100;
        
        const reviewsContainer = document.createElement('div');
        reviewsContainer.className = 'flashcard-modal-option slider-option';
        settingsContainer.appendChild(reviewsContainer);
        
        const reviewsLabel = document.createElement('label');
        reviewsLabel.textContent = t('Reviews per day: ');
        reviewsLabel.className = 'flashcard-modal-label';
        reviewsContainer.appendChild(reviewsLabel);
        
        const reviewsSliderContainer = document.createElement('div');
        reviewsSliderContainer.className = 'slider-with-value';
        reviewsContainer.appendChild(reviewsSliderContainer);
        
        const reviewsSlider = document.createElement('input');
        reviewsSlider.className = 'flashcard-modal-slider';
        reviewsSlider.type = 'range';
        reviewsSlider.min = '10';
        reviewsSlider.max = '500';
        reviewsSlider.step = '10';
        reviewsSlider.value = String(reviewsPerDay);
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
            reviewsPerDay = parseInt(reviewsSlider.value);
            reviewsValueDisplay.textContent = reviewsSlider.value;
        });
        
        const reviewsPerDaySetting = { setDisabled: (disabled: boolean) => {
            reviewsSlider.disabled = disabled;
            reviewsContainer.classList.toggle('disabled', disabled);
        }};
        
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
        
        // 按钮容器
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        modalContent.appendChild(buttonContainer);
        
        // 添加取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'flashcard-cancel-btn';
        cancelBtn.textContent = t('Cancel');
        buttonContainer.appendChild(cancelBtn);
        
        // 添加保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.className = 'flashcard-save-group-btn';
        saveBtn.textContent = group ? t('Save') : t('Create');
        buttonContainer.appendChild(saveBtn);
        
        // 添加保存按钮事件
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
                    new Notice(t('Group update successful'));
                } catch (error) {
                    console.error('Update group failed:', error);
                    new Notice(t('Update group failed'));
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
                
                // 创建新分组后刷新界面
                this.component.refreshCardList();
                this.component.getRenderer().render();
            }
            
            // 关闭模态框
            document.body.removeChild(modalOverlay);
            
            // 如果是编辑模式，重新打开分组管理模态框
            if (group) {
                this.component.getRenderer().render();
            }
        });
        
        // 添加ESC键关闭模态框
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modalOverlay);
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        // 添加取消按钮事件
        cancelBtn.addEventListener('click', () => {
            // 关闭模态框
            document.body.removeChild(modalOverlay);
            
            // 如果是编辑模式，重新打开分组管理模态框
            if (group) {
                this.component.getRenderer().render();
            }
        });
    }
}
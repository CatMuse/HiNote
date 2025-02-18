import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings } from './AIServiceSettings';
import { t } from '../../i18n';

import { DeepseekModel, DeepseekModelState, DEFAULT_DEEPSEEK_MODELS } from '../../types';

export class DeepseekSettings extends BaseAIServiceSettings {
    private modelState: DeepseekModelState;
    private modelSelectEl: HTMLSelectElement | null = null;
    private customModelContainer: HTMLDivElement | null = null;

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeModelState();
    }

    private initializeModelState(): DeepseekModelState {
        // 确保 deepseek 设置对象存在
        if (!this.plugin.settings.ai.deepseek) {
            this.plugin.settings.ai.deepseek = {
                apiKey: '',
                model: DEFAULT_DEEPSEEK_MODELS[0].id,
                apiAddress: '',
                isCustomModel: false,
                lastCustomModel: ''
            };
        }

        const settings = this.plugin.settings.ai.deepseek;
        let selectedModel: DeepseekModel;

        // 处理模型选择
        if (settings.isCustomModel) {
            // 如果之前是自定义模型，直接使用保存的模型 ID
            selectedModel = {
                id: settings.model,
                name: settings.model,
                isCustom: true
            };
        } else {
            // 处理预设模型
            const savedModel = DEFAULT_DEEPSEEK_MODELS.find(m => m.id === settings.model);
            selectedModel = savedModel || DEFAULT_DEEPSEEK_MODELS[0];
            
            // 如果使用了默认模型，更新设置
            if (!savedModel) {
                settings.model = selectedModel.id;
            }
        }

        return {
            selectedModel,
            apiKey: settings.apiKey || ''
        };
    }

    private async saveModelState() {
        if (!this.plugin.settings.ai.deepseek) {
            this.plugin.settings.ai.deepseek = {};
        }
        
        const settings = this.plugin.settings.ai.deepseek;
        const model = this.modelState.selectedModel;
        
        // 更新设置
        settings.model = model.id;
        settings.isCustomModel = !!model.isCustom;
        settings.apiKey = this.modelState.apiKey || '';
        settings.apiAddress = settings.apiAddress || '';
        
        // 如果是自定义模型，更新 lastCustomModel
        if (model.isCustom && model.id) {
            settings.lastCustomModel = model.id;
        }
        
        // 立即保存设置
        await this.plugin.saveSettings();

        console.log('Saved model state:', {
            modelId: model.id,
            modelName: model.name,
            isCustom: settings.isCustomModel,
            lastCustomModel: settings.lastCustomModel
        });
    }

    private async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const defaultUrl = 'https://api.deepseek.com';
            const customUrl = this.plugin.settings.ai.deepseek?.apiAddress;
            const baseUrl = customUrl && customUrl.trim() ? customUrl : defaultUrl;
            
            // 使用当前选择的模型来验证
            const modelId = this.modelState.selectedModel.id;
            const url = `${baseUrl}/models/${modelId}`;
            
            console.log('Validating API key with URL:', url);
            console.log('Using model:', modelId);
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                // 如果是自定义模型，直接返回 false
                if (this.modelState.selectedModel.isCustom) {
                    new Notice(t('自定义模型不可用，请检查模型 ID 和 API 地址'));
                    return false;
                }
                
                // 如果是预设模型但不是 deepseek-chat，先检查 API Key 是否有效
                if (modelId !== 'deepseek-chat') {
                    console.log('Checking if API key is valid with deepseek-chat...');
                    const checkUrl = `${baseUrl}/models/deepseek-chat`;
                    const checkResponse = await fetch(checkUrl, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (checkResponse.ok) {
                        // API Key 有效，但当前选择的模型不可用
                        new Notice(t('当前选择的模型不可用，但 API Key 是有效的'));
                        return false;
                    }
                }
                
                // 其他情况，API Key 无效
                new Notice(t('Failed to validate API Key. Please check your key and try again.'));
                return false;
            }
            
            const data = await response.json();
            const isValid = !!(data && data.id);
            
            if (isValid) {
                new Notice(t('API Key 和当前模型都可用！'));
            }
            
            return isValid;
        } catch (error) {
            console.error('Error validating API key:', error);
            new Notice(t('Failed to validate API Key. Please check your key and try again.'));
            return false;
        }
    }
    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        settingsContainer.createEl('h4', { text: t('Deepseek Settings') });

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your Deepseek API Key'))
            .addText(text => text
                .setPlaceholder('dsk-...')
                .setValue(this.modelState.apiKey)
                .onChange(async (value) => {
                    this.modelState.apiKey = value;
                    await this.saveModelState();
                }))
            .addButton(button => button
                .setButtonText(t('Check'))
                .onClick(async () => {
                    await this.validateApiKey(this.modelState.apiKey);
                }));

        // 模型选择设置
        const modelSetting = new Setting(settingsContainer)
            .setName(t('Model'))
            .setDesc(t('Select a model or use a custom one'))
            .addDropdown(dropdown => {
                // 添加预设模型
                DEFAULT_DEEPSEEK_MODELS.forEach(model => {
                    dropdown.addOption(model.id, model.name);
                });
                // 添加自定义模型选项
                dropdown.addOption('custom', t('Custom Model'));

                // 设置当前值
                const currentValue = this.modelState.selectedModel.isCustom ? 'custom' : this.modelState.selectedModel.id;
                dropdown.setValue(currentValue);

                this.modelSelectEl = dropdown.selectEl;
                
                dropdown.onChange(async (value) => {
                    if (value === 'custom') {
                        await this.showCustomModelInput();
                    } else {
                        const selectedModel = DEFAULT_DEEPSEEK_MODELS.find(m => m.id === value);
                        if (selectedModel) {
                            // 在切换到预设模型之前，保存当前的自定义模型
                            if (this.modelState.selectedModel.isCustom) {
                                const settings = this.plugin.settings.ai.deepseek;
                                settings.lastCustomModel = this.modelState.selectedModel.id;
                                await this.plugin.saveSettings();
                            }
                            
                            this.modelState.selectedModel = selectedModel;
                            await this.saveModelState();
                            await this.hideCustomModelInput();
                        }
                    }
                });

                return dropdown;
            });

        // 创建自定义模型输入容器
        this.customModelContainer = modelSetting.settingEl.createDiv('custom-model-container');
        this.customModelContainer.style.display = 'none';
        
        // 将自定义输入框容器移到下拉框之前
        const dropdownEl = modelSetting.settingEl.querySelector('.setting-item-control');
        if (dropdownEl) {
            (dropdownEl as HTMLElement).style.display = 'flex';
            (dropdownEl as HTMLElement).style.flexDirection = 'row';
            (dropdownEl as HTMLElement).style.alignItems = 'center';
            dropdownEl.insertBefore(this.customModelContainer, dropdownEl.firstChild);
        }

        // 如果当前是自定义模型，显示输入框
        if (this.modelState.selectedModel.isCustom) {
            this.showCustomModelInput();
        }

        // 自定义 API 地址
        new Setting(settingsContainer)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://api.deepseek.com/v1')
                .setValue(this.plugin.settings.ai.deepseek?.apiAddress || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.deepseek) {
                        this.plugin.settings.ai.deepseek = {};
                    }
                    this.plugin.settings.ai.deepseek.apiAddress = value;
                    await this.plugin.saveSettings();
                }));
    }

    private async showCustomModelInput() {
        if (!this.customModelContainer) return;
        
        this.customModelContainer.style.display = 'block';
        this.customModelContainer.empty();
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'custom-model-input';
        input.placeholder = 'model-id';
        input.value = this.modelState.selectedModel.isCustom ? this.modelState.selectedModel.id : '';
        
        input.addEventListener('input', async () => {
            const trimmedValue = input.value.trim();
            
            // 如果输入为空，不更新模型
            if (!trimmedValue) {
                return;
            }
            
            // 检查模型 ID 格式
            if (!/^[a-zA-Z0-9-_.]+$/.test(trimmedValue)) {
                new Notice(t('模型 ID 只能包含字母、数字、下划线、点和短杠'));
                input.value = this.modelState.selectedModel.id;
                return;
            }
            
            this.modelState.selectedModel = {
                id: trimmedValue,
                name: trimmedValue,
                isCustom: true
            };
            await this.saveModelState();
        });
        
        this.customModelContainer.appendChild(input);
    }

    private hideCustomModelInput() {
        if (this.customModelContainer) {
            this.customModelContainer.style.display = 'none';
            this.customModelContainer.empty();
        }
    }
}

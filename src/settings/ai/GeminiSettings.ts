import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings } from './AIServiceSettings';
import { t } from '../../i18n';
import { GeminiModel, GeminiModelState, DEFAULT_GEMINI_MODELS } from '../../types';

export class GeminiSettings extends BaseAIServiceSettings {
    private modelState: GeminiModelState;
    private modelSelectEl: HTMLSelectElement | null = null;
    private customModelContainer: HTMLDivElement | null = null;

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeModelState();
    }

    private initializeModelState(): GeminiModelState {
        // 确保 gemini 设置对象存在
        if (!this.plugin.settings.ai.gemini) {
            this.plugin.settings.ai.gemini = {
                apiKey: '',
                model: DEFAULT_GEMINI_MODELS[0].id,
                baseUrl: '',
                isCustomModel: false,
                lastCustomModel: ''
            };
        }

        const settings = this.plugin.settings.ai.gemini;
        let selectedModel: GeminiModel;

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
            const savedModel = DEFAULT_GEMINI_MODELS.find(m => m.id === settings.model);
            selectedModel = savedModel || DEFAULT_GEMINI_MODELS[0];
            
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
        if (!this.plugin.settings.ai.gemini) {
            this.plugin.settings.ai.gemini = {};
        }
        
        const settings = this.plugin.settings.ai.gemini;
        const model = this.modelState.selectedModel;
        
        // 更新设置
        settings.model = model.id;
        settings.isCustomModel = !!model.isCustom;
        settings.apiKey = this.modelState.apiKey || '';
        settings.baseUrl = settings.baseUrl || '';
        
        // 如果是自定义模型，更新 lastCustomModel
        if (model.isCustom && model.id) {
            settings.lastCustomModel = model.id;
        }
        
        // 立即保存设置
        await this.plugin.saveSettings();

    }

    private async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const defaultUrl = 'https://generativelanguage.googleapis.com';
            const customUrl = this.plugin.settings.ai.gemini?.baseUrl;
            const baseUrl = customUrl && customUrl.trim() ? customUrl : defaultUrl;
            
            // 使用当前选择的模型来验证
            const modelId = this.modelState.selectedModel.id;
            const url = `${baseUrl}/v1/models/${modelId}?key=${apiKey}`;


            const response = await fetch(url);
            if (!response.ok) {
                // 获取错误详情
                const errorData = await response.json().catch(() => null);

                // 检查是否是实验性模型
                const isExperimentalModel = modelId.includes('-exp-');
                
                // 如果是实验性模型，提供更具体的错误信息
                if (isExperimentalModel) {
                    // 先验证 API Key 是否有效
                    const checkUrl = `${baseUrl}/v1/models/gemini-pro?key=${apiKey}`;
                    const checkResponse = await fetch(checkUrl);
                    
                    if (checkResponse.ok) {
                        new Notice(t('API Key 有效，但无法访问实验性模型。请确保你有权限访问此模型，或等待模型正式发布。'));
                        throw new Error(`Experimental model not accessible: ${modelId}`);
                    } else {
                        new Notice(t('API Key 无效。请检查你的 API Key 是否正确。'));
                        throw new Error('Invalid API Key');
                    }
                }
                
                // 如果是自定义模型
                if (this.modelState.selectedModel.isCustom) {
                    new Notice(t('自定义模型不可用。请检查模型 ID 是否正确，以及你是否有权限访问此模型。'));
                    throw new Error(`Custom model not available: ${modelId}`);
                }
                
                // 如果是预设模型但不是 gemini-pro
                if (modelId !== 'gemini-pro') {
                    const checkUrl = `${baseUrl}/v1/models/gemini-pro?key=${apiKey}`;
                    const checkResponse = await fetch(checkUrl);
                    
                    if (checkResponse.ok) {
                        new Notice(t('API Key 有效，但当前选择的模型不可用。可能是模型未发布或你没有访问权限。'));
                        throw new Error(`Selected model not available: ${modelId}`);
                    }
                }
                
                // 其他情况，API Key 无效
                new Notice(t('API Key is invalid or there is a server error. Please check if your API Key is correct.'));
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            const isValid = !!(data && data.name);
            
            if (isValid) {
                new Notice(t('API Key and the current model are both available！'));
            }
            
            return isValid;
        } catch (error) {

            return false;
        }
    }
    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        // 添加标题
        new Setting(settingsContainer)
            .setName(t('Gemini Settings'))
            .setHeading();

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your Gemini API Key'))
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.modelState.apiKey)
                .onChange(async (value) => {
                    this.modelState.apiKey = value;
                    await this.saveModelState();
                }))
            .addButton(button => button
                .setButtonText(t('Check'))
                .onClick(async () => {
                    if (!this.modelState.apiKey) {
                        new Notice(t('Please enter an API Key first'));
                        return;
                    }

                    // 禁用按钮，防止重复点击
                    button.setDisabled(true);
                    button.setButtonText(t('Checking...'));
                    
                    try {
                        await this.validateApiKey(this.modelState.apiKey);
                    } finally {
                        // 恢复按钮状态
                        button.setDisabled(false);
                        button.setButtonText(t('Check'));
                    }
                }));

        // 模型选择设置
        const modelSetting = new Setting(settingsContainer)
            .setName(t('Model'))
            .setDesc(t('Select a model or use a custom one'))
            .addDropdown(dropdown => {
                // 添加预设模型选项
                DEFAULT_GEMINI_MODELS.forEach(model => {
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
                        const selectedModel = DEFAULT_GEMINI_MODELS.find(m => m.id === value);
                        if (selectedModel) {
                            // 在切换到预设模型之前，保存当前的自定义模型
                            if (this.modelState.selectedModel.isCustom) {
                                const settings = this.plugin.settings.ai.gemini;
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
        this.customModelContainer.addClass('custom-model-container');
        
        // 将自定义输入框容器移到下拉框之前
        const dropdownEl = modelSetting.settingEl.querySelector('.setting-item-control');
        if (dropdownEl) {
            (dropdownEl as HTMLElement).addClass('openai-dropdown-container');
            dropdownEl.insertBefore(this.customModelContainer, dropdownEl.firstChild);
        }

        // 添加自定义模型输入框
        const textComponent = new Setting(this.customModelContainer)
            .addText(text => text
                .setPlaceholder('model-id')
                .setValue(this.modelState.selectedModel.isCustom ? this.modelState.selectedModel.id : '')
                .onChange(async (value) => {
                    const trimmedValue = value.trim();
                    
                    // 如果输入为空，不更新模型
                    if (!trimmedValue) {
                        return;
                    }
                    
                    
                    // 检查模型 ID 格式
                    if (!/^[a-zA-Z0-9-_.]+$/.test(trimmedValue)) {
                        new Notice(t('模型 ID 只能包含字母、数字、下划线、点和短杠'));
                        text.setValue(this.modelState.selectedModel.id);
                        return;
                    }
                    
                    this.modelState.selectedModel = {
                        id: trimmedValue,
                        name: trimmedValue,
                        isCustom: true
                    };
                    await this.saveModelState();
                }));

        // 移除 Setting 组件的额外样式
        const settingItem = textComponent.settingEl;
        settingItem.addClass('openai-setting-no-border');
        const controlEl = settingItem.querySelector('.setting-item-control');
        if (controlEl) {
            (controlEl as HTMLElement).addClass('openai-setting-no-margin');
        }

        // 如果当前是自定义模型，显示输入框
        if (this.modelState.selectedModel.isCustom) {
            this.showCustomModelInput();
        }

        // Custom API Address 设置
        new Setting(settingsContainer)
            .setName(t('Custom API Address'))
            .setDesc(t('Enter your custom API endpoint'))
            .addText(text => {
                const defaultUrl = 'https://generativelanguage.googleapis.com';
                const currentValue = this.plugin.settings.ai.gemini?.baseUrl;
                
                text.setPlaceholder(defaultUrl)
                    .setValue(currentValue || '')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.gemini) {
                            this.plugin.settings.ai.gemini = {};
                        }
                        this.plugin.settings.ai.gemini.baseUrl = value || '';
                        await this.plugin.saveSettings();
                    });
                return text;
            });
    }

    private async showCustomModelInput() {
        if (this.customModelContainer && this.modelSelectEl) {
            this.customModelContainer.addClass('visible');
            this.modelSelectEl.value = 'custom';
            
            const settings = this.plugin.settings.ai.gemini;
            const currentModel = this.modelState.selectedModel;
            
            // 如果当前不是自定义模型，尝试恢复上一次的自定义模型
            if (!currentModel.isCustom) {
                const modelId = settings.lastCustomModel || '';
                
                // 更新模型状态
                this.modelState.selectedModel = {
                    id: modelId,
                    name: modelId,
                    isCustom: true
                };
                
                // 更新设置
                settings.model = modelId;
                settings.isCustomModel = true;
                await this.plugin.saveSettings();
                
                // 更新输入框
                const inputEl = this.customModelContainer.querySelector('input');
                if (inputEl) {
                    (inputEl as HTMLInputElement).value = modelId;
                }
            }
        }
    }

    private async hideCustomModelInput() {
        if (this.customModelContainer) {
            this.customModelContainer.removeClass('visible');
            
            const settings = this.plugin.settings.ai.gemini;
            const currentModel = this.modelState.selectedModel;
            
            // 如果当前是自定义模型，保存到 lastCustomModel
            if (currentModel.isCustom && currentModel.id) {
                settings.lastCustomModel = currentModel.id;
                
                // 保留输入框的值，但隐藏输入框
                const inputEl = this.customModelContainer.querySelector('input');
                if (inputEl) {
                    (inputEl as HTMLInputElement).value = currentModel.id;
                }
            }
            
            // 更新设置，标记为非自定义模型
            settings.isCustomModel = false;
            await this.plugin.saveSettings();
        }
    }
}

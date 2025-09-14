import { Setting, Notice, requestUrl } from 'obsidian';
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

            const response = await requestUrl({
                url: url,
                method: 'GET'
            });

            if (response.status === 200) {
                const data = response.json;
                if (data && data.name) {
                    new Notice(t('API Key and the current model are both available!'));
                    return true;
                }
            }

            // 如果当前模型不可用，尝试用默认模型验证 API Key
            if (modelId !== 'gemini-2.5-flash') {
                const fallbackUrl = `${baseUrl}/v1/models/gemini-2.5-flash?key=${apiKey}`;
                const fallbackResponse = await requestUrl({
                    url: fallbackUrl,
                    method: 'GET'
                });
                
                if (fallbackResponse.status === 200) {
                    if (this.modelState.selectedModel.isCustom) {
                        new Notice(t('API Key is valid, but the custom model is not available. Please check the model ID and your access permissions.'));
                    } else {
                        new Notice(t('API Key is valid, but the selected model is not available. The model may not be released yet or you may not have access permissions.'));
                    }
                    return false;
                }
            }
            
            // API Key 无效
            new Notice(t('Invalid API Key or server error. Please verify your API Key.'));
            return false;
        } catch (error) {
            new Notice(t('Failed to validate API Key. Please check your key and try again.'));
            return false;
        }
    }
    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        // 添加标题
        new Setting(settingsContainer)
            .setName(t('Gemini service'))
            .setHeading();

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Please enter your API Key.'))
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
            .setDesc(t('Select a model or enter a custom one.'))
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
                        new Notice(t('Model ID can only contain letters, numbers, underscores, dots and hyphens.'));
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
            .setName(t('Provider URL'))
            .setDesc(t('Leave it blank, unless you are using a proxy.'))
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

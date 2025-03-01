import { Setting, Notice, requestUrl } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';

interface OpenAIModelState {
    selectedModel: AIModel;
    apiKey: string;
}

const DEFAULT_OPENAI_MODELS: AIModel[] = [
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
];

export class OpenAISettings extends BaseAIServiceSettings {
    private modelState: OpenAIModelState;
    private modelSelectEl: HTMLSelectElement | null = null;
    private customModelContainer: HTMLDivElement | null = null;

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeModelState();
    }

    private initializeModelState(): OpenAIModelState {
        // 确保 openai 设置对象存在
        if (!this.plugin.settings.ai.openai) {
            this.plugin.settings.ai.openai = {
                apiKey: '',
                model: DEFAULT_OPENAI_MODELS[0].id,
                apiAddress: '',
                isCustomModel: false,
                lastCustomModel: ''
            };
        }

        const settings = this.plugin.settings.ai.openai;
        let selectedModel: AIModel;

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
            const savedModel = DEFAULT_OPENAI_MODELS.find(m => m.id === settings.model);
            selectedModel = savedModel || DEFAULT_OPENAI_MODELS[0];
            
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
        if (!this.plugin.settings.ai.openai) {
            this.plugin.settings.ai.openai = {};
        }
        
        const settings = this.plugin.settings.ai.openai;
        const model = this.modelState.selectedModel;
        
        // 更新设置
        settings.model = model.id;
        settings.isCustomModel = !!model.isCustom;
        settings.apiKey = this.modelState.apiKey || '';
        
        // 如果是自定义模型，更新 lastCustomModel
        if (model.isCustom && model.id) {
            settings.lastCustomModel = model.id;
        }
        
        // 立即保存设置
        await this.plugin.saveSettings();
    }
    display(containerEl: HTMLElement): void {
        const openAISettingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        // 添加标题
        new Setting(openAISettingsContainer)
            .setName(t('OpenAI Settings'))
            .setHeading();

        // API Key 设置
        new Setting(openAISettingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your OpenAI API Key.'))
            .addText(text => text
                .setPlaceholder('sk-...')
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
                        const models = await this.fetchAvailableModels(this.modelState.apiKey);
                        if (models.length > 0) {
                            new Notice(t('API Key validated successfully!'));
                        } else {
                            new Notice(t('No models available. Please check your API Key.'));
                        }
                    } catch (error) {
                        new Notice(t('Failed to validate API Key. Please check your key and try again.'));
                    } finally {
                        // 恢复按钮状态
                        button.setDisabled(false);
                        button.setButtonText(t('Check'));
                    }
                }));

        // 模型选择设置
        const modelSetting = new Setting(openAISettingsContainer)
            .setName(t('Model'))
            .setDesc(t('Select a model or use a custom one'))
            .addDropdown(dropdown => {
                // 添加预设模型选项
                DEFAULT_OPENAI_MODELS.forEach(model => {
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
                        const selectedModel = DEFAULT_OPENAI_MODELS.find(m => m.id === value);
                        if (selectedModel) {
                            // 在切换到预设模型之前，保存当前的自定义模型
                            if (this.modelState.selectedModel.isCustom) {
                                const settings = this.plugin.settings.ai.openai;
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
        this.customModelContainer.style.cssText = 'display: none; margin-right: 10px;';
        
        // 将自定义输入框容器移到下拉框之前
        const dropdownEl = modelSetting.settingEl.querySelector('.setting-item-control');
        if (dropdownEl) {
            (dropdownEl as HTMLElement).style.display = 'flex';
            (dropdownEl as HTMLElement).style.flexDirection = 'row';
            (dropdownEl as HTMLElement).style.alignItems = 'center';
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
        settingItem.style.border = 'none';
        settingItem.style.padding = '0';
        const controlEl = settingItem.querySelector('.setting-item-control');
        if (controlEl) {
            (controlEl as HTMLElement).style.marginLeft = '0';
        }

        // 如果当前是自定义模型，显示输入框
        if (this.modelState.selectedModel.isCustom) {
            this.showCustomModelInput();
        }

        // 自定义 API 地址
        new Setting(openAISettingsContainer)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1')
                .setValue(this.plugin.settings.ai.openai?.apiAddress || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {};
                    }
                    this.plugin.settings.ai.openai.apiAddress = value;
                    await this.plugin.saveSettings();
                }));
    }

    private async validateModel(apiKey: string, modelId: string, apiAddress: string): Promise<boolean> {
        try {
            // 首先检查模型是否存在
            const modelResponse = await requestUrl({
                url: `${apiAddress}/models/${modelId}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (modelResponse.status !== 200) {
                const errorData = await modelResponse.json.catch(() => null);

                new Notice(t('自定义模型不可用。请检查模型 ID 是否正确，以及你是否有权限访问此模型。'));
                return false;
            }

            // 模拟一个实际的请求来验证模型
            const testResponse = await requestUrl({
                url: `${apiAddress}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{
                        role: 'user',
                        content: 'Hello'
                    }],
                    max_tokens: 1
                })
            });

            if (testResponse.status !== 200) {
                const errorData = await testResponse.json.catch(() => null);

                // 不再显示第二次错误提示，保持只有一次提示
                return false;
            }

            return true;
        } catch (error) {

            return false;
        }
    }

    private async fetchAvailableModels(apiKey: string): Promise<AIModel[]> {
        try {
            const apiAddress = this.plugin.settings.ai.openai?.apiAddress || 'https://api.openai.com/v1';
            
            // 如果是自定义模型，直接验证该模型
            if (this.modelState.selectedModel.isCustom) {
                const modelId = this.modelState.selectedModel.id;
                const isValid = await this.validateModel(apiKey, modelId, apiAddress);
                if (!isValid) {
                    throw new Error(`Custom model not available: ${modelId}`);
                }
                return [this.modelState.selectedModel];
            }
            
            // 获取所有可用模型
            const response = await requestUrl({
                url: `${apiAddress}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                const data = response.json;
                // 过滤出所有可用模型，不仅仅是 GPT 模型
                const availableModels = data.data
                    .map((model: any) => ({
                        id: model.id,
                        name: model.id
                    }));
                return availableModels;
            }
            return [];
        } catch (error) {

            throw error; // 向上抛出错误，以显示错误提示
        }
    }

    private async showCustomModelInput() {
        if (this.customModelContainer && this.modelSelectEl) {
            this.customModelContainer.style.display = 'block';
            this.modelSelectEl.value = 'custom';
            
            const settings = this.plugin.settings.ai.openai;
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
            this.customModelContainer.style.display = 'none';
        }
    }
}

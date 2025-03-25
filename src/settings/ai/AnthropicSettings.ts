import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';
import { AnthropicService } from '../../services/AnthropicService';

const DEFAULT_ANTHROPIC_MODELS: AIModel[] = [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    { id: 'claude-2', name: 'Claude 2' },
    { id: 'claude-instant-1', name: 'Claude Instant' }
];

interface AnthropicModelState {
    selectedModel: AIModel;
    apiKey: string;
}

export class AnthropicSettings extends BaseAIServiceSettings {
    private modelState: AnthropicModelState;
    private modelSelectEl: HTMLSelectElement | null = null;
    private customModelContainer: HTMLDivElement | null = null;

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeModelState();
    }

    private initializeModelState(): AnthropicModelState {
        // 确保 anthropic 设置对象存在
        if (!this.plugin.settings.ai.anthropic) {
            this.plugin.settings.ai.anthropic = {
                apiKey: '',
                model: DEFAULT_ANTHROPIC_MODELS[0].id,
                apiAddress: '',
                isCustomModel: false,
                lastCustomModel: ''
            };
        }

        const settings = this.plugin.settings.ai.anthropic;
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
            const savedModel = DEFAULT_ANTHROPIC_MODELS.find(m => m.id === settings.model);
            selectedModel = savedModel || DEFAULT_ANTHROPIC_MODELS[0];
            
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
        if (!this.plugin.settings.ai.anthropic) {
            this.plugin.settings.ai.anthropic = {};
        }
        
        const settings = this.plugin.settings.ai.anthropic;
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
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        // 添加标题
        new Setting(settingsContainer)
            .setName(t('Anthropic Settings'))
            .setHeading();

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your Anthropic API Key.'))
            .addText(text => text
                .setPlaceholder('sk-ant-...')
                .setValue(this.modelState.apiKey)
                .onChange(async (value) => {
                    this.modelState.apiKey = value;
                    await this.saveModelState();
                }))
            .addButton(button => button
                .setButtonText(t('Check'))
                .onClick(async () => {
                    try {
                        const apiKey = this.modelState.apiKey;
                        if (!apiKey) {
                            new Notice(t('Please enter an API Key first'));
                            return;
                        }
                        
                        // 禁用按钮，防止重复点击
                        button.setDisabled(true);
                        button.setButtonText(t('Checking...'));
                        
                        // 创建临时服务实例进行验证
                        const apiAddress = this.plugin.settings.ai.anthropic?.apiAddress || 'https://api.anthropic.com';
                        const model = this.modelState.selectedModel.id;
                        const anthropicService = new AnthropicService(
                            apiKey, apiAddress, model
                        );
                        
                        // 测试连接
                        const isValid = await anthropicService.testConnection();
                        
                        if (isValid) {
                            new Notice(t('API Key is valid!'));
                        } else {
                            new Notice(t('Failed to validate API Key. Please check your key and try again.'));
                        }
                    } catch (error) {
                        console.error('Anthropic API validation error:', error);
                        new Notice(t('Failed to validate API Key. Please check your key and try again.'));
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
                DEFAULT_ANTHROPIC_MODELS.forEach(model => {
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
                        const selectedModel = DEFAULT_ANTHROPIC_MODELS.find(m => m.id === value);
                        if (selectedModel) {
                            // 在切换到预设模型之前，保存当前的自定义模型
                            if (this.modelState.selectedModel.isCustom) {
                                const settings = this.plugin.settings.ai.anthropic;
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
                        new Notice(t('Model ID can only contain letters, numbers, underscores, dots and hyphens'));
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

        // 自定义 API 地址
        new Setting(settingsContainer)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://api.anthropic.com')
                .setValue(this.plugin.settings.ai.anthropic?.apiAddress || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.anthropic) {
                        this.plugin.settings.ai.anthropic = {};
                    }
                    this.plugin.settings.ai.anthropic.apiAddress = value;
                    await this.plugin.saveSettings();
                }));
    }

    private async showCustomModelInput() {
        if (this.customModelContainer && this.modelSelectEl) {
            this.customModelContainer.addClass('visible');
            this.modelSelectEl.value = 'custom';
            
            const settings = this.plugin.settings.ai.anthropic;
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
        }
    }
}

import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';

const DEFAULT_GEMINI_MODELS: AIModel[] = [
    { id: 'gemini-pro', name: 'Gemini Pro' },
    { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' },
    { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-exp-1121', name: 'Gemini Exp 1121' },
    { id: 'gemini-exp-1114', name: 'Gemini Exp 1114' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' }
];

export class GeminiSettings extends BaseAIServiceSettings {
    private customModelInput: HTMLInputElement | null = null;

    private getModelValue(): string {
        const currentModel = this.plugin.settings.ai.gemini?.model;
        // 如果没有保存的模型，返回默认值
        if (!currentModel) {
            return this.isCustomModel ? '' : DEFAULT_GEMINI_MODELS[0].id;
        }
        // 总是返回保存的模型值
        return currentModel;
    }

    private get isCustomModel(): boolean {
        return this.plugin.settings.ai.gemini?.isCustomModel || false;
    }

    private set isCustomModel(value: boolean) {
        if (!this.plugin.settings.ai.gemini) {
            this.plugin.settings.ai.gemini = {};
        }
        this.plugin.settings.ai.gemini.isCustomModel = value;
        this.plugin.saveSettings();
    }
    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        settingsContainer.createEl('h4', { text: t('Gemini Settings') });

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your Gemini API Key and press Enter to validate'))
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.ai.gemini?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.gemini) {
                        this.plugin.settings.ai.gemini = {};
                    }
                    this.plugin.settings.ai.gemini.apiKey = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText(t('Check'))
                .onClick(async () => {
                    const apiKey = this.plugin.settings.ai.gemini?.apiKey;
                    if (!apiKey) {
                        new Notice(t('Please enter an API Key first'));
                        return;
                    }

                    try {
                        const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-pro?key=' + apiKey);
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        const data = await response.json();
                        if (data && data.name) {
                            new Notice(t('API Key is valid!'));
                        } else {
                            throw new Error('Invalid response format');
                        }
                    } catch (error) {
                        console.error('Error validating API key:', error);
                        new Notice(t('Invalid API Key. Please check your key and try again.'));
                    }
                }));

        // 创建模型设置容器
        const modelContainer = settingsContainer.createEl('div', {
            cls: 'model-setting-container'
        });

        // 创建模型设置
        new Setting(modelContainer)
            .setName(t('Model'))
            .setDesc(t('Select a model or enter a custom one'))
            .addDropdown(dropdown => {
                // Always add options
                DEFAULT_GEMINI_MODELS.forEach(model => {
                    dropdown.addOption(model.id, model.name);
                });
                
                // Set the current value if not in custom mode
                if (!this.isCustomModel) {
                    const currentModel = this.plugin.settings.ai.gemini?.model;
                    // 如果当前值不在预设列表中，使用默认值
                    const modelToSet = currentModel && DEFAULT_GEMINI_MODELS.some(m => m.id === currentModel)
                        ? currentModel
                        : DEFAULT_GEMINI_MODELS[0].id;
                    dropdown.setValue(modelToSet);
                }
                
                // Handle changes
                dropdown.onChange(async (value) => {
                    if (!this.plugin.settings.ai.gemini) {
                        this.plugin.settings.ai.gemini = {};
                    }
                    this.plugin.settings.ai.gemini.model = value;
                    await this.plugin.saveSettings();
                });
                
                // Show/hide based on mode
                dropdown.selectEl.style.display = this.isCustomModel ? 'none' : 'block';
                return dropdown;
            })
            .addText(text => {
                this.customModelInput = text
                    .setPlaceholder(t('Enter custom model ID'))
                    .setValue(this.getModelValue())
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.gemini) {
                            this.plugin.settings.ai.gemini = {};
                        }
                        this.plugin.settings.ai.gemini.model = value;
                        await this.plugin.saveSettings();
                    })
                    .inputEl;
                this.customModelInput.style.display = this.isCustomModel ? 'block' : 'none';
                return text;
            })
            .addButton(button => button
                .setButtonText(t('Custom'))
                .onClick(async () => {
                    this.isCustomModel = !this.isCustomModel;
                    
                    // Update UI visibility
                    if (this.customModelInput) {
                        this.customModelInput.style.display = this.isCustomModel ? 'block' : 'none';
                    }
                    const dropdownEl = modelContainer.querySelector('.dropdown') as HTMLSelectElement;
                    if (dropdownEl) {
                        dropdownEl.style.display = this.isCustomModel ? 'none' : 'block';
                    }
                    
                    // Update button text
                    button.setButtonText(this.isCustomModel ? t('Use Preset') : t('Custom'));
                    
                    // When switching to preset mode, ensure a valid model is selected
                    if (!this.isCustomModel) {
                        if (!this.plugin.settings.ai.gemini?.model || 
                            !DEFAULT_GEMINI_MODELS.some(m => m.id === this.plugin.settings.ai.gemini?.model)) {
                            if (!this.plugin.settings.ai.gemini) {
                                this.plugin.settings.ai.gemini = {};
                            }
                            this.plugin.settings.ai.gemini.model = DEFAULT_GEMINI_MODELS[0].id;
                        }
                    }
                    
                    await this.plugin.saveSettings();
                }));

        // 自定义 API 地址
        new Setting(settingsContainer)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://generativelanguage.googleapis.com')
                .setValue(this.plugin.settings.ai.gemini?.apiAddress || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.gemini) {
                        this.plugin.settings.ai.gemini = {};
                    }
                    this.plugin.settings.ai.gemini.apiAddress = value;
                    await this.plugin.saveSettings();
                }));
    }
}

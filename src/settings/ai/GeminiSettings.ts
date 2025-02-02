import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';

const DEFAULT_GEMINI_MODELS: AIModel[] = [
    { id: 'gemini-pro', name: 'Gemini Pro' }
];

export class GeminiSettings extends BaseAIServiceSettings {
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
                })
                .inputEl.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        try {
                            // 这里可以添加 API Key 验证逻辑
                            new Notice(t('API Key saved!'));
                        } catch (error) {
                            console.error('Error validating API key:', error);
                            new Notice(t('Failed to validate API Key. Please check your key and try again.'));
                        }
                    }
                }));

        // 创建模型设置容器
        const modelContainer = settingsContainer.createEl('div', {
            cls: 'model-setting-container'
        });

        this.createModelDropdown(modelContainer, DEFAULT_GEMINI_MODELS, DEFAULT_GEMINI_MODELS[0]);

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

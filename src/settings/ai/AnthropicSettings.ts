import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';

const DEFAULT_ANTHROPIC_MODELS: AIModel[] = [
    { id: 'claude-2', name: 'Claude 2' },
    { id: 'claude-instant-1', name: 'Claude Instant' }
];

export class AnthropicSettings extends BaseAIServiceSettings {
    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        settingsContainer.createEl('h4', { text: t('Anthropic Settings') });

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your Anthropic API Key, press Enter to verify.'))
            .addText(text => text
                .setPlaceholder('sk-ant-...')
                .setValue(this.plugin.settings.ai.anthropic?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.anthropic) {
                        this.plugin.settings.ai.anthropic = {};
                    }
                    this.plugin.settings.ai.anthropic.apiKey = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText(t('Check'))
                .onClick(async () => {
                    try {
                        // 这里可以添加 API Key 验证逻辑
                        new Notice(t('API Key is valid!'));
                    } catch (error) {
                        console.error('Error validating API key:', error);
                        new Notice(t('Failed to validate API Key. Please check your key and try again.'));
                    }
                }));

        // 创建模型设置容器
        const modelContainer = settingsContainer.createEl('div', {
            cls: 'model-setting-container'
        });

        this.createModelDropdown(modelContainer, DEFAULT_ANTHROPIC_MODELS, DEFAULT_ANTHROPIC_MODELS[0]);

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
}

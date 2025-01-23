import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';

const DEFAULT_DEEPSEEK_MODELS: AIModel[] = [
    { id: 'deepseek-chat', name: 'Deepseek Chat' },
    { id: 'deepseek-coder', name: 'Deepseek Coder' }
];

export class DeepseekSettings extends BaseAIServiceSettings {
    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        settingsContainer.createEl('h3', { text: t('Deepseek Settings') });

        // API Key 设置
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your Deepseek API Key, press Enter to verify.'))
            .addText(text => text
                .setPlaceholder('dsk-...')
                .setValue(this.plugin.settings.ai.deepseek?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.deepseek) {
                        this.plugin.settings.ai.deepseek = {};
                    }
                    this.plugin.settings.ai.deepseek.apiKey = value;
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

        this.createModelDropdown(modelContainer, DEFAULT_DEEPSEEK_MODELS, DEFAULT_DEEPSEEK_MODELS[0]);

        // 自定义 API 地址
        new Setting(settingsContainer)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
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
}

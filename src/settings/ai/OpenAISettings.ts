import { Setting, Notice, requestUrl } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { t } from '../../i18n';

const DEFAULT_OPENAI_MODELS: AIModel[] = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
];

export class OpenAISettings extends BaseAIServiceSettings {
    display(containerEl: HTMLElement): void {
        const openAISettingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        openAISettingsContainer.createEl('h4', { text: t('OpenAI Settings') });

        // API Key 设置
        new Setting(openAISettingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Enter your OpenAI API Key and press Enter to validate'))
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.ai.openai?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {};
                    }
                    this.plugin.settings.ai.openai.apiKey = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.addEventListener('keypress', async (e) => {
                    if (e.key === 'Enter') {
                        const apiKey = (e.target as HTMLInputElement).value;
                        try {
                            const models = await this.fetchAvailableModels(apiKey);
                            if (models.length > 0) {
                                // 创建或更新模型选择设置
                                const modelContainer = openAISettingsContainer.querySelector('.model-setting-container');
                                if (modelContainer instanceof HTMLElement) {
                                    modelContainer.empty();
                                    this.createModelDropdown(modelContainer, models, models[0]);
                                }
                                new Notice(t('API Key validated successfully!'));
                            } else {
                                new Notice(t('No models available. Please check your API Key.'));
                            }
                        } catch (error) {
                            console.error('Error validating API key:', error);
                            new Notice(t('Failed to validate API Key. Please check your key and try again.'));
                        }
                    }
                }));

        // 创建模型设置容器
        const modelContainer = openAISettingsContainer.createEl('div', {
            cls: 'model-setting-container'
        });

        this.createModelDropdown(modelContainer, DEFAULT_OPENAI_MODELS, DEFAULT_OPENAI_MODELS[0]);

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

    private async fetchAvailableModels(apiKey: string): Promise<AIModel[]> {
        try {
            const apiAddress = this.plugin.settings.ai.openai?.apiAddress || 'https://api.openai.com/v1';
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
                // 过滤出 GPT 模型
                const gptModels = data.data
                    .filter((model: any) => model.id.startsWith('gpt'))
                    .map((model: any) => ({
                        id: model.id,
                        name: model.id
                    }));
                return gptModels;
            }
            return [];
        } catch (error) {
            console.error('Error fetching models:', error);
            return [];
        }
    }
}

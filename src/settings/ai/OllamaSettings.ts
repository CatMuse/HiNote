import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { OllamaService } from '../../services/OllamaService';
import { t } from '../../i18n';

export class OllamaSettings extends BaseAIServiceSettings {
    async display(containerEl: HTMLElement): Promise<void> {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        settingsContainer.createEl('h4', { text: t('Ollama Settings') });

        // Set default host if not configured
        const defaultHost = 'http://localhost:11434';
        if (!this.plugin.settings.ai.ollama?.host) {
            if (!this.plugin.settings.ai.ollama) this.plugin.settings.ai.ollama = {};
            this.plugin.settings.ai.ollama.host = defaultHost;
            await this.plugin.saveSettings();
        }

        // Host setting with test connection button
        const hostSetting = new Setting(settingsContainer)
            .setName(t('Server Address'))
            .setDesc(t('Ollama server address (default: http://localhost:11434)'))
            .addText(text => {
                text
                    .setPlaceholder(defaultHost)
                    .setValue(this.plugin.settings.ai.ollama?.host || defaultHost)
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {};
                        }
                        this.plugin.settings.ai.ollama.host = value || defaultHost;
                        await this.plugin.saveSettings();
                    });
                return text;
            })
            .addButton(button => button
                .setButtonText(t('Check'))
                .onClick(async () => {
                    const host = this.plugin.settings.ai.ollama?.host || defaultHost;
                    const ollamaService = new OllamaService(host);
                    try {
                        const models = await ollamaService.listModels();
                        if (models && models.length > 0) {
                            // Update available models in settings
                            this.plugin.settings.ai.ollama.availableModels = models;
                            await this.plugin.saveSettings();

                            // 验证成功后更新模型选择下拉框
                            this.displayOllamaModelDropdown(settingsContainer, models);

                            new Notice(t('Successfully connected to Ollama server!'));
                        } else {
                            new Notice(t('No models found on Ollama server. Please install some models first.'));
                        }
                    } catch (error) {
                        console.error('Error connecting to Ollama:', error);
                        new Notice(t('Failed to connect to Ollama server. Please check the server address and ensure Ollama is running.'));
                    }
                }));

        // 默认显示模型选择（如果有保存的模型列表）
        if (this.plugin.settings.ai.ollama?.availableModels?.length) {
            this.displayOllamaModelDropdown(settingsContainer, this.plugin.settings.ai.ollama.availableModels);
        }
    }

    private displayOllamaModelDropdown(container: HTMLElement, models: string[]) {
        // 移除旧的模型选择（如果存在）
        const existingModelSetting = container.querySelector('.model-setting');
        if (existingModelSetting) {
            existingModelSetting.remove();
        }

        // 创建新的设置项，并添加特定的类名以便后续识别
        const modelSetting = new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select the Ollama model to use'))
            .addDropdown(dropdown => {
                const options = Object.fromEntries(
                    models.map((modelName: string) => [modelName, modelName])
                );

                // 修改这里的默认值选择逻辑
                const currentModel = this.plugin.settings.ai.ollama?.model;
                const defaultModel = models.includes(currentModel) ? currentModel : models[0];

                return dropdown
                    .addOptions(options)
                    .setValue(defaultModel)
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {};
                        }
                        this.plugin.settings.ai.ollama.model = value;  // 确保保存到正确的位置
                        await this.plugin.saveSettings();
                    });
            });

        // 为新创建的设置项添加类名
        modelSetting.settingEl.addClass('model-setting');
    }
}

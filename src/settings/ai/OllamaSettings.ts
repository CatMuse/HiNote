import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings, AIModel } from './AIServiceSettings';
import { OllamaService } from '../../services/OllamaService';
import { t } from '../../i18n';

export class OllamaSettings extends BaseAIServiceSettings {
    async display(containerEl: HTMLElement): Promise<void> {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        settingsContainer.createEl('h3', { text: t('Ollama Settings') });

        // Set default host if not configured
        const defaultHost = 'http://localhost:11434';
        if (!this.plugin.settings.ai.ollama?.host) {
            if (!this.plugin.settings.ai.ollama) this.plugin.settings.ai.ollama = {};
            this.plugin.settings.ai.ollama.host = defaultHost;
            await this.plugin.saveSettings();
        }

        // Create model container first (needed for Test Connection button)
        const modelContainer = settingsContainer.createEl('div', {
            cls: 'model-setting-container'
        });

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
                .setButtonText(t('Verify'))
                .onClick(async () => {
                    const ollamaService = new OllamaService(this.plugin);
                    try {
                        const models = await ollamaService.listModels();
                        if (models && models.length > 0) {
                            const ollamaModels = models.map((modelName: string) => ({
                                id: modelName,
                                name: modelName
                            }));

                            // Update available models in settings
                            this.plugin.settings.ai.ollama.availableModels = models;
                            await this.plugin.saveSettings();

                            // Update model dropdown
                            modelContainer.empty();
                            this.createModelDropdown(modelContainer, ollamaModels, ollamaModels[0]);

                            new Notice(t('Successfully connected to Ollama server!'));
                        } else {
                            new Notice(t('No models found on Ollama server. Please install some models first.'));
                        }
                    } catch (error) {
                        console.error('Error connecting to Ollama:', error);
                        new Notice(t('Failed to connect to Ollama server. Please check the server address and ensure Ollama is running.'));
                    }
                }));

        // Display model selection based on saved state
        if (this.plugin.settings.ai.ollama?.availableModels?.length) {
            const ollamaModels = this.plugin.settings.ai.ollama.availableModels.map((modelName: string | undefined) => ({
                id: modelName,
                name: modelName
            }));
            this.createModelDropdown(modelContainer, ollamaModels, ollamaModels[0]);
        }
    }

    private displayOllamaModelDropdown(container: HTMLElement, models: string[]) {
        container.empty();

        new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select the Ollama model to use'))
            .addDropdown(dropdown => {
                const options = Object.fromEntries(
                    models.map((modelName: string) => [modelName, modelName])
                );

                return dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.model || models[0])
                    .onChange(async (value) => {
                        this.plugin.settings.ai.model = value;
                        await this.plugin.saveSettings();
                    });
            });
    }
}

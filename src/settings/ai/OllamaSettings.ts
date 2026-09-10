import { Setting } from 'obsidian';
import { BaseAIServiceSettings } from './AIServiceSettings';
import { OllamaService } from '../../services/ai';
import { t } from '../../i18n';

export class OllamaSettings extends BaseAIServiceSettings {
    private getOllamaSettings(defaultHost: string) {
        if (!this.plugin.settings.ai.ollama) {
            this.plugin.settings.ai.ollama = {
                host: defaultHost,
                model: ''
            };
        }

        return this.plugin.settings.ai.ollama;
    }

    display(containerEl: HTMLElement): void {
        void this.render(containerEl);
    }

    private async render(containerEl: HTMLElement): Promise<void> {
        const settingsContainer = containerEl.createDiv({
            cls: 'ai-service-settings'
        });

        // 添加标题
        new Setting(settingsContainer)
            .setName(t('Ollama service'))
            .setHeading();

        // Set default host if not configured
        const defaultHost = 'http://localhost:11434';
        const ollamaSettings = this.getOllamaSettings(defaultHost);
        if (!ollamaSettings.host) {
            ollamaSettings.host = defaultHost;
            await this.plugin.saveSettings();
        }

        // Host setting with test connection button
        const hostSetting = new Setting(settingsContainer)
            .setName(t('Server URL'))
            .setDesc(t('Ollama server URL (default: http://localhost:11434)'))
            .addText(text => {
                text
                    .setPlaceholder(defaultHost)
                    .setValue(ollamaSettings.host || defaultHost)
                    .onChange(async (value) => {
                        this.getOllamaSettings(defaultHost).host = value || defaultHost;
                        await this.plugin.saveSettings();
                    });
                return text;
            });

        // 添加检查按钮
        hostSetting.addButton(button => {
            button.setButtonText(t('Check'));
            button.onClick(async () => {
                const host = this.getOllamaSettings(defaultHost).host || defaultHost;
                if (!host || host.trim() === '') {
                    this.showButtonStatus(button.buttonEl, 'warning');
                    return;
                }

                this.showButtonStatus(button.buttonEl, 'loading');
                try {
                    const ollamaService = new OllamaService(host);
                    const models = await ollamaService.listModels();
                    this.showButtonStatus(button.buttonEl, (models && models.length > 0) ? 'success' : 'error');
                } catch {
                    this.showButtonStatus(button.buttonEl, 'error');
                }
            });
        });

        // 默认显示模型选择（如果有保存的模型列表）
        if (ollamaSettings.availableModels?.length) {
            this.displayOllamaModelDropdown(settingsContainer, ollamaSettings.availableModels);
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
            .setDesc(t('Select a Ollama model.'))
            .addDropdown(dropdown => {
                const options = Object.fromEntries(
                    models.map((modelName: string) => [modelName, modelName])
                );

                // 修改这里的默认值选择逻辑
                const currentModel = this.getOllamaSettings('http://localhost:11434').model;
                const defaultModel = models.includes(currentModel) ? currentModel : models[0];

                return dropdown
                    .addOptions(options)
                    .setValue(defaultModel || '')
                    .onChange(async (value) => {
                        this.getOllamaSettings('http://localhost:11434').model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // 为新创建的设置项添加类名
        modelSetting.settingEl.addClass('model-setting');
    }
}

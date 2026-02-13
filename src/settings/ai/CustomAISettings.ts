import { Setting, Notice } from 'obsidian';
import { BaseAIServiceSettings } from './AIServiceSettings';
import { AITestHelper } from '../../services/ai';
import { t } from '../../i18n';

export class CustomAISettings extends BaseAIServiceSettings {
    private detectedApiType: string | null = null;

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
    }

    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        // 添加标题和说明
        new Setting(settingsContainer)
            .setName(t('Custom AI Service'))
            .setHeading();

        // 添加说明文本
        const descEl = settingsContainer.createEl('div', {
            cls: 'setting-item-description custom-ai-description'
        });
        descEl.createEl('p', {
            text: t('Configure your own AI service provider. Supports OpenAI, Anthropic, and Gemini compatible APIs.')
        });
        descEl.createEl('p', {
            text: t('The API type will be automatically detected based on your URL.')
        });

        // 服务商名称
        new Setting(settingsContainer)
            .setName(t('Service Name'))
            .setDesc(t('Give your custom AI service a name'))
            .addText(text => text
                .setPlaceholder(t('e.g., My AI Service'))
                .setValue(this.plugin.settings.ai.custom?.name || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.custom) {
                        this.plugin.settings.ai.custom = {
                            name: '',
                            apiKey: '',
                            baseUrl: '',
                            model: ''
                        };
                    }
                    this.plugin.settings.ai.custom.name = value;
                    await this.plugin.saveSettings();
                }));

        // API 端点 URL
        new Setting(settingsContainer)
            .setName(t('API Endpoint URL'))
            .setDesc(t('The base URL of your AI service API'))
            .addText(text => text
                .setPlaceholder('https://api.example.com/v1')
                .setValue(this.plugin.settings.ai.custom?.baseUrl || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.custom) {
                        this.plugin.settings.ai.custom = {
                            name: '',
                            apiKey: '',
                            baseUrl: '',
                            model: ''
                        };
                    }
                    this.plugin.settings.ai.custom.baseUrl = value;
                    // 清除之前检测到的 API 类型，以便重新检测
                    this.plugin.settings.ai.custom.detectedApiType = undefined;
                    this.detectedApiType = null;
                    await this.plugin.saveSettings();
                }));

        // API Key
        new Setting(settingsContainer)
            .setName(t('API Key'))
            .setDesc(t('Your API key for authentication'))
            .addText(text => {
                text
                    .setPlaceholder('sk-...')
                    .setValue(this.plugin.settings.ai.custom?.apiKey || '')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.custom) {
                            this.plugin.settings.ai.custom = {
                                name: '',
                                apiKey: '',
                                baseUrl: '',
                                model: ''
                            };
                        }
                        this.plugin.settings.ai.custom.apiKey = value;
                        await this.plugin.saveSettings();
                    });
                // 设置为密码输入框
                text.inputEl.type = 'password';
                return text;
            })
            .addButton(button => {
                button.setButtonText(t('Check'));
                button.onClick(async () => {
                    if (!this.plugin.settings.ai.custom?.apiKey || 
                        !this.plugin.settings.ai.custom?.baseUrl ||
                        !this.plugin.settings.ai.custom?.model) {
                        this.showButtonStatus(button.buttonEl, 'warning');
                        return;
                    }
                    
                    this.showButtonStatus(button.buttonEl, 'loading');
                    
                    try {
                        const success = await this.testConnection();
                        this.showButtonStatus(button.buttonEl, success ? 'success' : 'error');
                        
                        if (success) {
                            const apiType = this.plugin.settings.ai.custom?.detectedApiType;
                            if (apiType) {
                                this.detectedApiType = apiType;
                                const typeNames: Record<string, string> = {
                                    'openai': 'OpenAI',
                                    'anthropic': 'Anthropic',
                                    'gemini': 'Gemini'
                                };
                                
                                let infoEl = settingsContainer.querySelector('.custom-ai-info');
                                if (!infoEl) {
                                    infoEl = settingsContainer.createEl('div', {
                                        cls: 'setting-item-description custom-ai-info'
                                    });
                                    infoEl.createEl('strong', { text: t('Detected API Type: ') });
                                    infoEl.createEl('span', { text: typeNames[apiType] || apiType });
                                } else {
                                    const span = infoEl.querySelector('span');
                                    if (span) {
                                        span.textContent = typeNames[apiType] || apiType;
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        this.showButtonStatus(button.buttonEl, 'error');
                    }
                });
            });

        // 模型名称
        new Setting(settingsContainer)
            .setName(t('Model'))
            .setDesc(t('The model identifier to use'))
            .addText(text => text
                .setPlaceholder('gpt-4, claude-3-opus, gemini-pro, etc.')
                .setValue(this.plugin.settings.ai.custom?.model || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.custom) {
                        this.plugin.settings.ai.custom = {
                            name: '',
                            apiKey: '',
                            baseUrl: '',
                            model: ''
                        };
                    }
                    this.plugin.settings.ai.custom.model = value;
                    await this.plugin.saveSettings();
                }));

        // 显示检测到的 API 类型（如果有）
        if (this.plugin.settings.ai.custom?.detectedApiType || this.detectedApiType) {
            const apiType = this.plugin.settings.ai.custom?.detectedApiType || this.detectedApiType;
            const typeNames: Record<string, string> = {
                'openai': 'OpenAI',
                'anthropic': 'Anthropic',
                'gemini': 'Gemini'
            };
            
            const infoEl = settingsContainer.createEl('div', {
                cls: 'setting-item-description custom-ai-info'
            });
            infoEl.createEl('strong', { text: t('Detected API Type: ') });
            infoEl.createEl('span', { text: typeNames[apiType] || apiType });
        }

        // 高级选项（可选的自定义请求头）
        const advancedSetting = new Setting(settingsContainer)
            .setName(t('Advanced Options'))
            .setDesc(t('Optional custom headers (JSON format)'));

        advancedSetting.descEl.createEl('br');
        advancedSetting.descEl.createEl('small', {
            text: t('Example: {"X-Custom-Header": "value"}')
        });

        advancedSetting.addTextArea(text => {
            text
                .setPlaceholder('{}')
                .setValue(this.plugin.settings.ai.custom?.headers 
                    ? JSON.stringify(this.plugin.settings.ai.custom.headers, null, 2) 
                    : '')
                .onChange(async (value) => {
                    if (!value.trim()) {
                        if (this.plugin.settings.ai.custom) {
                            this.plugin.settings.ai.custom.headers = undefined;
                            await this.plugin.saveSettings();
                        }
                        return;
                    }

                    try {
                        const headers = JSON.parse(value);
                        if (typeof headers !== 'object' || Array.isArray(headers)) {
                            new Notice(t('Invalid JSON format. Headers must be an object.'));
                            return;
                        }
                        
                        if (!this.plugin.settings.ai.custom) {
                            this.plugin.settings.ai.custom = {
                                name: '',
                                apiKey: '',
                                baseUrl: '',
                                model: ''
                            };
                        }
                        this.plugin.settings.ai.custom.headers = headers;
                        await this.plugin.saveSettings();
                    } catch (error) {
                        new Notice(t('Invalid JSON format'));
                    }
                });
            
            text.inputEl.rows = 4;
            text.inputEl.style.fontFamily = 'monospace';
            return text;
        });
    }

    private async testConnection(): Promise<boolean> {
        try {
            // 动态导入 CustomAIService
            const { CustomAIService } = await import('../../services/ai/CustomAIService');
            
            // 创建临时的服务实例进行测试
            const customSettings = this.plugin.settings.ai.custom;
            if (!customSettings) {
                return false;
            }
            
            const tempService = new CustomAIService(
                customSettings.apiKey,
                customSettings.baseUrl,
                customSettings.model,
                customSettings.headers,
                customSettings.detectedApiType
            );
            
            // 测试连接
            const result = await tempService.testConnection();
            
            // 如果测试成功，保存检测到的 API 类型
            if (result) {
                const detectedType = tempService.getDetectedAPIType();
                if (detectedType && customSettings) {
                    customSettings.detectedApiType = detectedType;
                    await this.plugin.saveSettings();
                }
            }
            
            return result;
        } catch (error) {
            console.error('Test connection error:', error);
            return false;
        }
    }
}

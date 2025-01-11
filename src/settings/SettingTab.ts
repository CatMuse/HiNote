import { App, PluginSettingTab, Setting, TextComponent, Notice, TextAreaComponent, Modal, requestUrl, DropdownComponent } from 'obsidian';
import { AIProvider, OpenAIModel, AnthropicModel, PluginSettings } from '../types';
import { OllamaService } from '../services/OllamaService';
import { CommentView } from '../CommentView';
import { setIcon } from 'obsidian';  // 添加 setIcon 导入
import { PromptSettingsTab } from './PromptSettingsTab';  // 导入新的 PromptSettingsTab
import { GeminiService } from '../services/GeminiService';  // 添加 GeminiService 的导入语句
import { t } from '../i18n'; // 导入新的翻译系统

export class AISettingTab extends PluginSettingTab {
    plugin: any;  // 修改为具体的插件类型
    DEFAULT_SETTINGS: PluginSettings;  // 添加这一行

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
        this.DEFAULT_SETTINGS = plugin.DEFAULT_SETTINGS;  // 从插件实例获取默认设置
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // AI 服务设置
        new Setting(containerEl)
            .setName(t('AI Service'))
            .setDesc(t('Select the AI service provider'))
            .addDropdown(dropdown => {
                const options: Record<AIProvider, string> = {
                    'openai': 'OpenAI',
                    'gemini': 'Gemini',
                    'anthropic': 'Anthropic',
                    'ollama': 'Ollama (Local)'
                };

                return dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.provider)
                    .onChange(async (value: AIProvider) => {
                        this.plugin.settings.ai.provider = value;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        // 根据选择的服务显示相应的设置
        switch (this.plugin.settings.ai.provider) {
            case 'openai':
                this.displayOpenAISettings();
                break;
            case 'gemini':
                this.displayGeminiSettings();
                break;
            case 'anthropic':
                this.displayAnthropicSettings();
                break;
            case 'ollama':
                this.displayOllamaSettings();
                break;
        }

        // 显示提示词设置
        this.displayPromptSettings();
    }

    private createOrUpdateModelDropdown(container: HTMLElement, models?: {id: string, name: string}[]) {
        const defaultOptions = {
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o-mini',
            'gpt-4': 'GPT-4',
            'gpt-4-turbo-preview': 'GPT-4 Turbo',
        };

        return new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select the OpenAI model to use'))
            .addDropdown(dropdown => {
                // 使用传入的模型列表或默认选项
                const options: {[key: string]: string} = {};
                if (models && models.length > 0) {
                    models.forEach(model => {
                        options[model.id] = model.name;
                    });
                } else {
                    Object.assign(options, defaultOptions);
                }
                
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.openai?.model || 'gpt-4o')
                    .onChange(async (value: OpenAIModel) => {
                        if (!this.plugin.settings.ai.openai) {
                            this.plugin.settings.ai.openai = {
                                apiKey: '',
                                model: 'gpt-4o'
                            };
                        }
                        this.plugin.settings.ai.openai.model = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private async fetchAvailableModels(apiKey: string): Promise<{id: string, name: string}[]> {
        const baseUrl = this.plugin.settings.ai.openai?.baseUrl || 'https://api.openai.com/v1';
        const response = await fetch(`${baseUrl}/models`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(t('Failed to fetch models'));
        }

        const data = await response.json();
        // 过滤 GPT 模型
        return data.data
            .filter((model: any) => 
                model.id.includes('gpt') && 
                !model.id.includes('instruct') &&
                !model.id.includes('0301') &&  // 过滤旧版本
                !model.id.includes('0314')
            )
            .map((model: any) => ({
                id: model.id,
                name: this.formatModelName(model.id)
            }));
    }

    private formatModelName(modelId: string): string {
        // 美化模型名称显示
        const nameMap: {[key: string]: string} = {
            'gpt-4': 'GPT-4',
            'gpt-4-turbo-preview': 'GPT-4 Turbo',
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o-mini'
        };
        return nameMap[modelId] || modelId;
    }

    private displayOpenAISettings() {
        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: t('OpenAI Settings') });

        // API Key 设置
        new Setting(container)
            .setName(t('API Key'))
            .setDesc(t('Enter your OpenAI API Key and press Enter to validate'))
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.ai.openai?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {
                            apiKey: '',
                            model: 'gpt-4o'
                        };
                    }
                    this.plugin.settings.ai.openai.apiKey = value;
                    await this.plugin.saveSettings();
                })
                // 添加回车键监听
                .inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        const apiKey = this.plugin.settings.ai.openai?.apiKey;
                        if (!apiKey) {
                            new Notice(t('Please enter your API Key'));
                            return;
                        }

                        new Notice(t('Validating API Key...'));

                        try {
                            const models = await this.fetchAvailableModels(apiKey);
                            if (models.length > 0) {
                                // 创建或更新模型选择设置
                                const modelContainer = container.querySelector('.model-setting-container');
                                if (modelContainer instanceof HTMLElement) {
                                    modelContainer.empty();
                                    this.createOrUpdateModelDropdown(modelContainer, models);
                                }
                                new Notice(t('API Key verification successful!'));
                            } else {
                                new Notice(t('No available models found.'));
                            }
                        } catch (error) {
                            console.error('API Key verification failed:', error);
                            new Notice(t('API Key verification failed. Please check your API Key.'));
                        }
                    }
                }));

        // 创建模型设置容器
        const modelContainer = container.createEl('div', {
            cls: 'model-setting-container'
        });

        // 初始显示默认的模型选择
        this.createOrUpdateModelDropdown(modelContainer);

        // 自定义 API 地址
        new Setting(container)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://api.openai.com/v1')
                .setValue(this.plugin.settings.ai.openai?.baseUrl || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {
                            apiKey: '',
                            model: 'gpt-4o'
                        };
                    }
                    this.plugin.settings.ai.openai.baseUrl = value;
                    await this.plugin.saveSettings();
                }));
    }

    private async verifyAnthropicApiKey(apiKey: string): Promise<boolean> {
        try {
            const baseUrl = this.plugin.settings.ai.anthropic?.baseUrl || 'https://api.anthropic.com';
            const response = await requestUrl({
                url: `${baseUrl}/v1/messages`,
                method: 'POST',
                headers: {
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({
                    model: 'claude-3-opus-20240229',
                    max_tokens: 1,
                    messages: [{
                        role: 'user',
                        content: 'Hi'
                    }]
                })
            });

            return response.status === 200;
        } catch (error) {
            console.error('Error verifying Anthropic API key:', error);
            return false;
        }
    }

    private getDefaultAnthropicModels(): {id: string, name: string}[] {
        return [
            { id: 'claude-3-opus-20240229', name: 'Claude-3 Opus' },
            { id: 'claude-3-sonnet-20240229', name: 'Claude-3 Sonnet' },
            { id: 'claude-3-5-sonnet-latest', name: 'Claude-3.5 Sonnet' },
            { id: 'claude-3-haiku-20240307', name: 'Claude-3 Haiku' }
        ];
    }

    private displayAnthropicSettings() {
        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: t('Anthropic Settings') });

        // 创建模型设置容器（需要在 API Key 验证时使用）
        const modelContainer = container.createEl('div', {
            cls: 'model-setting-container'
        });

        // API Key 设置
        new Setting(container)
            .setName(t('API Key'))
            .setDesc(t('Enter your Anthropic API Key, press Enter to verify.'))
            .addText(text => text
                .setPlaceholder('sk-ant-...')
                .setValue(this.plugin.settings.ai.anthropic?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.anthropic) {
                        this.plugin.settings.ai.anthropic = {
                            apiKey: '',
                            model: 'claude-3-opus-20240229'
                        };
                    }
                    this.plugin.settings.ai.anthropic.apiKey = value;
                    await this.plugin.saveSettings();
                })
                // 添加回车键监听
                .inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        const apiKey = this.plugin.settings.ai.anthropic?.apiKey;
                        if (!apiKey) {
                            new Notice(t('Please enter your API Key'));
                            return;
                        }

                        new Notice(t('Validating API Key...'));

                        try {
                            const isValid = await this.verifyAnthropicApiKey(apiKey);
                            if (isValid) {
                                // 创建或更新模型选择设置
                                modelContainer.empty();
                                this.createAnthropicModelDropdown(modelContainer);
                                new Notice(t('API Key verification successful!'));
                            } else {
                                new Notice(t('API Key verification failed. Please check your API Key.'));
                            }
                        } catch (error) {
                            console.error('API Key verification failed:', error);
                            new Notice(t('API Key verification failed. Please check your API Key.'));
                        }
                    }
                }));

        // 显示默认的模型选择
        this.createAnthropicModelDropdown(modelContainer);

        // 将模型容器移动到正确的位置
        container.appendChild(modelContainer);

        // 自定义 API 地址
        new Setting(container)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://api.anthropic.com')
                .setValue(this.plugin.settings.ai.anthropic?.baseUrl || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.anthropic) {
                        this.plugin.settings.ai.anthropic = {
                            apiKey: '',
                            model: 'claude-3-opus-20240229'
                        };
                    }
                    this.plugin.settings.ai.anthropic.baseUrl = value;
                    await this.plugin.saveSettings();
                }));
    }

    private createAnthropicModelDropdown(container: HTMLElement) {
        const models = this.getDefaultAnthropicModels();
        
        new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select the Anthropic model to use'))
            .addDropdown(dropdown => {
                const options = Object.fromEntries(
                    models.map(model => [model.id, model.name])
                );

                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.anthropic?.model || 'claude-3-opus-20240229')
                    .onChange(async (value: AnthropicModel) => {
                        if (!this.plugin.settings.ai.anthropic) {
                            this.plugin.settings.ai.anthropic = {
                                apiKey: '',
                                model: value
                            };
                        } else {
                            this.plugin.settings.ai.anthropic.model = value;
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    private async displayOllamaSettings() {
        // Clear any existing settings
        const existingContainer = this.containerEl.querySelector('.ai-service-settings');
        if (existingContainer) {
            existingContainer.remove();
        }

        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: t('Ollama Settings') });

        // Set default host if not configured
        const defaultHost = 'http://localhost:11434';
        if (!this.plugin.settings.ai.ollama) {
            this.plugin.settings.ai.ollama = {
                host: defaultHost,
                model: '',  // Don't set a default model until we check what's available
                availableModels: []
            };
            await this.plugin.saveSettings();
        }

        // Create model container first (needed for Test Connection button)
        const modelContainer = container.createEl('div', {
            cls: 'model-setting-container'
        });

        // Server address setting
        const hostSetting = new Setting(container)
            .setName(t('Server Address'))
            .setDesc(t('Ollama server address (default: http://localhost:11434)'))
            .addText(text => {
                text.setPlaceholder('http://localhost:11434')
                    .setValue(this.plugin.settings.ai.ollama?.host || defaultHost)
                    .onChange(async (value) => {
                        // Ensure the host has a protocol
                        let host = value;
                        if (!host.startsWith('http://') && !host.startsWith('https://')) {
                            host = 'http://' + host;
                            text.setValue(host);
                        }
                        
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {
                                host: host,
                                model: '',
                                availableModels: []
                            };
                        } else {
                            this.plugin.settings.ai.ollama.host = host;
                        }
                        await this.plugin.saveSettings();
                    });
            });

        // Add test connection button
        hostSetting.addButton(button => 
            button
                .setButtonText(t('Test Connection'))
                .onClick(async () => {
                    const host = this.plugin.settings.ai.ollama?.host || defaultHost;
                    try {
                        const ollamaService = new OllamaService(host);
                        const isConnected = await ollamaService.testConnection();
                        if (isConnected) {
                            new Notice(t('Successfully connected to Ollama service'));
                            // Try to load models
                            const models = await ollamaService.listModels();
                            if (models.length > 0) {
                                // Clear existing model selection before updating
                                modelContainer.empty();
                                this.updateOllamaModelDropdown(modelContainer, models);
                            } else {
                                new Notice(t('No models found. Please download models using ollama'));
                                this.showDefaultOllamaModels(modelContainer);
                            }
                        } else {
                            new Notice(t('Could not connect to Ollama service'));
                            this.showDefaultOllamaModels(modelContainer);
                        }
                    } catch (error) {
                        console.error('Ollama connection error:', error);
                        new Notice(t('Failed to connect to Ollama service. Please check the server address.'));
                        this.showDefaultOllamaModels(modelContainer);
                    }
                })
        );

        // Move model container to the end
        container.appendChild(modelContainer);

        // Display model selection based on saved state
        if (this.plugin.settings.ai.ollama?.availableModels?.length) {
            // If we have saved models, show them
            this.showDefaultOllamaModels(modelContainer);
        } else {
            // If no saved models, try to load them
            try {
                const ollamaService = new OllamaService(this.plugin.settings.ai.ollama.host);
                const isConnected = await ollamaService.testConnection();
                
                if (isConnected) {
                    const models = await ollamaService.listModels();
                    if (models.length > 0) {
                        this.updateOllamaModelDropdown(modelContainer, models);
                    } else {
                        this.showDefaultOllamaModels(modelContainer);
                    }
                } else {
                    this.showDefaultOllamaModels(modelContainer);
                }
            } catch (error) {
                console.error('Initial model load failed:', error);
                this.showDefaultOllamaModels(modelContainer);
            }
        }
    }

    private showSavedModel(container: HTMLElement) {
        container.empty();
        
        new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Currently selected model (Test connection to see all available models)'))
            .addDropdown(dropdown => {
                const savedModel = this.plugin.settings.ai.ollama?.model || '';
                const options: Record<string, string> = {
                    [savedModel]: this.formatModelName(savedModel)
                };
                
                dropdown
                    .addOptions(options)
                    .setValue(savedModel)
                    .onChange(async (value: string) => {
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {
                                host: 'http://localhost:11434',
                                model: value,
                                availableModels: []
                            };
                        } else {
                            this.plugin.settings.ai.ollama.model = value;
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    private showDefaultOllamaModels(container: HTMLElement) {
        container.empty();
        
        // 获取上次保存的模型列表
        const savedModels = this.plugin.settings.ai.ollama?.availableModels || [];
        
        new Setting(container)
            .setName(t('Model'))
            .setDesc(savedModels.length 
                ? t('Select a model to use') 
                : t('No models available. Please load an available model first.'))
            .addDropdown(dropdown => {
                if (savedModels.length > 0) {
                    // 显示所有保存的模型
                    const options: { [key: string]: string } = {};
                    savedModels.forEach((model: string) => {
                        options[model] = model;
                    });
                    
                    dropdown
                        .addOptions(options)
                        .setValue(this.plugin.settings.ai.ollama?.model || savedModels[0])
                        .onChange(async (value: string) => {
                            if (!this.plugin.settings.ai.ollama) {
                                this.plugin.settings.ai.ollama = {
                                    host: 'http://localhost:11434',
                                    model: value,
                                    availableModels: savedModels
                                };
                            } else {
                                this.plugin.settings.ai.ollama.model = value;
                                this.plugin.settings.ai.ollama.availableModels = savedModels;
                            }
                            await this.plugin.saveSettings();
                        });
                } else {
                    dropdown
                        .addOption('', t('No models available'))
                        .setValue('')
                        .setDisabled(true);
                }
            });
    }

    private updateOllamaModelDropdown(container: HTMLElement, models: string[]) {
        // 保存获取到的模型列表
        if (!this.plugin.settings.ai.ollama) {
            this.plugin.settings.ai.ollama = {
                host: 'http://localhost:11434',
                model: models[0],
                availableModels: models
            };
        } else {
            this.plugin.settings.ai.ollama.availableModels = models;
            // 如果当前选择的模型不在新的列表中，更新为第一个可用模型
            if (!models.includes(this.plugin.settings.ai.ollama.model)) {
                this.plugin.settings.ai.ollama.model = models[0];
            }
        }
        
        container.empty();
        
        new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select a model to use'))
            .addDropdown(dropdown => {
                const options: { [key: string]: string } = {};
                models.forEach(model => {
                    options[model] = model;
                });
                
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.ollama.model)
                    .onChange(async (value: string) => {
                        this.plugin.settings.ai.ollama.model = value;
                        await this.plugin.saveSettings();
                    });
            });
            
        // 保存设置
        this.plugin.saveSettings();
    }

    private async verifyGeminiApiKey(apiKey: string): Promise<boolean> {
        try {
            const baseUrl = this.plugin.settings.ai.gemini?.baseUrl || 'https://generativelanguage.googleapis.com';
            const response = await requestUrl({
                url: `${baseUrl}/v1/models?key=${apiKey}`,
                method: 'GET'
            });
            return response.status === 200;
        } catch (error) {
            console.error('Error verifying Gemini API key:', error);
            return false;
        }
    }

    private async createGeminiModelDropdown(container: HTMLElement) {
        try {
            const modelSetting = new Setting(container)
                .setName(t('Model'))
                .setDesc(t('Select the Gemini model to use'));

            // 默认模型列表
            const defaultModels = {
                'gemini-pro': 'Gemini Pro',
                'gemini-1.5-pro-latest': 'Gemini 1.5 Pro',
                'gemini-pro-vision': 'Gemini Pro Vision',
                'gemini-1.5-flash-latest': 'Gemini 1.5 Flash',
                'gemini-exp-1121': 'Gemini Exp 1121',
                'gemini-exp-1114': 'Gemini Exp 1114',
                'gemini-2.0-flash-exp': 'Gemini 2.0 Flash Exp'
            };

            modelSetting.addDropdown(dropdown => {
                return dropdown
                    .addOptions(defaultModels)
                    .setValue(this.plugin.settings.ai.gemini?.model || 'gemini-pro')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.gemini) {
                            this.plugin.settings.ai.gemini = {
                                apiKey: '',
                                model: value
                            };
                        }
                        this.plugin.settings.ai.gemini.model = value;
                        await this.plugin.saveSettings();
                    });
            });

            // 注释掉 API 获取逻辑
            /*
            if (this.plugin.settings.ai.gemini?.apiKey) {
                this.updateGeminiModels(dropdown);
            }
            */

        } catch (error) {
            console.error('Error creating Gemini model dropdown:', error);
            new Notice(t('Unable to create model selection dropdown menu.'));
        }
    }

    private displayGeminiSettings() {
        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: t('Gemini Settings') });

        // API Key 设置
        new Setting(container)
            .setName(t('API Key'))
            .setDesc(t('Enter your Gemini API Key and press Enter to validate'))
            .addText(text => text
                .setPlaceholder('AIza...')
                .setValue(this.plugin.settings.ai.gemini?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.gemini) {
                        this.plugin.settings.ai.gemini = {
                            apiKey: '',
                            model: 'gemini-pro'
                        };
                    }
                    this.plugin.settings.ai.gemini.apiKey = value;
                    await this.plugin.saveSettings();
                })
                .inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        const apiKey = this.plugin.settings.ai.gemini?.apiKey;
                        if (!apiKey) {
                            new Notice(t('Please enter your API Key first'));
                            return;
                        }

                        // 显示验证中的提示
                        new Notice(t('Validating API Key...'));

                        // 验证 API Key
                        const isValid = await this.verifyGeminiApiKey(apiKey);
                        if (isValid) {
                            new Notice(t('API Key verification successful!'));
                            // 刷新模型列表
                            modelContainer.empty();
                            await this.createGeminiModelDropdown(modelContainer);
                        } else {
                            new Notice(t('API Key verification failed. Please check your API Key.'));
                        }
                    }
                }));

        // 创建模型设置容器
        const modelContainer = container.createEl('div', {
            cls: 'model-setting-container'
        });

        // 添加模型选择
        this.createGeminiModelDropdown(modelContainer);

        // 自定义 API 地址
        new Setting(container)
            .setName(t('Custom API Address'))
            .setDesc(t('If using a custom API proxy, please enter the full API address'))
            .addText(text => text
                .setPlaceholder('https://generativelanguage.googleapis.com')
                .setValue(this.plugin.settings.ai.gemini?.baseUrl || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.gemini) {
                        this.plugin.settings.ai.gemini = {
                            apiKey: '',
                            model: 'gemini-pro'
                        };
                    }
                    this.plugin.settings.ai.gemini.baseUrl = value;
                    await this.plugin.saveSettings();
                }));
    }

    private displayPromptSettings() {
        // 使用新的 PromptSettingsTab 来处理 Prompt 相关的设置
        const promptSettingsTab = new PromptSettingsTab(this.plugin, this.containerEl);
        promptSettingsTab.display();
    }
}
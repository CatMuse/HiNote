import { App, PluginSettingTab, Setting, TextComponent, Notice, TextAreaComponent, Modal, requestUrl } from 'obsidian';
import { AIProvider, OpenAIModel, AnthropicModel, PluginSettings } from '../types';
import { OllamaService } from '../services/OllamaService';
import { CommentView } from '../CommentView';
import { setIcon } from 'obsidian';  // 添加 setIcon 导入
import { PromptSettingsTab } from './PromptSettingsTab';  // 导入新的 PromptSettingsTab

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

        // AI 服务设置区域
        containerEl.createEl('h2', { text: 'AI 服务设置' });

        // AI 提供商选择
        new Setting(containerEl)
            .setName('AI 服务提供商')
            .setDesc('选择要使用的 AI 服务')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'openai': 'OpenAI',
                    'anthropic': 'Anthropic',
                    'ollama': 'Ollama (本地服务)',
                    'gemini': 'Google Gemini'
                })
                .setValue(this.plugin.settings.ai.provider)
                .onChange(async (value: AIProvider) => {
                    this.plugin.settings.ai.provider = value;
                    await this.plugin.saveSettings();

                    // 刷新设置界面以显示相应的配置选项
                    this.display();
                }));

        // 添加分隔线
        containerEl.createEl('hr');

        // 根据选择的提供商显示相应的设置
        switch (this.plugin.settings.ai.provider) {
            case 'openai':
                this.displayOpenAISettings();
                break;
            case 'anthropic':
                this.displayAnthropicSettings();
                break;
            case 'ollama':
                this.displayOllamaSettings();
                break;
            case 'gemini':
                this.displayGeminiSettings();
                break;
        }

        // 添加分隔线
        containerEl.createEl('hr');

        // Prompt 设置区域
        this.displayPromptSettings();
    }

    private createOrUpdateModelDropdown(container: HTMLElement, models?: {id: string, name: string}[]) {
        const defaultOptions = {
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o-mini',
            'gpt-4': 'GPT-4',
            'gpt-4-turbo-preview': 'GPT-4 Turbo',
            'gpt-3.5-turbo': 'GPT-3.5 Turbo'
        };

        return new Setting(container)
            .setName('模型')
            .setDesc('选择要使用的 OpenAI 模型')
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
            throw new Error('Failed to fetch models');
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
            'gpt-3.5-turbo': 'GPT-3.5 Turbo',
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o-mini'
        };
        return nameMap[modelId] || modelId;
    }

    private displayOpenAISettings() {
        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: 'OpenAI 设置' });

        // API Key 设置
        new Setting(container)
            .setName('API Key')
            .setDesc('输入你的 OpenAI API Key')
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
                            new Notice('请先输入 API Key');
                            return;
                        }

                        new Notice('正在验证 API Key...');

                        try {
                            const models = await this.fetchAvailableModels(apiKey);
                            if (models.length > 0) {
                                // 创建或更新模型选择设置
                                const modelContainer = container.querySelector('.model-setting-container');
                                if (modelContainer instanceof HTMLElement) {
                                    modelContainer.empty();
                                    this.createOrUpdateModelDropdown(modelContainer, models);
                                }
                                new Notice('API Key 验证成功！已加载可用模型');
                            } else {
                                new Notice('未找到可用的模型');
                            }
                        } catch (error) {
                            console.error('API Key 验证失败:', error);
                            new Notice('API Key 验证失败，请检查是否正确');
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
            .setName('自定义 API 地址')
            .setDesc('如果使用自定义 API 代理，请输入完整的 API 地址')
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

        container.createEl('h3', { text: 'Anthropic 设置' });

        // 创建模型设置容器（需要在 API Key 验证时使用）
        const modelContainer = container.createEl('div', {
            cls: 'model-setting-container'
        });

        // API Key 设置
        new Setting(container)
            .setName('API Key')
            .setDesc('输入你的 Anthropic API Key')
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
                            new Notice('请先输入 API Key');
                            return;
                        }

                        new Notice('正在验证 API Key...');

                        try {
                            const isValid = await this.verifyAnthropicApiKey(apiKey);
                            if (isValid) {
                                // 创建或更新模型选择设置
                                modelContainer.empty();
                                this.createAnthropicModelDropdown(modelContainer);
                                new Notice('API Key 验证成功！');
                            } else {
                                new Notice('API Key 验证失败，请检查是否正确');
                            }
                        } catch (error) {
                            console.error('API Key 验证失败:', error);
                            new Notice('API Key 验证失败，请检查是否正确');
                        }
                    }
                }));

        // 显示默认的模型选择
        this.createAnthropicModelDropdown(modelContainer);

        // 将模型容器移动到正确的位置
        container.appendChild(modelContainer);

        // 自定义 API 地址
        new Setting(container)
            .setName('自定义 API 地址')
            .setDesc('如果使用自定义 API 代理，请输入完整的 API 地址')
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
            .setName('模型')
            .setDesc('选择要使用的 Anthropic 模型')
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

        container.createEl('h3', { text: 'Ollama Settings' });

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
            .setName('Server Address')
            .setDesc('Ollama server address (default: http://localhost:11434)')
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
                .setButtonText('Test Connection')
                .onClick(async () => {
                    const host = this.plugin.settings.ai.ollama?.host || defaultHost;
                    try {
                        const ollamaService = new OllamaService(host);
                        const isConnected = await ollamaService.testConnection();
                        if (isConnected) {
                            new Notice('Successfully connected to Ollama service');
                            // Try to load models
                            const models = await ollamaService.listModels();
                            if (models.length > 0) {
                                // Clear existing model selection before updating
                                modelContainer.empty();
                                this.updateOllamaModelDropdown(modelContainer, models);
                            } else {
                                new Notice('No models found. Please download models using "ollama pull"');
                                this.showDefaultOllamaModels(modelContainer);
                            }
                        } else {
                            new Notice('Could not connect to Ollama service');
                            this.showDefaultOllamaModels(modelContainer);
                        }
                    } catch (error) {
                        console.error('Ollama connection error:', error);
                        new Notice('Failed to connect to Ollama service. Please check the server address.');
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
            .setName('Model')
            .setDesc('Currently selected model (Test connection to see all available models)')
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
            .setName('Model')
            .setDesc(savedModels.length 
                ? 'Select a model to use' 
                : 'No models available. Please click "Test Connection" to load models')
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
                        .addOption('', 'No models available')
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
            .setName('Model')
            .setDesc('Select a model to use')
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
                url: `${baseUrl}/v1/models/gemini-pro?key=${apiKey}`,
                method: 'GET'
            });
            return response.status === 200;
        } catch (error) {
            console.error('Error verifying Gemini API key:', error);
            return false;
        }
    }

    private getDefaultGeminiModels(): {id: string, name: string}[] {
        return [
            { id: 'gemini-pro', name: 'Gemini Pro' },
            { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' }
        ];
    }

    private displayGeminiSettings() {
        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: 'Google Gemini 设置' });

        // 创建模型设置容器
        const modelContainer = container.createEl('div', {
            cls: 'model-setting-container'
        });

        // API Key 设置
        new Setting(container)
            .setName('API Key')
            .setDesc('输入你的 Google Gemini API Key')
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
                            new Notice('请先输入 API Key');
                            return;
                        }

                        // 显示验证中的提示
                        new Notice('正在验证 API Key...');

                        // 验证 API Key
                        const isValid = await this.verifyGeminiApiKey(apiKey);
                        if (isValid) {
                            new Notice('API Key 验证成功！');
                            // 刷新模型列表
                            this.createGeminiModelDropdown(modelContainer);
                        } else {
                            new Notice('API Key 验证失败，请检查后重试');
                        }
                    }
                }));

        // 添加模型选择
        this.createGeminiModelDropdown(modelContainer);

        // 自定义 API 地址
        new Setting(container)
            .setName('自定义 API 地址')
            .setDesc('如果使用自定义 API 代理，请输入完整的 API 地址')
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

    private createGeminiModelDropdown(container: HTMLElement) {
        const models = this.getDefaultGeminiModels();

        new Setting(container)
            .setName('模型')
            .setDesc('选择要使用的 Gemini 模型')
            .addDropdown(dropdown => {
                // 添加所有可用的模型
                const options: { [key: string]: string } = {};
                models.forEach(model => {
                    options[model.id] = model.name;
                });

                return dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.gemini?.model || 'gemini-pro')
                    .onChange(async (value) => {
                        if (!this.plugin.settings.ai.gemini) {
                            this.plugin.settings.ai.gemini = {
                                apiKey: '',
                                model: value
                            };
                        } else {
                            this.plugin.settings.ai.gemini.model = value;
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    private displayPromptSettings() {
        // 使用新的 PromptSettingsTab 来处理 Prompt 相关的设置
        const promptSettingsTab = new PromptSettingsTab(this.plugin, this.containerEl);
        promptSettingsTab.display();
    }
}
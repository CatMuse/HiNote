import { App, PluginSettingTab as ObsidianSettingTab, Setting, Notice } from 'obsidian';
import { AIProvider, OpenAIModel, AnthropicModel, OllamaModel, PluginSettings } from '../types';
import { AddPromptModal, EditPromptModal } from './PromptModal';
import { OllamaService } from '../services/OllamaService';

export class AISettingTab extends ObsidianSettingTab {
    plugin: any;  // 修改为具体的插件类型
    DEFAULT_SETTINGS: PluginSettings;  // 添加这一行

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
        this.DEFAULT_SETTINGS = plugin.DEFAULT_SETTINGS;  // 从插件实例获取默认设置
        
        // 加载样式
        this.loadStyles();
    }

    private loadStyles() {
        // 创建 style 元素
        const styleEl = document.createElement('style');
        styleEl.id = 'comment-plugin-settings-styles';
        
        // 添加样式内容
        styleEl.textContent = `
            .prompt-settings-container {
                background-color: var(--background-secondary);
                border-radius: 8px;
                padding: 16px;
                margin: 16px 0;
            }
            
            /* 其他样式... */
        `;
        
        // 添加到文档头部
        document.head.appendChild(styleEl);
    }

    // 在组件卸载时移除样式
    hide() {
        document.getElementById('comment-plugin-settings-styles')?.remove();
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
                    'ollama': 'Ollama (本地服务)'
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
        }

        // 添加分隔线
        containerEl.createEl('hr');

        // Prompt 设置区域
        this.displayPromptSettings();
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
                                    new Setting(modelContainer)
                                        .setName('模型')
                                        .setDesc('选择要使用的 OpenAI 模型')
                                        .addDropdown(dropdown => {
                                            // 添加所有可用的模型
                                            const options: {[key: string]: string} = {};
                                            models.forEach(model => {
                                                options[model.id] = model.name;
                                            });
                                            
                                            dropdown
                                                .addOptions(options)
                                                .setValue(this.plugin.settings.ai.openai?.model || 'gpt-3.5-turbo')
                                                .onChange(async (value: OpenAIModel) => {
                                                    if (!this.plugin.settings.ai.openai) {
                                                        this.plugin.settings.ai.openai = {
                                                            apiKey: '',
                                                            model: 'gpt-3.5-turbo'
                                                        };
                                                    }
                                                    this.plugin.settings.ai.openai.model = value;
                                                    await this.plugin.saveSettings();
                                                });
                                        });
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
        new Setting(modelContainer)
            .setName('模型')
            .setDesc('选择要使用的 OpenAI 模型')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'gpt-4o': 'GPT-4o',
                    'gpt-4': 'GPT-4',
                    'gpt-4o-mini': 'GPT-4o-mini'
                })
                .setValue(this.plugin.settings.ai.openai?.model || 'gpt-3.5-turbo')
                .onChange(async (value: OpenAIModel) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {
                            apiKey: '',
                            model: 'gpt-3.5-turbo'
                        };
                    }
                    this.plugin.settings.ai.openai.model = value;
                    await this.plugin.saveSettings();
                }));

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
                            model: 'gpt-3.5-turbo'
                        };
                    }
                    this.plugin.settings.ai.openai.baseUrl = value;
                    await this.plugin.saveSettings();
                }));
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
        };
        return nameMap[modelId] || modelId;
    }

    private createModelDropdown(container: HTMLElement) {
        new Setting(container)
            .setName('模型')
            .setDesc('选择要使用的 OpenAI 模型')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
                    'gpt-4': 'GPT-4',
                    'gpt-4-turbo-preview': 'GPT-4 Turbo'
                })
                .setValue(this.plugin.settings.ai.openai?.model || 'gpt-3.5-turbo')
                .onChange(async (value: OpenAIModel) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {
                            apiKey: '',
                            model: 'gpt-3.5-turbo'
                        };
                    }
                    this.plugin.settings.ai.openai.model = value;
                    await this.plugin.saveSettings();
                }));
    }

    // 更新指定容器中的模型下拉菜单
    private updateModelDropdownInContainer(container: HTMLElement, models: {id: string, name: string}[]) {
        const modelSetting = container.querySelector('.model-setting-container .setting-item') as HTMLElement;
        if (modelSetting) {
            while (modelSetting.firstChild) {
                modelSetting.removeChild(modelSetting.firstChild);
            }
            
            new Setting(modelSetting as HTMLElement)
                .setName('模型')
                .setDesc('选择要使用的 OpenAI 模型')
                .addDropdown(dropdown => {
                    // 添加所有可用的模型
                    const options: {[key: string]: string} = {};
                    models.forEach(model => {
                        options[model.id] = model.name;
                    });
                    
                    dropdown
                        .addOptions(options)
                        .setValue(this.plugin.settings.ai.openai?.model || 'gpt-3.5-turbo')
                        .onChange(async (value: OpenAIModel) => {
                            if (!this.plugin.settings.ai.openai) {
                                this.plugin.settings.ai.openai = {
                                    apiKey: '',
                                    model: 'gpt-3.5-turbo'
                                };
                            }
                            this.plugin.settings.ai.openai.model = value;
                            await this.plugin.saveSettings();
                        });
                });
        }
    }

    private displayAnthropicSettings() {
        const container = this.containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        container.createEl('h3', { text: 'Anthropic 设置' });

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
                            model: 'claude-3-opus'
                        };
                    }
                    this.plugin.settings.ai.anthropic.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // 模型选择
        new Setting(container)
            .setName('模型')
            .setDesc('选择要使用的 Anthropic 模型')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'claude-3-opus': 'Claude 3 Opus',
                    'claude-3-sonnet': 'Claude 3 Sonnet',
                    'claude-3-haiku': 'Claude 3 Haiku'
                })
                .setValue(this.plugin.settings.ai.anthropic?.model || 'claude-3-opus')
                .onChange(async (value: AnthropicModel) => {
                    if (!this.plugin.settings.ai.anthropic) {
                        this.plugin.settings.ai.anthropic = {
                            apiKey: '',
                            model: 'claude-3-opus'
                        };
                    }
                    this.plugin.settings.ai.anthropic.model = value;
                    await this.plugin.saveSettings();
                }));
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
                model: ''  // Don't set a default model until we check what's available
            };
            await this.plugin.saveSettings();
        }

        // Create model container first
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
                                model: ''
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

        // Display model selection based on saved state
        if (this.plugin.settings.ai.ollama?.model) {
            // If we have a saved model, show it first
            this.showSavedModel(modelContainer);
        } else {
            // Only try to load models if we don't have a saved state
            try {
                const ollamaService = new OllamaService(this.plugin.settings.ai.ollama.host);
                const isConnected = await ollamaService.testConnection();
                
                if (isConnected) {
                    const models = await ollamaService.listModels();
                    if (models.length > 0) {
                        this.updateOllamaModelDropdown(modelContainer, models);
                        
                        // Set the first available model as default if none is selected
                        if (!this.plugin.settings.ai.ollama?.model) {
                            this.plugin.settings.ai.ollama.model = models[0];
                            await this.plugin.saveSettings();
                        }
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
                    .onChange(async (value: OllamaModel) => {
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {
                                host: 'http://localhost:11434',
                                model: value
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
        
        new Setting(container)
            .setName('Model')
            .setDesc('No models available. Please download a model using "ollama pull <model>"')
            .addDropdown(dropdown => {
                const options = {
                    'llama2': 'Llama 2',
                    'mistral': 'Mistral',
                    'mixtral': 'Mixtral',
                    'codellama': 'Code Llama',
                    'phi': 'Phi-2',
                    'neural-chat': 'Neural Chat',
                    'starling-lm': 'Starling',
                    'stable-code': 'StableCode'
                };
                
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.ollama?.model || '')
                    .setDisabled(true)
                    .onChange(async (value: OllamaModel) => {
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {
                                host: 'http://localhost:11434',
                                model: value
                            };
                        } else {
                            this.plugin.settings.ai.ollama.model = value;
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    private updateOllamaModelDropdown(container: HTMLElement, models: string[]) {
        container.empty();

        new Setting(container)
            .setName('Model')
            .setDesc('Select an available Ollama model')
            .addDropdown(dropdown => {
                const options: Record<string, string> = {};
                models.forEach(model => {
                    options[model] = this.formatModelName(model);
                });
                
                // Ensure the current model is in the list, or select the first available
                let currentModel = this.plugin.settings.ai.ollama?.model;
                if (!currentModel || !models.includes(currentModel)) {
                    currentModel = models[0];
                    if (this.plugin.settings.ai.ollama) {
                        this.plugin.settings.ai.ollama.model = currentModel;
                        this.plugin.saveSettings();
                    }
                }

                dropdown
                    .addOptions(options)
                    .setValue(currentModel)
                    .onChange(async (value: OllamaModel) => {
                        if (!this.plugin.settings.ai.ollama) {
                            this.plugin.settings.ai.ollama = {
                                host: 'http://localhost:11434',
                                model: value
                            };
                        } else {
                            this.plugin.settings.ai.ollama.model = value;
                        }
                        await this.plugin.saveSettings();
                    });
            });
    }

    private displayPromptSettings() {
        const { containerEl } = this;
        
        // 创建标题和按钮容器
        const headerContainer = containerEl.createEl('div', {
            cls: 'setting-header'
        });

        // 标题和添加按钮容器
        const promptHeader = headerContainer.createEl('div', {
            cls: 'setting-prompt-header'
        });

        // 标题
        promptHeader.createEl('h2', { 
            text: 'Prompt 设置',
            cls: 'setting-header-title'
        });

        // 添加按钮
        const addButton = promptHeader.createEl('button', {
            cls: 'setting-header-button',
            attr: {
                'aria-label': '添加 Prompt'
            }
        });
        addButton.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        `;
        addButton.addEventListener('click', () => {
            const modal = new AddPromptModal(this.app, async (name: string, content: string) => {
                this.plugin.settings.ai.prompts[name] = content;
                await this.plugin.saveSettings();
                this.display();
            });
            modal.open();
        });

        // 显示所有 Prompts
        Object.entries(this.plugin.settings.ai.prompts).forEach(([name, content]) => {
            const promptContainer = containerEl.createEl('div', {
                cls: 'custom-prompt-container'
            });

            new Setting(promptContainer)
                .setName(name)
                .addButton(button => button
                    .setIcon('pencil')
                    .setTooltip('编辑')
                    .onClick(() => {
                        const modal = new EditPromptModal(
                            this.app,
                            name,
                            content as string,
                            async (newName: string, newContent: string) => {
                                if (newName !== name) {
                                    delete this.plugin.settings.ai.prompts[name];
                                }
                                this.plugin.settings.ai.prompts[newName] = newContent;
                                await this.plugin.saveSettings();
                                this.display();
                            }
                        );
                        modal.open();
                    }))
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip('删除')
                    .onClick(async () => {
                        delete this.plugin.settings.ai.prompts[name];
                        await this.plugin.saveSettings();
                        this.display();
                    }));

            // 显示 Prompt 内容预览
            const contentPreview = promptContainer.createEl('div', {
                cls: 'custom-prompt-preview',
                text: content as string
            });
        });
    }
} 
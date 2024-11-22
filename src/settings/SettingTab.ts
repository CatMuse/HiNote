import { App, PluginSettingTab as ObsidianSettingTab, Setting } from 'obsidian';
import { AIProvider, OpenAIModel, AnthropicModel, OllamaModel, PluginSettings } from '../types';
import { AddPromptModal, EditPromptModal } from './PromptModal';

export class AISettingTab extends ObsidianSettingTab {
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
            .setDesc('选择要使用的 AI 服务提供商')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'openai': 'OpenAI',
                    'anthropic': 'Anthropic',
                    'ollama': 'Ollama'
                })
                .setValue(this.plugin.settings.ai.provider)
                .onChange(async (value: AIProvider) => {
                    this.plugin.settings.ai.provider = value;
                    await this.plugin.saveSettings();
                    // 刷新设置界面以显示相应的配置选项
                    this.display();
                }));

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

        // Prompt 设置区域
        this.displayPromptSettings();
    }

    private displayOpenAISettings() {
        new Setting(this.containerEl)
            .setName('OpenAI API Key')
            .setDesc('输入你的 OpenAI API Key')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.ai.openai?.apiKey || '')
                .onChange(async (value) => {
                    if (!this.plugin.settings.ai.openai) {
                        this.plugin.settings.ai.openai = {
                            apiKey: '',
                            model: 'gpt-3.5-turbo'
                        };
                    }
                    this.plugin.settings.ai.openai.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // ... 其他 OpenAI 设置
    }

    private displayAnthropicSettings() {
        // 实现 Anthropic 设置
    }

    private displayOllamaSettings() {
        // 实现 Ollama 设置
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
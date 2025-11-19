import { Menu, MenuItem, Notice } from "obsidian";
import { ChatService } from '../../services/ChatService';
import { ChatStateManager } from './ChatStateManager';
import { AIProviderType } from '../../services/ai';
import { AIModel, DEFAULT_SILICONFLOW_MODELS, AIProvider } from '../../types';
import { t } from "../../i18n";

/**
 * 对话模型选择器
 * 负责管理 AI 模型的选择和切换
 */
export class ChatModelSelector {
    private plugin: any;
    private chatService: ChatService;
    private stateManager: ChatStateManager;

    constructor(plugin: any, chatService: ChatService, stateManager: ChatStateManager) {
        this.plugin = plugin;
        this.chatService = chatService;
        this.stateManager = stateManager;
    }

    /**
     * 通用方法：创建模型菜单项
     */
    private createModelMenuItem(
        menu: Menu,
        model: AIModel | { id: string; name: string },
        provider: AIProvider,
        selector: HTMLElement,
        isSelected: boolean
    ): void {
        menu.addItem((item: MenuItem) => {
            item.setTitle(model.name)
                .setChecked(isSelected)
                .onClick(async () => {
                    this.stateManager.setModelState({
                        provider,
                        model: model.id
                    });
                    this.chatService.updateModel(provider, model.id);
                    selector.textContent = this.getCurrentModelName();
                });
        });
    }

    /**
     * 通用方法：处理自定义模型
     */
    private addCustomModelIfExists(
        menu: Menu,
        provider: AIProvider,
        selector: HTMLElement,
        customModel: string | undefined,
        isCustomModel: boolean | undefined
    ): void {
        if (isCustomModel && customModel) {
            menu.addSeparator();
            const modelState = this.stateManager.getModelState();
            
            menu.addItem((item: MenuItem) => {
                item.setTitle(customModel)
                    .setChecked(modelState.model === customModel)
                    .onClick(async () => {
                        this.stateManager.setModelState({
                            provider,
                            model: customModel
                        });
                        this.chatService.updateModel(provider, customModel);
                        selector.textContent = this.getCurrentModelName();
                    });
            });
        }
    }

    /**
     * 通用方法：处理 API 错误
     */
    private handleApiError(providerName: string): void {
        new Notice(t(`Unable to get ${providerName} model list, please check API Key and network connection.`));
    }

    /**
     * 获取当前模型名称
     */
    getCurrentModelName(): string {
        const aiSettings = this.plugin.settings.ai;
        const modelState = this.stateManager.getModelState();
        const provider = modelState.provider || aiSettings.provider;
        
        switch (provider) {
            case 'openai':
                return modelState.model || aiSettings.openai?.model || 'GPT-4';
            case 'anthropic':
                return modelState.model || aiSettings.anthropic?.model || 'Claude-3';
            case 'ollama':
                return modelState.model || aiSettings.ollama?.model || 'Ollama';
            case 'gemini':
                return modelState.model || aiSettings.gemini?.model || 'Gemini Pro';
            case 'deepseek':
                return modelState.model || aiSettings.deepseek?.model || 'Deepseek Chat';
            case 'siliconflow':
                if (aiSettings.siliconflow?.isCustomModel && aiSettings.siliconflow?.model) {
                    return aiSettings.siliconflow.model;
                }
                if (modelState.model) {
                    return modelState.model;
                }
                return aiSettings.siliconflow?.model || 'SiliconFlow';
            case 'custom':
                // 自定义 AI 服务
                if (aiSettings.custom?.name && aiSettings.custom?.model) {
                    return `${aiSettings.custom.name} (${aiSettings.custom.model})`;
                }
                return modelState.model || aiSettings.custom?.model || aiSettings.custom?.name || 'Custom AI';
            default:
                return 'Unknown model';
        }
    }

    /**
     * 显示模型选择器
     */
    async showModelSelector(selector: HTMLElement, e: MouseEvent): Promise<void> {
        const menu = new Menu();
        const aiSettings = this.plugin.settings.ai;

        switch (aiSettings.provider) {
            case 'siliconflow':
                await this.buildSiliconFlowMenu(menu, selector);
                break;
            case 'openai':
                await this.buildOpenAIMenu(menu, selector);
                break;
            case 'anthropic':
                this.buildAnthropicMenu(menu, selector);
                break;
            case 'ollama':
                await this.buildOllamaMenu(menu, selector);
                break;
            case 'gemini':
                await this.buildGeminiMenu(menu, selector);
                break;
            case 'deepseek':
                await this.buildDeepseekMenu(menu, selector);
                break;
            case 'custom':
                this.buildCustomMenu(menu, selector);
                break;
            default:
                new Notice(t('Unknown AI provider'));
                break;
        }

        const rect = selector.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }

    /**
     * 构建 SiliconFlow 模型菜单
     */
    private async buildSiliconFlowMenu(menu: Menu, selector: HTMLElement): Promise<void> {
        try {
            const aiSettings = this.plugin.settings.ai;
            const models = DEFAULT_SILICONFLOW_MODELS;
            const modelState = this.stateManager.getModelState();
            
            models.forEach((model: AIModel) => {
                menu.addItem((item: MenuItem) => {
                    const isSelected = !aiSettings.siliconflow?.isCustomModel && 
                        (modelState.model === model.id || aiSettings.siliconflow?.model === model.id);
                    
                    item.setTitle(model.name)
                        .setChecked(isSelected)
                        .onClick(async () => {
                            if (!aiSettings.siliconflow) {
                                aiSettings.siliconflow = { model: model.id, isCustomModel: false };
                            } else {
                                aiSettings.siliconflow.model = model.id;
                                aiSettings.siliconflow.isCustomModel = false;
                            }
                            
                            this.stateManager.setModelState({
                                provider: 'siliconflow',
                                model: model.id
                            });
                            
                            this.chatService.updateModel('siliconflow', model.id);
                            await this.plugin.saveSettings();
                            selector.textContent = model.name;
                        });
                });
            });

            if (aiSettings.siliconflow?.isCustomModel && aiSettings.siliconflow?.model) {
                menu.addSeparator();
                
                const customModelId = aiSettings.siliconflow.model;
                menu.addItem((item: MenuItem) => {
                    const isSelected = aiSettings.siliconflow?.isCustomModel && 
                        (modelState.model === customModelId || aiSettings.siliconflow?.model === customModelId);
                    
                    item.setTitle(customModelId)
                        .setChecked(isSelected)
                        .onClick(async () => {
                            if (!aiSettings.siliconflow) {
                                aiSettings.siliconflow = { model: customModelId, isCustomModel: true };
                            } else {
                                aiSettings.siliconflow.model = customModelId;
                                aiSettings.siliconflow.isCustomModel = true;
                            }
                            
                            this.stateManager.setModelState({
                                provider: 'siliconflow',
                                model: customModelId
                            });
                            
                            this.chatService.updateModel('siliconflow', customModelId);
                            await this.plugin.saveSettings();
                            selector.textContent = customModelId;
                        });
                });
            }
        } catch (error) {
            new Notice(t('Unable to get SiliconFlow model list, please check API Key and network connection.'));
        }
    }

    /**
     * 构建 OpenAI 模型菜单
     */
    private async buildOpenAIMenu(menu: Menu, selector: HTMLElement): Promise<void> {
        try {
            const models = await this.chatService.aiService.listModels(AIProviderType.OPENAI);
            const modelState = this.stateManager.getModelState();
            
            const defaultModels = models.filter((model: AIModel) => !model.isCustom);
            const customModels = models.filter((model: AIModel) => model.isCustom);

            // 添加默认模型
            defaultModels.forEach((model: AIModel) => {
                this.createModelMenuItem(menu, model, 'openai', selector, modelState.model === model.id);
            });

            // 添加自定义模型
            if (customModels.length > 0) {
                menu.addSeparator();
                customModels.forEach((model: AIModel) => {
                    this.createModelMenuItem(menu, model, 'openai', selector, modelState.model === model.id);
                });
            }
        } catch (error) {
            this.handleApiError('OpenAI');
        }
    }

    /**
     * 构建 Anthropic 模型菜单
     */
    private buildAnthropicMenu(menu: Menu, selector: HTMLElement): void {
        const aiSettings = this.plugin.settings.ai;
        const anthropicModels = [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ];
        
        anthropicModels.forEach(model => {
            menu.addItem((item: MenuItem) => {
                item.setTitle(model)
                    .setChecked(aiSettings.anthropic?.model === model)
                    .onClick(async () => {
                        if (!aiSettings.anthropic) aiSettings.anthropic = { apiKey: '', model: model };
                        aiSettings.anthropic.model = model;
                        await this.plugin.saveSettings();
                        selector.textContent = this.getCurrentModelName();
                    });
            });
        });
    }

    /**
     * 构建 Ollama 模型菜单
     */
    private async buildOllamaMenu(menu: Menu, selector: HTMLElement): Promise<void> {
        try {
            const aiSettings = this.plugin.settings.ai;
            const models = await this.chatService.aiService.listModels(AIProviderType.OLLAMA);
            
            models.forEach((model: AIModel) => {
                this.createModelMenuItem(menu, model, 'ollama', selector, aiSettings.ollama?.model === model.id);
            });
        } catch (error) {
            new Notice(t('Unable to access the Ollama model, please check the service.'));
        }
    }

    /**
     * 构建 Gemini 模型菜单
     */
    private async buildGeminiMenu(menu: Menu, selector: HTMLElement): Promise<void> {
        try {
            const aiSettings = this.plugin.settings.ai;
            const models = await this.chatService.aiService.listModels(AIProviderType.GEMINI);
            
            // 添加默认模型
            models.forEach((model: AIModel) => {
                this.createModelMenuItem(menu, model, 'gemini', selector, aiSettings.gemini?.model === model.id);
            });

            // 添加自定义模型
            this.addCustomModelIfExists(
                menu,
                'gemini',
                selector,
                aiSettings.gemini?.model,
                aiSettings.gemini?.isCustomModel
            );
        } catch (error) {
            this.handleApiError('Gemini');
        }
    }

    /**
     * 构建 Deepseek 模型菜单
     */
    private async buildDeepseekMenu(menu: Menu, selector: HTMLElement): Promise<void> {
        try {
            const aiSettings = this.plugin.settings.ai;
            const models = await this.chatService.aiService.listModels(AIProviderType.DEEPSEEK);
            
            // 添加默认模型
            models.forEach((model: { id: string, name: string }) => {
                this.createModelMenuItem(menu, model, 'deepseek', selector, aiSettings.deepseek?.model === model.id);
            });

            // 添加自定义模型
            this.addCustomModelIfExists(
                menu,
                'deepseek',
                selector,
                aiSettings.deepseek?.model,
                aiSettings.deepseek?.isCustomModel
            );
        } catch (error) {
            this.handleApiError('Deepseek');
        }
    }

    /**
     * 构建自定义 AI 服务菜单
     */
    private buildCustomMenu(menu: Menu, selector: HTMLElement): void {
        const aiSettings = this.plugin.settings.ai;
        const modelState = this.stateManager.getModelState();

        if (!aiSettings.custom) {
            new Notice(t('Custom AI service not configured'));
            return;
        }

        // 显示当前配置的模型
        const customServiceName = aiSettings.custom.name || 'Custom AI';
        const currentModel = aiSettings.custom.model || 'No model configured';

        menu.addItem((item: MenuItem) => {
            item.setTitle(`${customServiceName}: ${currentModel}`)
                .setChecked(true)
                .onClick(async () => {
                    // 自定义服务通常只有一个模型配置，点击后刷新显示
                    selector.textContent = this.getCurrentModelName();
                });
        });

        // 如果有自定义模型历史，也显示出来
        if (aiSettings.custom.isCustomModel && aiSettings.custom.lastCustomModel) {
            menu.addSeparator();
            menu.addItem((item: MenuItem) => {
                item.setTitle(`Last: ${aiSettings.custom?.lastCustomModel}`)
                    .onClick(async () => {
                        if (aiSettings.custom && aiSettings.custom.lastCustomModel) {
                            aiSettings.custom.model = aiSettings.custom.lastCustomModel;
                            await this.plugin.saveSettings();
                            selector.textContent = this.getCurrentModelName();
                        }
                    });
            });
        }

        // 添加提示信息
        menu.addSeparator();
        menu.addItem((item: MenuItem) => {
            item.setTitle(t('Configure in settings'))
                .setDisabled(true);
        });
    }
}

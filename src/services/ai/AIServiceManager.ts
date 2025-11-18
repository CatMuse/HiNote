/**
 * AI 服务管理器
 * 提供统一的 AI 服务访问接口，替代旧的 AIService
 */

import { AIMessage, AIModel, AIProviderType } from './BaseAIService';
import { AISettings } from '../../types';
import { AIServiceRegistry } from './AIServiceRegistry';
import {
    OpenAIServiceFactory,
    AnthropicServiceFactory,
    GeminiServiceFactory,
    DeepseekServiceFactory,
    SiliconFlowServiceFactory,
    OllamaServiceFactory,
    CustomAIServiceFactory
} from './factories';

export class AIServiceManager {
    private registry: AIServiceRegistry;
    private currentProvider: AIProviderType;
    private settings: AISettings;
    
    constructor(settings: AISettings) {
        this.settings = settings;
        this.registry = new AIServiceRegistry();
        this.currentProvider = this.parseProvider(settings.provider);
        
        // 注册所有服务工厂
        this.registerAllServices();
    }
    
    /**
     * 注册所有 AI 服务
     */
    private registerAllServices(): void {
        this.registry.register(new OpenAIServiceFactory());
        this.registry.register(new AnthropicServiceFactory());
        this.registry.register(new GeminiServiceFactory());
        this.registry.register(new DeepseekServiceFactory());
        this.registry.register(new SiliconFlowServiceFactory());
        this.registry.register(new OllamaServiceFactory());
        this.registry.register(new CustomAIServiceFactory());
    }
    
    /**
     * 获取当前服务实例
     */
    private getCurrentService() {
        return this.registry.getService(this.currentProvider, this.settings);
    }
    
    /**
     * 生成响应（处理 Prompt 模板）
     */
    async generateResponse(prompt: string, highlight: string, comment?: string): Promise<string> {
        const processedPrompt = this.processPrompt(prompt, highlight, comment);
        return await this.getCurrentService().generateResponse(processedPrompt);
    }
    
    /**
     * 多轮对话
     */
    async chat(messages: AIMessage[]): Promise<string> {
        return await this.getCurrentService().chat(messages);
    }
    
    /**
     * 测试连接
     */
    async testConnection(provider?: AIProviderType): Promise<boolean> {
        const targetProvider = provider || this.currentProvider;
        try {
            const service = this.registry.getService(targetProvider, this.settings);
            return await service.testConnection();
        } catch (error) {
            return false;
        }
    }
    
    /**
     * 更新模型
     */
    updateModel(provider: AIProviderType, model: string): void {
        // 清除缓存，下次获取时会使用新模型
        this.registry.clearCache(provider);
        
        // 更新设置中的模型
        switch (provider) {
            case AIProviderType.OPENAI:
                if (this.settings.openai) this.settings.openai.model = model;
                break;
            case AIProviderType.ANTHROPIC:
                if (this.settings.anthropic) this.settings.anthropic.model = model;
                break;
            case AIProviderType.GEMINI:
                if (this.settings.gemini) this.settings.gemini.model = model;
                break;
            case AIProviderType.DEEPSEEK:
                if (this.settings.deepseek) this.settings.deepseek.model = model;
                break;
            case AIProviderType.SILICONFLOW:
                if (this.settings.siliconflow) this.settings.siliconflow.model = model;
                break;
            case AIProviderType.OLLAMA:
                if (this.settings.ollama) this.settings.ollama.model = model;
                break;
            case AIProviderType.CUSTOM:
                if (this.settings.custom) this.settings.custom.model = model;
                break;
        }
    }
    
    /**
     * 列出模型
     */
    async listModels(provider?: AIProviderType): Promise<AIModel[]> {
        const targetProvider = provider || this.currentProvider;
        try {
            const service = this.registry.getService(targetProvider, this.settings);
            return await service.listModels();
        } catch (error) {
            console.error(`Failed to list models for ${targetProvider}:`, error);
            return [];
        }
    }
    
    /**
     * 切换提供商
     */
    switchProvider(provider: AIProviderType): void {
        this.currentProvider = provider;
        this.settings.provider = provider;
    }
    
    /**
     * 获取当前提供商
     */
    getCurrentProvider(): AIProviderType {
        return this.currentProvider;
    }
    
    /**
     * 获取所有已注册的提供商
     */
    getRegisteredProviders(): AIProviderType[] {
        return this.registry.getRegisteredProviders();
    }
    
    /**
     * 处理 Prompt 模板
     * 替换 {{highlight}} 和 {{comment}} 占位符
     */
    private processPrompt(prompt: string, highlight: string, comment?: string): string {
        let processed = prompt.replace('{{highlight}}', highlight);
        if (comment) {
            processed = processed.replace('{{comment}}', comment);
        }
        return processed;
    }
    
    /**
     * 解析提供商类型
     */
    private parseProvider(provider: string): AIProviderType {
        const providerMap: Record<string, AIProviderType> = {
            'openai': AIProviderType.OPENAI,
            'anthropic': AIProviderType.ANTHROPIC,
            'gemini': AIProviderType.GEMINI,
            'deepseek': AIProviderType.DEEPSEEK,
            'siliconflow': AIProviderType.SILICONFLOW,
            'ollama': AIProviderType.OLLAMA,
            'custom': AIProviderType.CUSTOM
        };
        return providerMap[provider] || AIProviderType.OPENAI;
    }
    
    /**
     * 更新设置
     * 当设置变更时调用，清除所有缓存
     */
    updateSettings(settings: AISettings): void {
        this.settings = settings;
        this.currentProvider = this.parseProvider(settings.provider);
        this.registry.clearCache();
    }
}

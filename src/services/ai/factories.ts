import type { SecretStorage } from 'obsidian';
import { readApiKey } from './AISecrets';
/**
 * AI 服务工厂集合
 * 为每个 AI 服务提供工厂实现
 */

import { IAIService, IAIServiceFactory, AIProviderType, AIServiceError } from './BaseAIService';
import type { AIMessage, AIModel } from './BaseAIService';
import type { AISettings } from '../../types/ai';
import { OpenAIService } from './OpenAIService';
import { AnthropicService } from './AnthropicService';
import { GeminiService } from './GeminiService';
import { DeepseekService } from './DeepseekService';
import { SiliconFlowService } from './SiliconFlowService';
import { OllamaService } from './OllamaService';
import { CustomAIService } from './CustomAIService';

/**
 * OpenAI 服务工厂
 */
export class OpenAIServiceFactory implements IAIServiceFactory {
    constructor(private secrets: SecretStorage) {}

    getProviderType(): AIProviderType {
        return AIProviderType.OPENAI;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.OPENAI;
    }

    create(settings: AISettings): IAIService {
        const apiKey = readApiKey(this.secrets, settings.openai?.apiKeySecretId);
        if (!settings.openai || !apiKey || !settings.openai.model) {
            throw AIServiceError.notConfigured(AIProviderType.OPENAI, 'API key or model not configured');
        }

        return new OpenAIService(
            apiKey,
            settings.openai.model || 'gpt-4o',
            settings.openai.baseUrl
        );
    }
}

/**
 * Anthropic 服务工厂
 */
export class AnthropicServiceFactory implements IAIServiceFactory {
    constructor(private secrets: SecretStorage) {}

    getProviderType(): AIProviderType {
        return AIProviderType.ANTHROPIC;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.ANTHROPIC;
    }

    create(settings: AISettings): IAIService {
        const apiKey = readApiKey(this.secrets, settings.anthropic?.apiKeySecretId);
        if (!settings.anthropic || !apiKey || !settings.anthropic.model) {
            throw AIServiceError.notConfigured(AIProviderType.ANTHROPIC, 'API key or model not configured');
        }

        return new AnthropicService(
            apiKey,
            settings.anthropic.apiAddress,
            settings.anthropic.model
        );
    }
}

/**
 * Gemini 服务工厂
 */
export class GeminiServiceFactory implements IAIServiceFactory {
    constructor(private secrets: SecretStorage) {}

    getProviderType(): AIProviderType {
        return AIProviderType.GEMINI;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.GEMINI;
    }

    create(settings: AISettings): IAIService {
        const apiKey = readApiKey(this.secrets, settings.gemini?.apiKeySecretId);
        if (!settings.gemini || !apiKey || !settings.gemini.model) {
            throw AIServiceError.notConfigured(AIProviderType.GEMINI, 'API key or model not configured');
        }

        return new GeminiService(
            apiKey,
            settings.gemini.model || 'gemini-2.5-flash',
            settings.gemini.baseUrl
        );
    }
}

/**
 * Deepseek 服务工厂
 */
export class DeepseekServiceFactory implements IAIServiceFactory {
    constructor(private secrets: SecretStorage) {}

    getProviderType(): AIProviderType {
        return AIProviderType.DEEPSEEK;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.DEEPSEEK;
    }

    create(settings: AISettings): IAIService {
        const apiKey = readApiKey(this.secrets, settings.deepseek?.apiKeySecretId);
        if (!settings.deepseek || !apiKey || !settings.deepseek.model) {
            throw AIServiceError.notConfigured(AIProviderType.DEEPSEEK, 'API key or model not configured');
        }

        return new DeepseekService(
            apiKey,
            settings.deepseek.model || 'deepseek-chat',
            settings.deepseek.baseUrl
        );
    }
}

/**
 * SiliconFlow 服务工厂
 */
export class SiliconFlowServiceFactory implements IAIServiceFactory {
    constructor(private secrets: SecretStorage) {}

    getProviderType(): AIProviderType {
        return AIProviderType.SILICONFLOW;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.SILICONFLOW;
    }

    create(settings: AISettings): IAIService {
        const apiKey = readApiKey(this.secrets, settings.siliconflow?.apiKeySecretId);
        if (!settings.siliconflow || !apiKey || !settings.siliconflow.model) {
            throw AIServiceError.notConfigured(AIProviderType.SILICONFLOW, 'API key or model not configured');
        }

        return new SiliconFlowService(apiKey, settings.siliconflow.model, settings.siliconflow.baseUrl);
    }
}

/**
 * Ollama 服务工厂
 */
export class OllamaServiceFactory implements IAIServiceFactory {
    getProviderType(): AIProviderType {
        return AIProviderType.OLLAMA;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.OLLAMA;
    }

    create(settings: AISettings): IAIService {
        if (!settings.ollama?.host) {
            throw AIServiceError.notConfigured(AIProviderType.OLLAMA, 'Host not configured');
        }

        // Ollama 需要适配器，因为它的接口不同
        return new OllamaServiceAdapter(
            settings.ollama.host,
            settings.ollama.model || ''
        );
    }
}

/**
 * Custom 服务工厂
 */
export class CustomAIServiceFactory implements IAIServiceFactory {
    constructor(private secrets: SecretStorage) {}

    getProviderType(): AIProviderType {
        return AIProviderType.CUSTOM;
    }

    supports(provider: AIProviderType): boolean {
        return provider === AIProviderType.CUSTOM;
    }

    create(settings: AISettings): IAIService {
        const apiKey = readApiKey(this.secrets, settings.custom?.apiKeySecretId);
        if (!settings.custom || !apiKey || !settings.custom?.baseUrl || !settings.custom?.model) {
            throw AIServiceError.notConfigured(
                AIProviderType.CUSTOM,
                'API key, base URL, or model not configured'
            );
        }

        return new CustomAIService(
            apiKey,
            settings.custom.baseUrl,
            settings.custom.model,
            settings.custom.headers,
            settings.custom.apiType || settings.custom.detectedApiType
        );
    }
}

/**
 * Ollama 服务适配器
 * 将 OllamaService 适配为 IAIService 接口
 */
class OllamaServiceAdapter implements IAIService {
    private service: OllamaService;
    private model: string;

    constructor(host: string, model: string) {
        this.service = new OllamaService(host);
        this.model = model;
    }

    async chat(messages: AIMessage[]): Promise<string> {
        if (!this.model) {
            throw AIServiceError.notConfigured(AIProviderType.OLLAMA, 'Model not configured');
        }
        return await this.service.chat(this.model, messages);
    }

    async generateResponse(prompt: string): Promise<string> {
        if (!this.model) {
            throw AIServiceError.notConfigured(AIProviderType.OLLAMA, 'Model not configured');
        }
        return await this.service.generateCompletion(this.model, prompt);
    }

    async testConnection(): Promise<boolean> {
        return await this.service.testConnection();
    }

    updateModel(model: string): void {
        this.model = model;
    }

    async listModels(): Promise<AIModel[]> {
        const models = await this.service.listModels();
        return models.map(name => ({ id: name, name }));
    }

    getProviderType(): AIProviderType {
        return AIProviderType.OLLAMA;
    }

    isConfigured(): boolean {
        return !!this.model;
    }
}

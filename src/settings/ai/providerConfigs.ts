import {
    AnthropicService,
    DeepseekService,
    GeminiService,
    IAIService,
    OpenAIService,
    SiliconFlowService
} from '../../services/ai';
import type { AIProvider } from '../../types/ai';
export interface StandardAIProviderConfig {
    provider: Exclude<AIProvider, 'ollama' | 'custom'>;
    providerUrlKey?: string;
    heading: string;
    defaultBaseUrl: string;
    createService: (options: {
        apiKey: string;
        model: string;
        baseUrl: string;
    }) => IAIService;
}

export const STANDARD_AI_PROVIDER_CONFIGS: Record<StandardAIProviderConfig['provider'], StandardAIProviderConfig> = {
    openai: {
        provider: 'openai',
        heading: 'OpenAI service',
        providerUrlKey: 'baseUrl',
        defaultBaseUrl: 'https://api.openai.com/v1',
        createService: ({ apiKey, model, baseUrl }) => new OpenAIService(apiKey, model, baseUrl)
    },
    anthropic: {
        provider: 'anthropic',
        heading: 'Anthropic service',
        providerUrlKey: 'apiAddress',
        defaultBaseUrl: 'https://api.anthropic.com',
        createService: ({ apiKey, model, baseUrl }) => new AnthropicService(apiKey, baseUrl, model)
    },
    gemini: {
        provider: 'gemini',
        heading: 'Gemini service',
        providerUrlKey: 'baseUrl',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
        createService: ({ apiKey, model, baseUrl }) => new GeminiService(apiKey, model, baseUrl)
    },
    deepseek: {
        provider: 'deepseek',
        heading: 'Deepseek service',
        providerUrlKey: 'baseUrl',
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        createService: ({ apiKey, model, baseUrl }) => new DeepseekService(apiKey, model, baseUrl)
    },
    siliconflow: {
        provider: 'siliconflow',
        heading: 'SiliconFlow service',
        providerUrlKey: 'baseUrl',
        defaultBaseUrl: 'https://api.siliconflow.cn/v1',
        createService: ({ apiKey, model, baseUrl }) => new SiliconFlowService(apiKey, model, baseUrl)
    }
};

import type { AIModel as AIModelBase, AIProviderType, AIMessage } from '../services/ai';

export type { AIModelBase as AIModel, AIProviderType, AIMessage };

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'deepseek' | 'siliconflow' | 'custom';
export interface AISettings {
    provider: AIProvider;
    openai?: {
        apiKeySecretId: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    siliconflow?: {
        apiKeySecretId: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    anthropic?: {
        apiKeySecretId: string;
        model: string;
        availableModels?: string[];
        apiAddress?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    ollama?: {
        host: string;
        model: string;
        availableModels?: string[];
    };
    gemini?: {
        apiKeySecretId: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
    };
    deepseek?: {
        apiKeySecretId: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    custom?: {
        name: string;
        apiKeySecretId: string;
        baseUrl: string;
        model: string;
        apiType?: 'openai' | 'anthropic' | 'gemini';
        detectedApiType?: 'openai' | 'anthropic' | 'gemini';
        headers?: Record<string, string>;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    prompts: Record<string, string>;
}

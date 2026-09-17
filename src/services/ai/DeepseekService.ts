import { discoverModels, apiRoot } from './ModelDiscovery';
import { AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';
import { OpenAICompatibleService } from './OpenAICompatibleService';

/**
 * Deepseek AI 服务
 * 使用 OpenAI 兼容的 API 格式
 */
export class DeepseekService extends OpenAICompatibleService {
    constructor(
        apiKey: string,
        model: string = 'deepseek-chat',
        baseUrl?: string
    ) {
        const config: AIServiceConfig = {
            apiKey,
            model,
            baseUrl,
            temperature: 0.7,
            maxTokens: 4096
        };
        super(config);
    }

    protected getDefaultBaseUrl(): string {
        return 'https://api.deepseek.com/v1';
    }

    getProviderType(): AIProviderType {
        return AIProviderType.DEEPSEEK;
    }

    async listModels(): Promise<AIModel[]> {
        return discoverModels(this.baseUrl, 'openai', this.buildHeaders());
    }
}

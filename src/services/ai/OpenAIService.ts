import { discoverModels } from './ModelDiscovery';
import { AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';
import { OpenAICompatibleService } from './OpenAICompatibleService';

/**
 * OpenAI AI 服务
 * 支持 GPT-4o, GPT-4o-mini, GPT-o1 等模型
 */
export class OpenAIService extends OpenAICompatibleService {
    constructor(
        apiKey: string,
        model = 'gpt-4o',
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
        return 'https://api.openai.com/v1';
    }

    getProviderType(): AIProviderType {
        return AIProviderType.OPENAI;
    }

    async listModels(): Promise<AIModel[]> {
        return discoverModels(this.baseUrl, 'openai', this.buildHeaders());
    }
}

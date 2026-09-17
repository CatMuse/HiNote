import { discoverModels, apiRoot } from './ModelDiscovery';
import { AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';
import { OpenAICompatibleService } from './OpenAICompatibleService';

interface SiliconFlowModelsResponse {
    data: Array<{
        id: string;
    }>;
}

/**
 * SiliconFlow AI 服务
 * 使用 OpenAI 兼容的 API 格式
 */
export class SiliconFlowService extends OpenAICompatibleService {
    constructor(apiKey: string, model: string = 'deepseek-ai/DeepSeek-V3', baseUrl?: string) {
        if (!apiKey) {
            throw new Error('SiliconFlow API key is required');
        }

        const config: AIServiceConfig = {
            apiKey,
            model,
            baseUrl,
            temperature: 0.7,
            maxTokens: 2048
        };
        super(config);
    }

    protected getDefaultBaseUrl(): string {
        return 'https://api.siliconflow.cn/v1';
    }

    protected getChatOptions(): Record<string, unknown> {
        return {
            stream: false
        };
    }

    protected getInvalidResponseMessage(): string {
        return 'Unexpected API response format from SiliconFlow';
    }

    getProviderType(): AIProviderType {
        return AIProviderType.SILICONFLOW;
    }

    /**
     * 列出可用的模型
     */
    async listModels(): Promise<AIModel[]> {
        return discoverModels(this.baseUrl, 'openai', this.buildHeaders());
    }
}

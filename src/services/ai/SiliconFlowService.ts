import { AISettings } from '../../types';
import { BaseAIService, AIMessage, AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';
import { BaseHTTPClient } from './BaseHTTPClient';

interface SiliconFlowResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

interface SiliconFlowModelsResponse {
    data: Array<{
        id: string;
    }>;
}

/**
 * SiliconFlow AI 服务
 * 使用 OpenAI 兼容的 API 格式
 */
export class SiliconFlowService extends BaseAIService {
    constructor(settings: AISettings) {
        if (!settings.siliconflow?.apiKey) {
            throw new Error('SiliconFlow API key is required');
        }

        const config: AIServiceConfig = {
            apiKey: settings.siliconflow.apiKey,
            model: settings.siliconflow.model || 'deepseek-ai/DeepSeek-V3',
            baseUrl: settings.siliconflow.baseUrl,
            temperature: 0.7,
            maxTokens: 2048
        };
        super(config);
    }

    protected getDefaultBaseUrl(): string {
        return 'https://api.siliconflow.cn/v1';
    }

    protected getEndpoint(): string {
        return '/chat/completions';
    }

    protected formatRequestBody(messages: AIMessage[]): any {
        return {
            model: this.model,
            messages: messages,
            stream: false
        };
    }

    protected parseResponse(response: SiliconFlowResponse): string {
        if (!response.choices?.[0]?.message?.content) {
            throw new Error('Unexpected API response format from SiliconFlow');
        }
        return response.choices[0].message.content;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.SILICONFLOW;
    }

    /**
     * 列出可用的模型
     */
    async listModels(): Promise<AIModel[]> {
        try {
            const response = await this.httpClient.request<SiliconFlowModelsResponse>({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: this.buildHeaders()
            });

            return response.data.map((model: { id: string }) => ({
                id: model.id,
                name: model.id.split('/').pop() || model.id,
                isCustom: false
            }));
        } catch (error) {
            throw this.handleError(error);
        }
    }
}

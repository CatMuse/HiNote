import { BaseAIService, AIMessage, AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';

interface DeepseekResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * Deepseek AI 服务
 * 使用 OpenAI 兼容的 API 格式
 */
export class DeepseekService extends BaseAIService {
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

    protected getEndpoint(): string {
        return '/chat/completions';
    }

    protected formatRequestBody(messages: AIMessage[]): any {
        return {
            model: this.model,
            messages: messages,
            temperature: this.temperature,
            max_tokens: this.maxTokens,
            frequency_penalty: 0,
            presence_penalty: 0
        };
    }

    protected parseResponse(response: DeepseekResponse): string {
        if (!response.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from Deepseek API');
        }
        return response.choices[0].message.content;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.DEEPSEEK;
    }

    async listModels(): Promise<AIModel[]> {
        return [
            { id: 'deepseek-chat', name: 'Deepseek Chat' },
            { id: 'deepseek-reasoner', name: 'Deepseek Reasoner' }
        ];
    }
}

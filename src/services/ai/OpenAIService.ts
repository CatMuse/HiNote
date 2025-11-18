import { BaseAIService, AIMessage, AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';

interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * OpenAI AI 服务
 * 支持 GPT-4o, GPT-4o-mini, GPT-o1 等模型
 */
export class OpenAIService extends BaseAIService {
    constructor(
        apiKey: string,
        model: string = 'gpt-4o',
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

    protected getEndpoint(): string {
        return '/chat/completions';
    }

    protected formatRequestBody(messages: AIMessage[]): any {
        return {
            model: this.model,
            messages: messages,
            temperature: this.temperature,
            max_tokens: this.maxTokens
        };
    }

    protected parseResponse(response: OpenAIResponse): string {
        if (!response.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from OpenAI API');
        }
        return response.choices[0].message.content;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.OPENAI;
    }

    async listModels(): Promise<AIModel[]> {
        return [
            { id: 'gpt-4o', name: 'GPT-4o' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
            { id: 'gpt-o1', name: 'GPT-o1' },
            { id: 'gpt-4', name: 'GPT-4' },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
        ];
    }
}

import { BaseAIService, AIMessage, AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';

interface AnthropicResponse {
    content: Array<{ text: string }>;
}

/**
 * Anthropic Claude AI 服务
 */
export class AnthropicService extends BaseAIService {
    private apiAddress: string;

    constructor(
        apiKey: string,
        apiAddress?: string,
        model?: string
    ) {
        const config: AIServiceConfig = {
            apiKey,
            model: model || 'claude-opus-4-1-20250805',
            baseUrl: apiAddress,
            temperature: 0.7,
            maxTokens: 4096
        };
        super(config);
        this.apiAddress = apiAddress || 'https://api.anthropic.com';
    }

    protected getDefaultBaseUrl(): string {
        return 'https://api.anthropic.com';
    }

    protected getEndpoint(): string {
        return '/v1/messages';
    }

    protected buildHeaders(): Record<string, string> {
        return {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        };
    }

    protected formatRequestBody(messages: AIMessage[]): any {
        return {
            model: this.model,
            max_tokens: this.maxTokens,
            messages: messages
        };
    }

    protected parseResponse(response: AnthropicResponse): string {
        if (!response.content?.[0]?.text) {
            throw new Error('Invalid response format from Anthropic API');
        }
        return response.content[0].text;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.ANTHROPIC;
    }

    async listModels(): Promise<AIModel[]> {
        return [
            { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
            { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
            { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
            { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
        ];
    }
}

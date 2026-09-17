import { discoverModels, apiRoot } from './ModelDiscovery';
import { BaseAIService, AIMessage, AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';

interface AnthropicResponse {
    content: Array<{ text: string }>;
}

/**
 * Anthropic Claude AI 服务
 */
export class AnthropicService extends BaseAIService {

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
    }

    protected getDefaultBaseUrl(): string {
        return 'https://api.anthropic.com';
    }

    protected buildUrl(): string {
        return apiRoot(this.baseUrl, 'anthropic') + '/messages';
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

    protected formatRequestBody(messages: AIMessage[]): Record<string, unknown> {
        return {
            model: this.model,
            max_tokens: this.maxTokens,
            messages: messages
        };
    }

    protected parseResponse(response: unknown): string {
        const data = response as AnthropicResponse;
        if (!data.content?.[0]?.text) {
            throw new Error('Invalid response format from Anthropic API');
        }
        return data.content[0].text;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.ANTHROPIC;
    }

    async listModels(): Promise<AIModel[]> {
        return discoverModels(this.baseUrl, 'anthropic', this.buildHeaders());
    }
}

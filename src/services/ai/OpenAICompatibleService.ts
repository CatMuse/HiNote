import { apiRoot } from './ModelDiscovery';
import { BaseAIService, AIMessage } from './BaseAIService';

interface OpenAICompatibleResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * Base class for providers that implement the OpenAI chat completions shape.
 */
export abstract class OpenAICompatibleService extends BaseAIService {
    protected buildUrl(): string {
        return apiRoot(this.baseUrl, 'openai') + this.getEndpoint();
    }

    protected getEndpoint(): string {
        return '/chat/completions';
    }

    protected formatRequestBody(messages: AIMessage[]): Record<string, unknown> {
        return {
            model: this.model,
            messages,
            ...this.getChatOptions()
        };
    }

    protected parseResponse(response: unknown): string {
        const data = response as OpenAICompatibleResponse;
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error(this.getInvalidResponseMessage());
        }

        return content;
    }

    protected getChatOptions(): Record<string, unknown> {
        return {}; // Let compatible endpoints apply their model-specific defaults.
    }

    protected getInvalidResponseMessage(): string {
        return `Invalid response format from ${this.getProviderType()} API`;
    }
}

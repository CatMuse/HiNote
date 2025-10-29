import { BaseHTTPClient } from './BaseHTTPClient';

interface AnthropicResponse {
    content: Array<{ text: string }>;
}

export class AnthropicService {
    private apiKey: string;
    private apiAddress: string;
    private model: string;
    private httpClient: BaseHTTPClient;

    constructor(apiKey: string, apiAddress?: string, model?: string) {
        this.apiKey = apiKey;
        this.apiAddress = apiAddress || 'https://api.anthropic.com';
        this.model = model || 'claude-opus-4-1-20250805'; // 默认使用最新模型
        this.httpClient = new BaseHTTPClient();
    }

    async generateResponse(prompt: string): Promise<string> {
        try {
            const response = await this.httpClient.request<AnthropicResponse>({
                url: `${this.apiAddress}/v1/messages`,
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    max_tokens: 4096,
                    messages: [{
                        role: 'user',
                        content: prompt
                    }]
                })
            });

            return response.content[0].text;
        } catch (error) {
            throw new Error(`Failed to generate response from Anthropic API: ${error.message}`);
        }
    }

    async testConnection(): Promise<boolean> {
        return await this.httpClient.testConnection({
            url: `${this.apiAddress}/v1/messages`,
            method: 'POST',
            headers: {
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: 1,
                messages: [{
                    role: 'user',
                    content: 'Hi'
                }]
            })
        });
    }
}

import { requestUrl } from 'obsidian';

export class AnthropicService {
    private apiKey: string;
    private apiAddress: string;
    private model: string;

    constructor(apiKey: string, apiAddress?: string, model?: string) {
        this.apiKey = apiKey;
        this.apiAddress = apiAddress || 'https://api.anthropic.com';
        this.model = model || 'claude-3-opus-20240229'; // 默认使用最新模型
    }

    async generateResponse(prompt: string): Promise<string> {
        try {
            const response = await requestUrl({
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

            if (response.status !== 200) {
                throw new Error(`Anthropic API error: ${response.text}`);
            }

            const data = response.json;
            return data.content[0].text;
        } catch (error) {

            throw new Error('Failed to generate response from Anthropic API');
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await requestUrl({
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

            return response.status === 200;
        } catch (error) {

            return false;
        }
    }
}

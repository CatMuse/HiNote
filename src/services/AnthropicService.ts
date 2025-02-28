import { requestUrl } from 'obsidian';

export class AnthropicService {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl?: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl || 'https://api.anthropic.com';
    }

    async generateResponse(prompt: string): Promise<string> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/v1/messages`,
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-opus-20240229',
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
                url: `${this.baseUrl}/v1/messages`,
                method: 'POST',
                headers: {
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-opus-20240229',
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

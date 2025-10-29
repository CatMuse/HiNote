import { BaseHTTPClient } from './BaseHTTPClient';

interface DeepseekResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

export class DeepseekService {
    private baseUrl: string;
    private model: string;
    private httpClient: BaseHTTPClient;

    constructor(
        private apiKey: string,
        model: string = 'deepseek-chat',
        baseUrl?: string
    ) {
        this.model = model;
        this.baseUrl = baseUrl || 'https://api.deepseek.com/v1';
        this.httpClient = new BaseHTTPClient();
    }

    // 更新当前使用的模型
    updateModel(model: string) {
        this.model = model;
    }

    async generateResponse(prompt: string): Promise<string> {
        const messages = [
            { role: 'user', content: prompt }
        ];
        return await this.chat(messages);
    }

    async chat(messages: { role: string, content: string }[]): Promise<string> {
        try {
            const response = await this.httpClient.request<DeepseekResponse>({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: BaseHTTPClient.buildAuthHeaders(this.apiKey),
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 4096,
                    frequency_penalty: 0,
                    presence_penalty: 0
                })
            });

            if (!response.choices?.[0]?.message?.content) {
                throw new Error('Invalid response format from Deepseek API');
            }

            return response.choices[0].message.content;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to generate response from Deepseek API');
        }
    }

    async testConnection(): Promise<boolean> {
        return await this.httpClient.testConnection({
            url: `${this.baseUrl}/chat/completions`,
            method: 'POST',
            headers: BaseHTTPClient.buildAuthHeaders(this.apiKey),
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 10
            })
        });
    }
}

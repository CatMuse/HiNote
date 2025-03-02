import { requestUrl } from 'obsidian';

export class DeepseekService {
    private baseUrl: string;
    private model: string;

    constructor(
        private apiKey: string,
        model: string = 'deepseek-chat',
        baseUrl?: string
    ) {
        this.model = model;
        this.baseUrl = baseUrl || 'https://api.deepseek.com/v1';
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
            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 4096,
                    frequency_penalty: 0,
                    presence_penalty: 0
                })
            });

            if (response.status !== 200) {

                throw new Error(`Deepseek API error (${response.status}): ${response.text}`);
            }

            const data = response.json;
            if (!data.choices?.[0]?.message?.content) {

                throw new Error('Invalid response format from Deepseek API');
            }

            return data.choices[0].message.content;
        } catch (error) {

            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to generate response from Deepseek API');
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            // 使用一个简单的测试消息来验证连接
            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [{ role: 'user', content: 'test' }],
                    max_tokens: 10
                })
            });

            return response.status === 200;
        } catch (error) {

            return false;
        }
    }
}

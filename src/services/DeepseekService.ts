import { requestUrl } from 'obsidian';

export class DeepseekService {
    private baseUrl: string;

    constructor(
        private apiKey: string,
        baseUrl?: string
    ) {
        this.baseUrl = baseUrl || 'https://api.deepseek.com';
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
                    model: 'deepseek-chat',
                    messages: messages,
                    stream: false
                })
            });

            if (response.status !== 200) {
                throw new Error(`Deepseek API request failed: ${response.text}`);
            }

            const data = response.json;
            return data.choices[0].message.content;
        } catch (error) {
            console.error('Error calling Deepseek API:', error);
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.generateResponse('test');
            return true;
        } catch (error) {
            console.error('Deepseek connection test failed:', error);
            return false;
        }
    }
}

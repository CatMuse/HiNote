import { requestUrl } from 'obsidian';

export class GeminiService {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl?: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
    }

    async generateResponse(prompt: string): Promise<string> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/v1/models/gemini-pro:generateContent?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.7
                    }
                })
            });

            if (response.status !== 200) {
                throw new Error(`Gemini API error: ${response.text}`);
            }

            const data = response.json;
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw new Error('Failed to generate response from Gemini API');
        }
    }

    async chat(messages: { role: string, content: string }[]): Promise<string> {
        try {
            // 将 OpenAI 格式的消息转换为 Gemini 格式
            const contents = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            const response = await requestUrl({
                url: `${this.baseUrl}/v1/models/gemini-pro:generateContent?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        maxOutputTokens: 2048,
                        temperature: 0.7
                    }
                })
            });

            if (response.status !== 200) {
                throw new Error(`Gemini API error: ${response.text}`);
            }

            const data = response.json;
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
            throw new Error('Failed to chat with Gemini API');
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/v1/models/gemini-pro?key=${this.apiKey}`,
                method: 'GET'
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }
}

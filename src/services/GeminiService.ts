import { requestUrl } from 'obsidian';

export class GeminiService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(apiKey: string, model: string = 'gemini-pro', baseUrl?: string) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
    }

    // 更新当前使用的模型
    updateModel(model: string) {
        this.model = model;
    }

    async generateResponse(prompt: string): Promise<string> {
        try {
            const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7
                }
            };

            const response = await requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {

                throw new Error(`Gemini API error (${response.status}): ${response.text}`);
            }

            const data = response.json;
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {

                throw new Error('Invalid response format from Gemini API');
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error) {

            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to generate response from Gemini API');
        }
    }

    async chat(messages: { role: string, content: string }[]): Promise<string> {
        try {
            const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
            // 将 OpenAI 格式的消息转换为 Gemini 格式
            const contents = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            const requestBody = {
                contents,
                generationConfig: {
                    maxOutputTokens: 2048,
                    temperature: 0.7
                }
            };

            const response = await requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (response.status !== 200) {

                throw new Error(`Gemini Chat API error (${response.status}): ${response.text}`);
            }

            const data = response.json;
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {

                throw new Error('Invalid response format from Gemini Chat API');
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error) {

            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to chat with Gemini API');
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            const url = `${this.baseUrl}/v1beta/models/${this.model}?key=${this.apiKey}`;
            const response = await requestUrl({
                url,
                method: 'GET'
            });

            if (response.status !== 200) {

            }

            return response.status === 200;
        } catch (error) {

            return false;
        }
    }
}

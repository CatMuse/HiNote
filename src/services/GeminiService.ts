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
                console.error('Gemini API error response:', response.text);
                throw new Error(`Gemini API error (${response.status}): ${response.text}`);
            }

            const data = response.json;
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.error('Unexpected Gemini API response format:', data);
                throw new Error('Invalid response format from Gemini API');
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Error calling Gemini API:', error);
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
                console.error('Gemini Chat API error response:', response.text);
                throw new Error(`Gemini Chat API error (${response.status}): ${response.text}`);
            }

            const data = response.json;
            if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
                console.error('Unexpected Gemini Chat API response format:', data);
                throw new Error('Invalid response format from Gemini Chat API');
            }

            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Error calling Gemini Chat API:', error);
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to chat with Gemini API');
        }
    }

    async listModels(): Promise<{ id: string; name: string }[]> {
        // 返回默认模型列表
        return [
            { id: 'gemini-pro', name: 'Gemini Pro' },
            { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-pro-vision', name: 'Gemini Pro Vision' },
            { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash' },
            { id: 'gemini-exp-1121', name: 'Gemini Exp 1121' },
            { id: 'gemini-exp-1114', name: 'Gemini Exp 1114' },
            { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp' }
        ];
    }

    async testConnection(): Promise<boolean> {
        try {
            const url = `${this.baseUrl}/v1beta/models/${this.model}?key=${this.apiKey}`;
            const response = await requestUrl({
                url,
                method: 'GET'
            });

            if (response.status !== 200) {
                console.error('Gemini API test error response:', response.text);
            }

            return response.status === 200;
        } catch (error) {
            console.error('Error testing Gemini API connection:', error);
            return false;
        }
    }
}

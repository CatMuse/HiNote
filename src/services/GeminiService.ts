import { BaseHTTPClient } from './BaseHTTPClient';

export interface GenerationConfig {
    maxOutputTokens?: number;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: object;
}

interface GeminiResponse {
    candidates: Array<{
        content: {
            parts: Array<{
                text: string;
            }>;
        };
    }>;
}

export class GeminiService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    private httpClient: BaseHTTPClient;

    constructor(apiKey: string, model: string = 'gemini-2.5-flash', baseUrl?: string) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
        this.httpClient = new BaseHTTPClient();
    }

    // 更新当前使用的模型
    updateModel(model: string) {
        this.model = model;
    }

    async generateResponse(prompt: string, config?: GenerationConfig): Promise<string> {
        try {
            const url = `${this.baseUrl}/v1/models/${this.model}:generateContent?key=${this.apiKey}`;
            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    maxOutputTokens: config?.maxOutputTokens || 2048,
                    temperature: config?.temperature || 0.7,
                    ...(config?.responseMimeType && { responseMimeType: config.responseMimeType }),
                    ...(config?.responseSchema && { responseSchema: config.responseSchema })
                }
            };

            const response = await this.httpClient.request<GeminiResponse>({
                url,
                method: 'POST',
                headers: BaseHTTPClient.buildJSONHeaders(),
                body: JSON.stringify(requestBody)
            });

            if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error('Invalid response format from Gemini API');
            }

            return response.candidates[0].content.parts[0].text;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to generate response from Gemini API');
        }
    }

    async chat(messages: { role: string, content: string }[], config?: GenerationConfig): Promise<string> {
        try {
            const url = `${this.baseUrl}/v1/models/${this.model}:generateContent?key=${this.apiKey}`;
            // 将 OpenAI 格式的消息转换为 Gemini 格式
            const contents = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            const requestBody = {
                contents,
                generationConfig: {
                    maxOutputTokens: config?.maxOutputTokens || 2048,
                    temperature: config?.temperature || 0.7,
                    ...(config?.responseMimeType && { responseMimeType: config.responseMimeType }),
                    ...(config?.responseSchema && { responseSchema: config.responseSchema })
                }
            };

            const response = await this.httpClient.request<GeminiResponse>({
                url,
                method: 'POST',
                headers: BaseHTTPClient.buildJSONHeaders(),
                body: JSON.stringify(requestBody)
            });

            if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
                throw new Error('Invalid response format from Gemini Chat API');
            }

            return response.candidates[0].content.parts[0].text;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Failed to chat with Gemini API');
        }
    }

    // 添加 JSON 输出的便捷方法
    async generateJSONResponse(prompt: string, schema?: object): Promise<string> {
        return this.generateResponse(prompt, {
            responseMimeType: "application/json",
            responseSchema: schema
        });
    }

    async chatJSON(messages: { role: string, content: string }[], schema?: object): Promise<string> {
        return this.chat(messages, {
            responseMimeType: "application/json",
            responseSchema: schema
        });
    }

    async testConnection(): Promise<boolean> {
        const url = `${this.baseUrl}/v1/models/${this.model}?key=${this.apiKey}`;
        return await this.httpClient.testConnection({
            url,
            method: 'GET'
        });
    }
}

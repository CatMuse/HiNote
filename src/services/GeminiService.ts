import { requestUrl } from 'obsidian';

export interface GenerationConfig {
    maxOutputTokens?: number;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: object;
}

export class GeminiService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor(apiKey: string, model: string = 'gemini-2.5-flash', baseUrl?: string) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com';
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
        try {
            const url = `${this.baseUrl}/v1/models/${this.model}?key=${this.apiKey}`;
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

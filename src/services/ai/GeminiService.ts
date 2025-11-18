import { BaseAIService, AIMessage, AIServiceConfig, AIProviderType, AIModel } from './BaseAIService';

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

/**
 * Google Gemini AI 服务
 * 使用 Gemini 特定的 API 格式
 */
export class GeminiService extends BaseAIService {
    private generationConfig?: GenerationConfig;

    constructor(apiKey: string, model: string = 'gemini-2.5-flash', baseUrl?: string) {
        const config: AIServiceConfig = {
            apiKey,
            model,
            baseUrl,
            temperature: 0.7,
            maxTokens: 2048
        };
        super(config);
    }

    protected getDefaultBaseUrl(): string {
        return 'https://generativelanguage.googleapis.com';
    }

    protected getEndpoint(): string {
        return `/v1/models/${this.model}:generateContent?key=${this.apiKey}`;
    }

    protected buildHeaders(): Record<string, string> {
        // Gemini 使用 API key 作为 URL 参数，不需要 Authorization header
        return {
            'Content-Type': 'application/json'
        };
    }

    protected formatRequestBody(messages: AIMessage[]): any {
        // 将统一的 AIMessage 格式转换为 Gemini 格式
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        return {
            contents,
            generationConfig: {
                maxOutputTokens: this.generationConfig?.maxOutputTokens || this.maxTokens,
                temperature: this.generationConfig?.temperature || this.temperature,
                ...(this.generationConfig?.responseMimeType && { 
                    responseMimeType: this.generationConfig.responseMimeType 
                }),
                ...(this.generationConfig?.responseSchema && { 
                    responseSchema: this.generationConfig.responseSchema 
                })
            }
        };
    }

    protected parseResponse(response: GeminiResponse): string {
        if (!response.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response format from Gemini API');
        }
        return response.candidates[0].content.parts[0].text;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.GEMINI;
    }

    async listModels(): Promise<AIModel[]> {
        return [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Legacy)' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Legacy)' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Legacy)' }
        ];
    }

    /**
     * 设置生成配置（用于 JSON 输出等特殊需求）
     */
    setGenerationConfig(config: GenerationConfig): void {
        this.generationConfig = config;
    }

    /**
     * 生成响应（支持自定义配置）
     */
    async generateResponse(prompt: string, config?: GenerationConfig): Promise<string> {
        if (config) {
            this.setGenerationConfig(config);
        }
        return super.generateResponse(prompt);
    }

    /**
     * 多轮对话（支持自定义配置）
     */
    async chat(messages: AIMessage[], config?: GenerationConfig): Promise<string> {
        if (config) {
            this.setGenerationConfig(config);
        }
        return super.chat(messages);
    }

    /**
     * JSON 输出的便捷方法
     */
    async generateJSONResponse(prompt: string, schema?: object): Promise<string> {
        return this.generateResponse(prompt, {
            responseMimeType: "application/json",
            responseSchema: schema
        });
    }

    /**
     * JSON 对话的便捷方法
     */
    async chatJSON(messages: AIMessage[], schema?: object): Promise<string> {
        return this.chat(messages, {
            responseMimeType: "application/json",
            responseSchema: schema
        });
    }

    /**
     * 测试连接（覆盖基类方法，使用 Gemini 特定的测试端点）
     */
    async testConnection(): Promise<boolean> {
        const url = `${this.baseUrl}/v1/models/${this.model}?key=${this.apiKey}`;
        return await this.httpClient.testConnection({
            url,
            method: 'GET',
            headers: this.buildHeaders()
        });
    }
}

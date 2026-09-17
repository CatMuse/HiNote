import { discoverModels, apiRoot } from './ModelDiscovery';
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

    protected buildUrl(): string {
        return apiRoot(this.baseUrl, 'gemini') + this.getEndpoint();
    }

    protected buildHeaders(): Record<string, string> {
        return { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey };
    }

    protected getEndpoint(): string {
        return `/models/${this.model.replace(/^models\//, '')}:generateContent`;
    }

    protected formatRequestBody(messages: AIMessage[]): Record<string, unknown> {
        // 将统一的 AIMessage 格式转换为 Gemini 格式
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        return {
            contents,
            ...(this.generationConfig && { generationConfig: this.generationConfig })
        };
    }

    protected parseResponse(response: unknown): string {
        const data = response as GeminiResponse;
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response format from Gemini API');
        }
        return data.candidates[0].content.parts[0].text;
    }

    getProviderType(): AIProviderType {
        return AIProviderType.GEMINI;
    }

    async listModels(): Promise<AIModel[]> {
        return discoverModels(this.baseUrl, 'gemini', this.buildHeaders());
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
        return !!(await this.chat([{ role: 'user', content: 'Reply only OK.' }]));
    }
}

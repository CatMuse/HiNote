import { apiRoot, discoverModels } from './ModelDiscovery';
import { BaseHTTPClient } from './BaseHTTPClient';
import { AIProviderType } from './BaseAIService';
import type { AIModel } from './BaseAIService';

/**
 * API 协议
 */
export type APIType = 'openai' | 'anthropic' | 'gemini';
type CustomAIMessage = { role: string; content: string };

/**
 * OpenAI 兼容格式的响应
 */
interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

/**
 * Anthropic 格式的响应
 */
interface AnthropicResponse {
    content: Array<{
        text: string;
    }>;
}

/**
 * Gemini 格式的响应
 */
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
 * 自定义 AI 服务
 * 使用显式 API 协议，兼容 OpenAI/Anthropic/Gemini 格式
 */
export class CustomAIService {
    private baseUrl: string;
    private model: string;
    private apiType: APIType;
    private customHeaders?: Record<string, string>;
    private httpClient: BaseHTTPClient;

    constructor(
        private apiKey: string,
        baseUrl: string,
        model: string,
        customHeaders?: Record<string, string>,
        apiType: APIType = 'openai'
    ) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // 移除末尾的斜杠
        this.model = model;
        this.customHeaders = customHeaders;
        this.httpClient = new BaseHTTPClient();
        this.apiType = apiType;
    }

    /**
     * 生成响应
     */
    async generateResponse(prompt: string): Promise<string> {
        return await this.chat([{ role: 'user', content: prompt }]);
    }

    /**
     * 聊天接口
     */
    async chat(messages: CustomAIMessage[]): Promise<string> {
        // Use the explicitly selected protocol.
        const apiType = this.apiType;

        // 根据检测到的类型调用相应的方法
        switch (apiType) {
            case 'openai':
                return await this.requestOpenAICompatible(messages);
            case 'anthropic':
                return await this.requestAnthropicCompatible(messages, 4096);
            case 'gemini':
                return await this.requestGeminiCompatible(messages);
            default:
                throw new Error('Unsupported API type');
        }
    }

    private async requestOpenAICompatible(
        messages: CustomAIMessage[],
        extraBody: Record<string, unknown> = {}
    ): Promise<string> {
        const response = await this.httpClient.request<OpenAIResponse>({
            url: this.getOpenAIEndpoint(),
            method: 'POST',
            headers: this.buildHeaders(),
            body: JSON.stringify({
                model: this.model,
                messages,
                ...extraBody
            })
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('Invalid response format from custom AI API');
        }

        return content;
    }

    private async requestAnthropicCompatible(
        messages: CustomAIMessage[],
        maxTokens: number
    ): Promise<string> {
        const response = await this.httpClient.request<AnthropicResponse>({
            url: this.getAnthropicEndpoint(),
            method: 'POST',
            headers: {
                ...this.buildHeaders('ApiKey'),
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                messages,
                max_tokens: maxTokens
            })
        });

        const content = response.content?.[0]?.text;
        if (!content) {
            throw new Error('Invalid response format from custom AI API');
        }

        return content;
    }

    private async requestGeminiCompatible(messages: CustomAIMessage[]): Promise<string> {
        const response = await this.httpClient.request<GeminiResponse>({
            url: this.getGeminiEndpoint(),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.apiKey,
                ...this.customHeaders
            },
            body: JSON.stringify({
                contents: messages.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }))
            })
        });

        const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
            throw new Error('Invalid response format from custom AI API');
        }

        return content;
    }

    private getOpenAIEndpoint(): string {
        return apiRoot(this.baseUrl, 'openai') + '/chat/completions';
    }

    private getAnthropicEndpoint(): string {
        return apiRoot(this.baseUrl, 'anthropic') + '/messages';
    }

    private getGeminiEndpoint(): string {
        return apiRoot(this.baseUrl, 'gemini') + '/models/' + this.model.replace(/^models\//, '') + ':generateContent';
    }

    /**
     * 更新模型
     */
    updateModel(model: string) {
        this.model = model;
    }

    /**
     * 获取提供商类型
     */
    getProviderType(): AIProviderType {
        return AIProviderType.CUSTOM;
    }

    /**
     * 列出可用模型
     */
    async listModels(): Promise<AIModel[]> {
        const protocol = this.apiType || 'openai';
        const headers = protocol === 'gemini'
            ? { 'x-goog-api-key': this.apiKey, ...this.customHeaders }
            : protocol === 'anthropic'
                ? { ...this.buildHeaders('ApiKey'), 'anthropic-version': '2023-06-01' }
                : this.buildHeaders();
        return discoverModels(this.baseUrl, protocol, headers);
    }

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean {
        return !!(this.apiKey && this.baseUrl && this.model);
    }

    /**
     * 测试连接
     */
    async testConnection(): Promise<boolean> {
        return !!(await this.chat([{ role: 'user', content: 'Reply only OK.' }]));
    }

    /**
     * 构建请求头
     */
    private buildHeaders(authType: 'Bearer' | 'ApiKey' = 'Bearer'): Record<string, string> {
        const headers = BaseHTTPClient.buildAuthHeaders(this.apiKey, authType);
        
        // 合并自定义请求头
        if (this.customHeaders) {
            return { ...headers, ...this.customHeaders };
        }
        
        return headers;
    }
}

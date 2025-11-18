import { BaseHTTPClient } from './BaseHTTPClient';
import { 
    IAIService,
    IAIServiceFactory,
    AIMessage, 
    AIServiceConfig, 
    AIProviderType, 
    AIModel,
    AIServiceError,
    AIErrorCode
} from './types';

// 重新导出类型，供其他服务使用
export type { 
    IAIService,
    IAIServiceFactory,
    AIMessage, 
    AIServiceConfig, 
    AIModel
};

export { 
    AIProviderType, 
    AIServiceError,
    AIErrorCode
};

/**
 * AI 服务抽象基类
 * 为所有 AI 服务提供统一的接口和通用功能
 */
export abstract class BaseAIService implements IAIService {
    protected httpClient: BaseHTTPClient;
    protected apiKey: string;
    protected model: string;
    protected baseUrl: string;
    protected temperature: number;
    protected maxTokens: number;

    constructor(config: AIServiceConfig) {
        this.httpClient = new BaseHTTPClient();
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.baseUrl = config.baseUrl || this.getDefaultBaseUrl();
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 2048;
    }

    /**
     * 获取默认的 API 端点 URL
     * 子类必须实现
     */
    protected abstract getDefaultBaseUrl(): string;

    /**
     * 获取 API 端点路径
     * 子类必须实现
     */
    protected abstract getEndpoint(): string;

    /**
     * 格式化请求体
     * 子类必须实现，将统一的消息格式转换为特定 API 的格式
     */
    protected abstract formatRequestBody(messages: AIMessage[]): any;

    /**
     * 解析响应
     * 子类必须实现，从 API 响应中提取文本内容
     */
    protected abstract parseResponse(response: any): string;

    /**
     * 获取提供商类型
     * 子类必须实现
     */
    abstract getProviderType(): AIProviderType;

    /**
     * 列出可用模型
     * 子类必须实现
     */
    abstract listModels(): Promise<AIModel[]>;

    /**
     * 构建请求头
     * 子类可以覆盖以自定义请求头
     */
    protected buildHeaders(): Record<string, string> {
        return BaseHTTPClient.buildAuthHeaders(this.apiKey);
    }

    /**
     * 更新模型
     */
    updateModel(model: string): void {
        this.model = model;
    }

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean {
        return !!(this.apiKey && this.model);
    }

    /**
     * 生成响应（单轮对话）
     */
    async generateResponse(prompt: string): Promise<string> {
        const messages: AIMessage[] = [
            { role: 'user', content: prompt }
        ];
        return await this.chat(messages);
    }

    /**
     * 多轮对话
     * 这是核心方法，所有 AI 服务都使用相同的流程
     */
    async chat(messages: AIMessage[]): Promise<string> {
        try {
            const url = this.buildUrl();
            const requestBody = this.formatRequestBody(messages);
            
            const response = await this.httpClient.request({
                url,
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(requestBody)
            });

            return this.parseResponse(response);
        } catch (error) {
            throw this.handleError(error);
        }
    }

    /**
     * 测试连接
     */
    async testConnection(): Promise<boolean> {
        try {
            const url = this.buildUrl();
            const testMessages: AIMessage[] = [
                { role: 'user', content: 'test' }
            ];
            const requestBody = this.formatRequestBody(testMessages);

            return await this.httpClient.testConnection({
                url,
                method: 'POST',
                headers: this.buildHeaders(),
                body: JSON.stringify(requestBody)
            });
        } catch (error) {
            return false;
        }
    }

    /**
     * 构建完整的 URL
     * 子类可以覆盖以自定义 URL 构建逻辑
     */
    protected buildUrl(): string {
        return `${this.baseUrl}${this.getEndpoint()}`;
    }

    /**
     * 错误处理
     * 将原始错误包装为 AIServiceError
     */
    protected handleError(error: any): AIServiceError {
        // 如果已经是 AIServiceError，直接返回
        if (error instanceof AIServiceError) {
            return error;
        }

        // 判断错误类型
        let code = AIErrorCode.API_ERROR;
        let message = error.message || 'Unknown error';

        if (message.includes('connect') || message.includes('ECONNREFUSED')) {
            code = AIErrorCode.CONNECTION_FAILED;
        } else if (message.includes('rate limit') || message.includes('429')) {
            code = AIErrorCode.RATE_LIMIT;
        } else if (message.includes('401') || message.includes('403') || message.includes('API key')) {
            code = AIErrorCode.INVALID_API_KEY;
        } else if (message.includes('404') || message.includes('model')) {
            code = AIErrorCode.MODEL_NOT_FOUND;
        }

        return new AIServiceError(
            message,
            this.getProviderType(),
            code,
            error instanceof Error ? error : undefined
        );
    }

    /**
     * 验证响应格式
     * 通用的响应验证辅助方法
     */
    protected validateResponse(response: any, path: string[]): boolean {
        let current = response;
        for (const key of path) {
            if (!current || typeof current !== 'object' || !(key in current)) {
                return false;
            }
            current = current[key];
        }
        return true;
    }
}

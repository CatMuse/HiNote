/**
 * AI 服务类型定义
 * 统一的 AI 服务接口和类型
 */

/**
 * AI 服务提供商枚举
 */
export enum AIProviderType {
    OPENAI = 'openai',
    ANTHROPIC = 'anthropic',
    GEMINI = 'gemini',
    DEEPSEEK = 'deepseek',
    SILICONFLOW = 'siliconflow',
    OLLAMA = 'ollama',
    CUSTOM = 'custom'
}

/**
 * AI 消息接口
 */
export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

/**
 * AI 模型接口
 */
export interface AIModel {
    id: string;
    name: string;
    isCustom?: boolean;
}

/**
 * AI 服务配置
 */
export interface AIServiceConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
    customHeaders?: Record<string, string>;
}

/**
 * AI 错误代码
 */
export enum AIErrorCode {
    NOT_CONFIGURED = 'NOT_CONFIGURED',
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    INVALID_RESPONSE = 'INVALID_RESPONSE',
    API_ERROR = 'API_ERROR',
    RATE_LIMIT = 'RATE_LIMIT',
    INVALID_API_KEY = 'INVALID_API_KEY',
    MODEL_NOT_FOUND = 'MODEL_NOT_FOUND'
}

/**
 * AI 服务错误类
 */
export class AIServiceError extends Error {
    constructor(
        message: string,
        public provider: AIProviderType,
        public code: AIErrorCode,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'AIServiceError';
        
        // 保持错误堆栈
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AIServiceError);
        }
    }

    /**
     * 创建未配置错误
     */
    static notConfigured(provider: AIProviderType, detail?: string): AIServiceError {
        const message = detail 
            ? `${provider} service not configured: ${detail}`
            : `${provider} service not configured`;
        return new AIServiceError(message, provider, AIErrorCode.NOT_CONFIGURED);
    }

    /**
     * 创建连接失败错误
     */
    static connectionFailed(provider: AIProviderType, originalError?: Error): AIServiceError {
        return new AIServiceError(
            `Failed to connect to ${provider} service`,
            provider,
            AIErrorCode.CONNECTION_FAILED,
            originalError
        );
    }

    /**
     * 创建无效响应错误
     */
    static invalidResponse(provider: AIProviderType, detail?: string): AIServiceError {
        const message = detail
            ? `Invalid response from ${provider}: ${detail}`
            : `Invalid response from ${provider}`;
        return new AIServiceError(message, provider, AIErrorCode.INVALID_RESPONSE);
    }

    /**
     * 创建 API 错误
     */
    static apiError(provider: AIProviderType, message: string, originalError?: Error): AIServiceError {
        return new AIServiceError(message, provider, AIErrorCode.API_ERROR, originalError);
    }
}

/**
 * AI 服务接口
 * 所有 AI 服务必须实现此接口
 */
export interface IAIService {
    /**
     * 多轮对话
     */
    chat(messages: AIMessage[]): Promise<string>;

    /**
     * 单轮生成
     */
    generateResponse(prompt: string): Promise<string>;

    /**
     * 测试连接
     */
    testConnection(): Promise<boolean>;

    /**
     * 更新模型
     */
    updateModel(model: string): void;

    /**
     * 列出可用模型
     */
    listModels(): Promise<AIModel[]>;

    /**
     * 获取提供商类型
     */
    getProviderType(): AIProviderType;

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean;
}

/**
 * AI 服务工厂接口
 */
export interface IAIServiceFactory {
    /**
     * 创建服务实例
     */
    create(config: any): IAIService;

    /**
     * 检查是否支持该提供商
     */
    supports(provider: AIProviderType): boolean;

    /**
     * 获取提供商类型
     */
    getProviderType(): AIProviderType;
}

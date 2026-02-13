/**
 * AI 服务模块统一导出
 */

// 核心管理器
export { AIServiceManager } from './AIServiceManager';
export { AIServiceRegistry } from './AIServiceRegistry';

// 基础类
export { BaseAIService } from './BaseAIService';
export { BaseHTTPClient } from './BaseHTTPClient';

// 工具类
export { AITestHelper } from './AITestHelper';

// 类型定义
export {
    AIProviderType,
    AIServiceError,
    AIErrorCode
} from './BaseAIService';

export type {
    IAIService,
    IAIServiceFactory,
    AIMessage,
    AIServiceConfig,
    AIModel
} from './BaseAIService';

// 具体服务（如果需要直接使用）
export { OpenAIService } from './OpenAIService';
export { AnthropicService } from './AnthropicService';
export { GeminiService } from './GeminiService';
export { DeepseekService } from './DeepseekService';
export { SiliconFlowService } from './SiliconFlowService';
export { OllamaService } from './OllamaService';
export { CustomAIService } from './CustomAIService';

// 工厂类（如果需要自定义注册）
export {
    OpenAIServiceFactory,
    AnthropicServiceFactory,
    GeminiServiceFactory,
    DeepseekServiceFactory,
    SiliconFlowServiceFactory,
    OllamaServiceFactory,
    CustomAIServiceFactory
} from './factories';

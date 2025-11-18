/**
 * AI 服务注册表
 * 负责管理所有 AI 服务的注册和创建
 */

import { IAIService, IAIServiceFactory, AIProviderType, AIServiceError, AIErrorCode } from './BaseAIService';

export class AIServiceRegistry {
    private factories = new Map<AIProviderType, IAIServiceFactory>();
    private instances = new Map<AIProviderType, IAIService>();
    
    /**
     * 注册服务工厂
     */
    register(factory: IAIServiceFactory): void {
        const provider = factory.getProviderType();
        this.factories.set(provider, factory);
    }
    
    /**
     * 批量注册服务工厂
     */
    registerAll(factories: IAIServiceFactory[]): void {
        factories.forEach(factory => this.register(factory));
    }
    
    /**
     * 获取服务实例（懒加载）
     */
    getService(provider: AIProviderType, config: any): IAIService {
        // 检查缓存
        if (this.instances.has(provider)) {
            const instance = this.instances.get(provider)!;
            // 如果已配置，直接返回
            if (instance.isConfigured()) {
                return instance;
            }
        }
        
        // 获取工厂
        const factory = this.factories.get(provider);
        if (!factory) {
            throw AIServiceError.notConfigured(
                provider,
                `Provider ${provider} not registered`
            );
        }
        
        // 创建实例并缓存
        const service = factory.create(config);
        this.instances.set(provider, service);
        return service;
    }
    
    /**
     * 检查服务是否已注册
     */
    isRegistered(provider: AIProviderType): boolean {
        return this.factories.has(provider);
    }
    
    /**
     * 清除缓存（用于设置更新）
     */
    clearCache(provider?: AIProviderType): void {
        if (provider) {
            this.instances.delete(provider);
        } else {
            this.instances.clear();
        }
    }
    
    /**
     * 获取所有已注册的提供商
     */
    getRegisteredProviders(): AIProviderType[] {
        return Array.from(this.factories.keys());
    }
    
    /**
     * 获取所有已创建的服务实例
     */
    getActiveServices(): AIProviderType[] {
        return Array.from(this.instances.keys());
    }
}

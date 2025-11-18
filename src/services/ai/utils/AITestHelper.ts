import { Notice } from 'obsidian';
import { t } from '../../../i18n';
import type { IAIService } from '../types';

/**
 * AI 服务测试辅助工具
 * 提供统一的测试反馈和错误处理
 */
export class AITestHelper {
    /**
     * 统一的连接测试（带用户反馈）
     */
    static async testConnection(
        service: IAIService,
        providerName: string
    ): Promise<boolean> {
        // 显示测试中的提示
        const loadingNotice = new Notice(
            `⏳ ${t('Testing')} ${providerName} ${t('connection')}...`, 
            0  // 不自动关闭
        );

        try {
            const result = await service.testConnection();
            loadingNotice.hide();

            if (result) {
                new Notice(
                    `✓ ${providerName} ${t('connection successful!')}`,
                    3000
                );
            } else {
                new Notice(
                    `✗ ${providerName} ${t('connection failed. Please check your configuration.')}`,
                    5000
                );
            }

            return result;
        } catch (error) {
            loadingNotice.hide();
            
            const errorMessage = this.getErrorMessage(error);
            new Notice(
                `✗ ${providerName} ${t('test failed')}: ${errorMessage}`,
                5000
            );
            
            console.error(`${providerName} connection test error:`, error);
            return false;
        }
    }

    /**
     * 检查 API Key 是否已输入
     */
    static checkApiKey(apiKey: string | undefined, providerName: string): boolean {
        if (!apiKey || apiKey.trim() === '') {
            new Notice(
                `⚠️ ${t('Please enter your')} ${providerName} ${t('API Key first.')}`,
                4000
            );
            return false;
        }
        return true;
    }

    /**
     * 检查 Host 是否已输入（用于 Ollama 等）
     */
    static checkHost(host: string | undefined, providerName: string): boolean {
        if (!host || host.trim() === '') {
            new Notice(
                `⚠️ ${t('Please enter your')} ${providerName} ${t('host address first.')}`,
                4000
            );
            return false;
        }
        return true;
    }

    /**
     * 获取友好的错误消息
     */
    private static getErrorMessage(error: any): string {
        const message = error?.message || String(error);

        // 根据错误类型返回友好的消息
        if (message.includes('401') || message.includes('Unauthorized')) {
            return t('Invalid API Key');
        } else if (message.includes('403') || message.includes('Forbidden')) {
            return t('Access denied');
        } else if (message.includes('429') || message.includes('rate limit')) {
            return t('Rate limit exceeded');
        } else if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
            return t('Connection timeout');
        } else if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
            return t('Service unavailable');
        } else if (message.includes('404') || message.includes('Not Found')) {
            return t('Service not found');
        } else if (message.includes('500') || message.includes('Internal Server Error')) {
            return t('Server error');
        }

        // 返回原始错误消息（截断过长的消息）
        return message.length > 100 ? message.substring(0, 100) + '...' : message;
    }

    /**
     * 显示成功消息
     */
    static showSuccess(message: string): void {
        new Notice(`✓ ${message}`, 3000);
    }

    /**
     * 显示错误消息
     */
    static showError(message: string): void {
        new Notice(`✗ ${message}`, 5000);
    }

    /**
     * 显示警告消息
     */
    static showWarning(message: string): void {
        new Notice(`⚠️ ${message}`, 4000);
    }
}

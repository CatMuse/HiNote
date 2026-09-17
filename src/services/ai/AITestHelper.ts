import { t } from '../../i18n';

/** Shared, concise diagnostics for model refresh and connection tests. */
export class AITestHelper {
    static getErrorMessage(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);

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
            return t('Endpoint or model not found. Check the URL, protocol and model ID.');
        } else if (message.includes('500') || message.includes('Internal Server Error')) {
            return t('Server error');
        }

        // 返回原始错误消息（截断过长的消息）
        return message.length > 100 ? message.substring(0, 100) + '...' : message;
    }

}

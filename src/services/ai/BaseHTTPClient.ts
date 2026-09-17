import { requestUrl, RequestUrlParam, RequestUrlResponse } from 'obsidian';

/**
 * HTTP 请求配置接口
 */
export interface HTTPRequestConfig {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
}

interface HTTPErrorBody {
    error?: string | { message?: string };
}

/**
 * 基础 HTTP 客户端
 * 为所有 AI 服务提供统一的 HTTP 请求处理
 */
export class BaseHTTPClient {
    /**
     * 发送 HTTP 请求
     */
    async request<T = unknown>(config: HTTPRequestConfig): Promise<T> {
        try {
            const requestConfig: RequestUrlParam = {
                url: config.url,
                method: config.method,
                headers: config.headers || {},
                body: config.body,
                throw: false
            };

            const response: RequestUrlResponse = await this.withTimeout(requestUrl(requestConfig), config.timeout ?? 45000);

            // 检查响应状态
            if (response.status < 200 || response.status >= 300) {
                throw this.createHTTPError(response);
            }

            // 解析 JSON 响应
            return response.json as T;
        } catch (error) {
            throw this.handleError(error);
        }
    }

    private withTimeout<T>(request: PromiseLike<T>, timeoutMs: number): Promise<T> {
        // requestUrl cannot abort the underlying transport. Ignore late completion.
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Connection timeout')), timeoutMs);
            Promise.resolve(request).then(resolve, reject).finally(() => window.clearTimeout(timer));
        });
    }

    /**
     * 测试连接
     */
    async testConnection(config: HTTPRequestConfig): Promise<boolean> {
        await this.request(config);
        return true;
    }

    /**
     * 创建 HTTP 错误
     */
    private createHTTPError(response: RequestUrlResponse): Error {
        let errorMessage = `HTTP ${response.status}`;
        
        try {
            // 尝试解析错误响应
            const errorData = response.json as HTTPErrorBody | undefined;
            if (errorData?.error) {
                if (typeof errorData.error === 'string') {
                    errorMessage = errorData.error;
                } else if (errorData.error.message) {
                    errorMessage = errorData.error.message;
                }
            } else if (response.text) {
                errorMessage = response.text;
            }
        } catch {
            // 如果无法解析 JSON，使用原始文本
            if (response.text) {
                errorMessage = response.text;
            }
        }

        return new Error(`HTTP ${response.status}: ${errorMessage}`);
    }

    /**
     * 统一的错误处理
     */
    private handleError(error: unknown): Error {
        if (error instanceof Error) {
            return error;
        }
        
        if (typeof error === 'string') {
            return new Error(error);
        }
        
        return new Error('Unknown error occurred');
    }

    /**
     * 构建标准的 JSON 请求头
     */
    static buildJSONHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
        return {
            'Content-Type': 'application/json',
            ...additionalHeaders
        };
    }

    /**
     * 构建带认证的请求头
     */
    static buildAuthHeaders(apiKey: string, authType: 'Bearer' | 'ApiKey' = 'Bearer'): Record<string, string> {
        if (authType === 'Bearer') {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
        } else {
            return {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            };
        }
    }
}

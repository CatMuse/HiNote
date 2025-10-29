import { AIModel, AISettings } from '../types';
import { BaseHTTPClient } from './BaseHTTPClient';

interface SiliconFlowResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

interface SiliconFlowModelsResponse {
    data: Array<{
        id: string;
    }>;
}

export class SiliconFlowService {
    private settings: AISettings;
    private baseUrl: string;
    private httpClient: BaseHTTPClient;

    constructor(settings: AISettings) {
        if (!settings.siliconflow?.apiKey) {
            throw new Error('SiliconFlow API key is required');
        }

        this.settings = settings;
        this.baseUrl = settings.siliconflow.baseUrl || 'https://api.siliconflow.cn/v1';
        this.httpClient = new BaseHTTPClient();
    }

    async chat(messages: any[], signal?: AbortSignal): Promise<string> {
        try {
            const modelId = this.settings.siliconflow?.model || 'deepseek-ai/DeepSeek-V3';
            
            const response = await this.httpClient.request<SiliconFlowResponse>({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: BaseHTTPClient.buildAuthHeaders(this.settings.siliconflow?.apiKey || ''),
                body: JSON.stringify({
                    model: modelId,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    stream: false
                })
            });

            if (!response.choices || !response.choices[0] || !response.choices[0].message) {
                throw new Error('Unexpected API response format');
            }

            return response.choices[0].message.content;
        } catch (error) {
            throw error;
        }
    }

    async listModels(): Promise<AIModel[]> {
        try {
            const response = await this.httpClient.request<SiliconFlowModelsResponse>({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: BaseHTTPClient.buildAuthHeaders(this.settings.siliconflow?.apiKey || '')
            });

            return response.data.map((model: { id: string }) => ({
                id: model.id,
                name: model.id.split('/').pop() || model.id,
                isCustom: false
            }));
        } catch (error) {
            throw error;
        }
    }
}

import { AIModel, AISettings } from '../types';
import { requestUrl } from 'obsidian';

export class SiliconFlowService {
    private settings: AISettings;
    private baseUrl: string;

    constructor(settings: AISettings) {
        if (!settings.siliconflow?.apiKey) {
            throw new Error('SiliconFlow API key is required');
        }

        this.settings = settings;
        this.baseUrl = settings.siliconflow.baseUrl || 'https://api.siliconflow.cn/v1';
    }

    async chat(messages: any[], signal?: AbortSignal): Promise<string> {
        try {
            const modelId = this.settings.siliconflow?.model || 'deepseek-ai/DeepSeek-V3';
            
            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.siliconflow?.apiKey}`
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    stream: false
                })
            });

            if (response.status !== 200) {

                throw new Error(`SiliconFlow API request failed: ${response.text}`);
            }

            const result = response.json;
            if (!result.choices || !result.choices[0] || !result.choices[0].message) {

                throw new Error('Unexpected API response format');
            }

            return result.choices[0].message.content;
        } catch (error) {

            throw error;
        }
    }

    async listModels(): Promise<AIModel[]> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.settings.siliconflow?.apiKey}`
                }
            });

            if (response.status !== 200) {
                throw new Error(`Failed to list models: ${response.text}`);
            }

            return response.json.data.map((model: { id: string }) => ({
                id: model.id,
                name: model.id.split('/').pop() || model.id,
                isCustom: false
            }));
        } catch (error) {

            throw error;
        }
    }
}

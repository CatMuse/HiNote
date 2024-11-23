import { requestUrl, RequestUrlParam, Notice } from 'obsidian';

interface OllamaModel {
    name: string;
}

export class ElectronOllamaService {
    constructor(private host: string) {}

    async listModels(): Promise<string[]> {
        try {
            console.log('Fetching models from:', `${this.host}/api/models`);
            const response = await requestUrl({
                url: `${this.host}/api/models`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                throw: false
            });

            console.log('Response status:', response.status);
            console.log('Response text:', response.text);

            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = response.json;
            console.log('Models response:', data);

            if (Array.isArray(data.models)) {
                return data.models.map((model: OllamaModel) => model.name);
            } else {
                console.error('Unexpected response format:', data);
                throw new Error('无效的 API 响应格式');
            }
        } catch (error) {
            console.error('Failed to fetch models:', error);
            if (error.message.includes('ECONNREFUSED')) {
                throw new Error('无法连接到 Ollama 服务，请确保服务已启动');
            }
            throw new Error(`无法连接到 Ollama 服务: ${error.message}`);
        }
    }

    async generateCompletion(model: string, prompt: string): Promise<string> {
        try {
            console.log('Generating completion with model:', model);
            const response = await requestUrl({
                url: `${this.host}/api/generate`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    stream: false
                }),
                throw: false
            });

            if (response.status !== 200) {
                console.error('Generation failed:', response.text);
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = response.json;
            return data.response;
        } catch (error) {
            console.error('Ollama generation failed:', error);
            throw new Error(`AI 生成失败: ${error.message}`);
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            console.log('Testing connection to:', `${this.host}/api/version`);
            const response = await requestUrl({
                url: `${this.host}/api/version`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                throw: false
            });

            console.log('Version response:', response.status, response.text);
            return response.status === 200;
        } catch (error) {
            console.error('Connection test failed:', error);
            if (error.message.includes('ECONNREFUSED')) {
                new Notice('Ollama 服务未启动，请先启动服务');
            }
            return false;
        }
    }
} 
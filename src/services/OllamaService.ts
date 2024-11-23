import { requestUrl, Notice } from 'obsidian';

export class OllamaService {
    constructor(private host: string = 'http://localhost:11434') {}

    async listModels(): Promise<string[]> {
        try {
            // 先测试连接
            const isConnected = await this.testConnection();
            if (!isConnected) {
                throw new Error('无法连接到 Ollama 服务');
            }

            // 获取模型列表
            console.log('正在获取模型列表...');
            const response = await requestUrl({
                url: `${this.host}/api/tags`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                throw: false
            });

            console.log('API 响应状态:', response.status);
            console.log('API 响应内容:', response.text);

            if (response.status !== 200) {
                throw new Error(`API 请求失败: ${response.status}`);
            }

            const data = response.json;
            console.log('解析后的数据:', data);

            return (data.models || []).map((model: string) => model.split(':')[0]);
        } catch (error) {
            console.error('获取模型列表失败:', error);
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                throw new Error('网络请求失败，请检查 Ollama 服务是否正在运行');
            }
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        try {
            console.log('测试连接:', `${this.host}/api/version`);
            
            // 使用简单的 ping 请求测试连接
            const response = await requestUrl({
                url: `${this.host}/api/version`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                throw: false
            });

            console.log('连接测试响应:', {
                status: response.status,
                text: response.text
            });

            // 检查响应状态
            if (response.status === 200) {
                console.log('成功连接到 Ollama 服务');
                return true;
            }

            console.log('连接失败，状态码:', response.status);
            return false;
        } catch (error) {
            console.error('连接测试失败:', error);
            return false;
        }
    }

    async generateCompletion(model: string, prompt: string): Promise<string> {
        try {
            console.log('生成请求:', { model, prompt });
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
                console.error('生成失败:', response.text);
                throw new Error(`生成失败: ${response.status}`);
            }

            const data = response.json;
            return data.response;
        } catch (error) {
            console.error('生成失败:', error);
            throw new Error(`AI 生成失败: ${error.message}`);
        }
    }

    async pullModel(modelName: string): Promise<void> {
        try {
            new Notice(`开始下载模型 ${modelName}...`);
            const response = await requestUrl({
                url: `${this.host}/api/pull`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: modelName
                }),
                throw: false
            });

            if (!response.ok) {
                throw new Error(`下载失败: ${response.status}`);
            }

            new Notice(`模型 ${modelName} 下载完成`);
        } catch (error) {
            console.error('Failed to pull model:', error);
            throw new Error(`下载模型失败: ${error.message}`);
        }
    }
} 
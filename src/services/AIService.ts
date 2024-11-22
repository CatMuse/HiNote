import { AIProvider, AISettings } from '../types';

export class AIService {
    constructor(private settings: AISettings) {}

    async generateResponse(prompt: string, context: string): Promise<string> {
        const promptWithContext = prompt.replace('{{text}}', context);
        
        switch (this.settings.provider) {
            case 'openai':
                return await this.callOpenAI(promptWithContext);
            case 'anthropic':
                return await this.callAnthropic(promptWithContext);
            case 'ollama':
                return await this.callOllama(promptWithContext);
            default:
                throw new Error('未配置 AI 服务');
        }
    }

    private async callOpenAI(prompt: string): Promise<string> {
        if (!this.settings.openai?.apiKey) {
            throw new Error('未配置 OpenAI API Key');
        }

        const response = await fetch(this.settings.openai.baseUrl || 'https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.openai.apiKey}`
            },
            body: JSON.stringify({
                model: this.settings.openai.model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API 请求失败: ${response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    private async callAnthropic(prompt: string): Promise<string> {
        // 实现 Anthropic API 调用
        throw new Error('Anthropic API 尚未实现');
    }

    private async callOllama(prompt: string): Promise<string> {
        // 实现 Ollama API 调用
        throw new Error('Ollama API 尚未实现');
    }
} 
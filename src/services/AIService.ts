import { AIProvider, AISettings } from '../types';
import { OllamaService } from './OllamaService';
import { AnthropicService } from './AnthropicService';
import { GeminiService } from './GeminiService';
import { DeepseekService } from './DeepseekService';
import { requestUrl } from 'obsidian';

export class AIService {
    private ollamaService: OllamaService;
    private anthropicService: AnthropicService | null = null;
    private geminiService: GeminiService | null = null;
    private deepseekService: DeepseekService | null = null;

    constructor(private settings: AISettings) {
        if (settings.ollama?.host) {
            this.ollamaService = new OllamaService(settings.ollama.host);
        }
        if (settings.anthropic?.apiKey) {
            this.anthropicService = new AnthropicService(
                settings.anthropic.apiKey,
                settings.anthropic.baseUrl
            );
        }
        if (settings.gemini?.apiKey) {
            this.geminiService = new GeminiService(
                settings.gemini.apiKey,
                settings.gemini.baseUrl
            );
        }
        if (settings.deepseek?.apiKey) {
            this.deepseekService = new DeepseekService(
                settings.deepseek.apiKey,
                settings.deepseek.baseUrl
            );
        }
    }

    async generateResponse(prompt: string, highlight: string, comment?: string): Promise<string> {
        let promptWithContext = prompt
            .replace('{{highlight}}', highlight);
        
        // If comment is provided, replace its placeholder
        if (comment) {
            promptWithContext = promptWithContext.replace('{{comment}}', comment);
        }
        
        switch (this.settings.provider) {
            case 'openai':
                return await this.callOpenAI(promptWithContext);
            case 'anthropic':
                return await this.callAnthropic(promptWithContext);
            case 'ollama':
                return await this.callOllama(promptWithContext);
            case 'gemini':
                return await this.callGemini(promptWithContext);
            case 'deepseek':
                return await this.callDeepseek(promptWithContext);
            default:
                throw new Error('AI service not configured');
        }
    }

    async chat(messages: { role: string, content: string }[]): Promise<string> {
        switch (this.settings.provider) {
            case 'openai':
                return await this.chatWithOpenAI(messages);
            case 'anthropic':
                return await this.chatWithAnthropic(messages);
            case 'ollama':
                return await this.chatWithOllama(messages);
            case 'gemini':
                return await this.chatWithGemini(messages);
            case 'deepseek':
                return await this.chatWithDeepseek(messages);
            default:
                throw new Error('AI service not configured');
        }
    }

    private async chatWithOpenAI(messages: { role: string, content: string }[]): Promise<string> {
        if (!this.settings.openai?.apiKey) {
            throw new Error('OpenAI API Key not configured');
        }

        const response = await requestUrl({
            url: this.settings.openai.baseUrl || 'https://api.openai.com/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.openai.apiKey}`
            },
            body: JSON.stringify({
                model: this.settings.openai.model,
                messages: messages,
                temperature: 0.7
            })
        });

        if (response.status !== 200) {
            throw new Error(`OpenAI API request failed: ${response.text}`);
        }

        const data = response.json;
        return data.choices[0].message.content;
    }

    private async chatWithAnthropic(messages: { role: string, content: string }[]): Promise<string> {
        if (!this.anthropicService) {
            throw new Error('Anthropic service not configured');
        }

        // Anthropic API 目前不支持完整的对话历史，只使用最后一条消息
        const lastMessage = messages[messages.length - 1];
        return await this.anthropicService.generateResponse(lastMessage.content);
    }

    private async chatWithOllama(messages: { role: string, content: string }[]): Promise<string> {
        if (!this.ollamaService) {
            throw new Error('Ollama service not configured');
        }

        if (!this.settings.ollama?.model) {
            throw new Error('Ollama model not configured');
        }

        return await this.ollamaService.chat(
            this.settings.ollama.model,
            messages
        );
    }

    private async chatWithGemini(messages: { role: string, content: string }[]): Promise<string> {
        if (!this.geminiService) {
            throw new Error('Gemini service not configured');
        }
        return await this.geminiService.chat(messages);
    }

    private async chatWithDeepseek(messages: { role: string, content: string }[]): Promise<string> {
        if (!this.deepseekService) {
            throw new Error('Deepseek service not configured');
        }
        return await this.deepseekService.chat(messages);
    }

    private async callOpenAI(prompt: string): Promise<string> {
        return await this.chatWithOpenAI([{ role: 'user', content: prompt }]);
    }

    private async callAnthropic(prompt: string): Promise<string> {
        if (!this.anthropicService) {
            throw new Error('Anthropic service not configured');
        }
        return await this.anthropicService.generateResponse(prompt);
    }

    private async callOllama(prompt: string): Promise<string> {
        if (!this.ollamaService) {
            throw new Error('Ollama service not configured');
        }

        if (!this.settings.ollama?.model) {
            throw new Error('Ollama model not configured');
        }

        return await this.ollamaService.generateCompletion(
            this.settings.ollama.model,
            prompt
        );
    }

    private async callGemini(prompt: string): Promise<string> {
        if (!this.geminiService) {
            throw new Error('Gemini service not configured');
        }
        return await this.geminiService.generateResponse(prompt);
    }

    private async callDeepseek(prompt: string): Promise<string> {
        if (!this.deepseekService) {
            throw new Error('Deepseek service not configured');
        }
        return await this.deepseekService.generateResponse(prompt);
    }

    async testConnection(): Promise<boolean> {
        switch (this.settings.provider) {
            case 'openai':
                try {
                    await this.chatWithOpenAI([{ role: 'user', content: 'test' }]);
                    return true;
                } catch (error) {
                    console.error('OpenAI connection test failed:', error);
                    return false;
                }
            case 'anthropic':
                if (!this.anthropicService) return false;
                return await this.anthropicService.testConnection();
            case 'ollama':
                if (!this.ollamaService) return false;
                return await this.ollamaService.testConnection();
            case 'gemini':
                if (!this.geminiService) return false;
                return await this.geminiService.testConnection();
            case 'deepseek':
                if (!this.deepseekService) return false;
                return await this.deepseekService.testConnection();
            default:
                return false;
        }
    }

    async listOllamaModels(): Promise<string[]> {
        if (!this.ollamaService) {
            throw new Error('Ollama service not configured');
        }
        return await this.ollamaService.listModels();
    }

    async listGeminiModels(): Promise<{id: string, name: string}[]> {
        if (!this.geminiService) {
            throw new Error('Gemini service not configured');
        }
        return await this.geminiService.listModels();
    }
}
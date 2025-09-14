import { AIProvider, AISettings, DEFAULT_GEMINI_MODELS, DEFAULT_SILICONFLOW_MODELS, AIModel } from '../types';
import { OllamaService } from './OllamaService';
import { AnthropicService } from './AnthropicService';
import { GeminiService } from './GeminiService';
import { SiliconFlowService } from './SiliconFlowService';
import { DeepseekService } from './DeepseekService';
import { requestUrl } from 'obsidian';

export class AIService {
    private ollamaService: OllamaService;
    private anthropicService: AnthropicService | null = null;
    private geminiService: GeminiService | null = null;
    private deepseekService: DeepseekService | null = null;
    private siliconflowService: SiliconFlowService | null = null;

    // 存储当前使用的模型状态
    private currentState = {
        provider: '',
        model: ''
    };

    constructor(private settings: AISettings) {
        if (settings.ollama?.host) {
            this.ollamaService = new OllamaService(settings.ollama.host);
        }
        if (settings.anthropic?.apiKey) {
            this.anthropicService = new AnthropicService(
                settings.anthropic.apiKey,
                settings.anthropic.apiAddress,
                settings.anthropic.model
            );
        }
        if (settings.gemini?.apiKey) {
            this.geminiService = new GeminiService(
                settings.gemini.apiKey,
                settings.gemini.model,
                settings.gemini.baseUrl
            );
        }
        if (settings.deepseek?.apiKey) {
            this.deepseekService = new DeepseekService(
                settings.deepseek.apiKey,
                settings.deepseek.model,
                settings.deepseek.baseUrl
            );
        }
        if (settings.siliconflow?.apiKey) {
            this.siliconflowService = new SiliconFlowService(this.settings);
        }
        
        // 初始化使用设置中的值
        this.currentState.provider = settings.provider;
        switch (settings.provider) {
            case 'gemini':
                this.currentState.model = settings.gemini?.model || '';
                break;
            case 'deepseek':
                this.currentState.model = settings.deepseek?.model || 'deepseek-chat';
                break;
            case 'siliconflow':
                this.currentState.model = settings.siliconflow?.model || 'internlm/internlm2_5-7b-chat';
                break;
            // 其他 provider 的情况...
        }
    }

    // 更新当前使用的模型
    updateModel(provider: string, model: string) {
        this.currentState.provider = provider;
        this.currentState.model = model;

        // 更新相应服务的模型
        switch (provider) {
            case 'gemini':
                if (this.geminiService) {
                    this.geminiService.updateModel(model);
                }
                break;
            case 'deepseek':
                if (this.deepseekService) {
                    this.deepseekService.updateModel(model);
                }
                break;
            // 其他 provider 的情况...
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
            case 'siliconflow':
                return await this.callSiliconFlow(promptWithContext);
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
            case 'siliconflow':
                return await this.chatWithSiliconFlow(messages);
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

    private async chatWithSiliconFlow(messages: { role: string, content: string }[]): Promise<string> {
        if (!this.siliconflowService) {
            throw new Error('SiliconFlow service not configured');
        }

        try {
            return await this.siliconflowService.chat(messages);
        } catch (error) {

            throw error;
        }
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

    private async callSiliconFlow(prompt: string): Promise<string> {
        if (!this.siliconflowService) {
            throw new Error('SiliconFlow service not configured');
        }

        try {
            return await this.siliconflowService.chat([{
                role: 'user',
                content: prompt
            }]);
        } catch (error) {

            throw error;
        }
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
        // 使用 DEFAULT_GEMINI_MODELS 代替调用 geminiService.listModels()
        return Promise.resolve(DEFAULT_GEMINI_MODELS);
    }

    async listDeepseekModels(): Promise<{id: string, name: string}[]> {
        if (!this.deepseekService) {
            throw new Error('Deepseek service not configured');
        }
        // 使用默认的 Deepseek 模型列表
        return Promise.resolve([
            { id: 'deepseek-chat', name: 'Deepseek Chat' },
            { id: 'deepseek-coder', name: 'Deepseek Coder' }
        ]);
    }

    async listSiliconFlowModels(): Promise<AIModel[]> {
        return DEFAULT_SILICONFLOW_MODELS;
    }

    async listOpenAIModels(): Promise<AIModel[]> {
        const models: AIModel[] = [
            { id: 'gpt-4o', name: 'GPT-4o', isCustom: false },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', isCustom: false },
            { id: 'gpt-o1', name: 'GPT-o1', isCustom: false },
            { id: 'gpt-4', name: 'GPT-4', isCustom: false },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', isCustom: false }
        ];

        // 如果有自定义模型，添加到列表中
        if (this.settings.openai?.isCustomModel && this.settings.openai?.model) {
            models.push({
                id: this.settings.openai.model,
                name: this.settings.openai.model,
                isCustom: true
            });
        }

        return models;
    }
}
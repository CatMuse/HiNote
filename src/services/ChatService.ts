import { App, Notice } from 'obsidian';
import { OllamaService } from './OllamaService';

export interface ChatMessage {
    content: string;
    type: "user" | "assistant";
    timestamp: number;
}

export class ChatService {
    private messages: ChatMessage[] = [];
    private ollamaService: OllamaService;

    constructor(private plugin: any) {
        const settings = this.plugin.settings.ai.ollama;
        this.ollamaService = new OllamaService(settings.host);
    }

    async sendMessage(content: string): Promise<ChatMessage> {
        const userMessage: ChatMessage = {
            content,
            type: "user",
            timestamp: Date.now()
        };
        this.messages.push(userMessage);

        try {
            const model = this.plugin.settings.ai.ollama.model;
            const response = await this.ollamaService.generateCompletion(model, content);
            
            const assistantMessage: ChatMessage = {
                content: response,
                type: "assistant",
                timestamp: Date.now()
            };
            this.messages.push(assistantMessage);

            return assistantMessage;
        } catch (error) {
            console.error('Error getting AI response:', error);
            new Notice('获取 AI 响应失败，请确保 Ollama 服务正在运行');
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        return await this.ollamaService.testConnection();
    }

    getMessages(): ChatMessage[] {
        return this.messages;
    }

    clearMessages() {
        this.messages = [];
    }
} 
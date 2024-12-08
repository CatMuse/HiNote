import { App, Notice } from 'obsidian';
import { OllamaService } from './OllamaService';

export interface ChatMessage {
    content: string;
    type: "user" | "assistant";
    timestamp: number;
}

export class ChatService {
    private ollamaService: OllamaService;

    constructor(private plugin: any) {
        const settings = this.plugin.settings.ai.ollama;
        this.ollamaService = new OllamaService(settings.host);
    }

    async sendMessage(
        content: string, 
        history: { role: "user" | "assistant", content: string }[] = []
    ): Promise<ChatMessage> {
        try {
            const model = this.plugin.settings.ai.ollama.model;
            
            // 将历史记录格式化为 Ollama 可接受的格式
            const messages = history.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            
            // 添加当前消息
            messages.push({
                role: "user",
                content: content
            });

            // 调用 Ollama 服务
            const response = await this.ollamaService.chat(model, messages);

            return {
                content: response,
                type: "assistant",
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error getting AI response:', error);
            new Notice('获取 AI 响应失败，请确保 Ollama 服务正在运行');
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        return await this.ollamaService.testConnection();
    }
} 
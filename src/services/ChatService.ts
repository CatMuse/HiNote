import { App, Notice } from 'obsidian';
import { AIServiceManager, AIProviderType } from './ai';

export interface ChatMessage {
    content: string;
    type: "user" | "assistant";
    timestamp: number;
}

export class ChatService {
    readonly aiService: AIServiceManager;

    constructor(private plugin: any) {
        this.aiService = new AIServiceManager(this.plugin.settings.ai);
    }

    // 更新服务使用的模型
    updateModel(provider: string, model: string) {
        if (this.aiService) {
            // 将字符串转换为 AIProviderType
            const providerType = provider as AIProviderType;
            this.aiService.updateModel(providerType, model);
        }
    }

    async sendMessage(
        content: string, 
        history: { role: "user" | "assistant", content: string }[] = []
    ): Promise<ChatMessage> {
        try {
            // 将历史记录格式化为统一格式
            const messages = history.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
            
            // 添加当前消息
            messages.push({
                role: "user",
                content: content
            });

            // 使用AIService处理消息
            const response = await this.aiService.chat(messages);

            return {
                content: response,
                type: "assistant",
                timestamp: Date.now()
            };
        } catch (error) {

            new Notice('获取 AI 响应失败，请检查服务配置和网络连接');
            throw error;
        }
    }

    async testConnection(): Promise<boolean> {
        return await this.aiService.testConnection();
    }
}
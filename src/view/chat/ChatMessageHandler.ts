import { App, Notice, MarkdownRenderer, Component } from "obsidian";
import { ChatService } from '../../services/ChatService';
import { ContextService, ContextOptions } from '../../services/ContextService';
import { ChatStateManager } from './ChatStateManager';
import { t } from "../../i18n";

/**
 * 对话消息处理器
 * 负责消息的发送、接收和渲染
 */
export class ChatMessageHandler {
    private app: App;
    private plugin: any;
    private chatService: ChatService;
    private contextService: ContextService;
    private stateManager: ChatStateManager;
    private isProcessing: boolean = false;
    private contextOptions: ContextOptions;

    constructor(
        app: App,
        plugin: any,
        chatService: ChatService,
        contextService: ContextService,
        stateManager: ChatStateManager
    ) {
        this.app = app;
        this.plugin = plugin;
        this.chatService = chatService;
        this.contextService = contextService;
        this.stateManager = stateManager;

        // 初始化上下文选项
        this.contextOptions = {
            strategy: this.plugin.settings.contextOptions?.strategy || 'smart',
            includeTitle: this.plugin.settings.contextOptions?.includeTitle ?? true,
            maxLength: this.plugin.settings.contextOptions?.maxLength || 2000,
            surroundingLines: this.plugin.settings.contextOptions?.surroundingLines || 3
        };
    }

    /**
     * 添加消息到界面
     */
    addMessage(
        container: HTMLElement,
        content: string,
        type: "user" | "assistant",
        useTypeWriter: boolean = true
    ): void {
        const messageEl = container.createEl("div", {
            cls: "highlight-chat-message"
        });

        const contentEl = messageEl.createEl("div", {
            cls: "highlight-chat-message-content markdown-rendered"
        });

        messageEl.addClass(`highlight-chat-message-${type}`);
        contentEl.addClass(`highlight-chat-message-content-${type}`);

        if (type === "assistant" && useTypeWriter) {
            this.typeWriter(contentEl, content);
        } else {
            this.renderMarkdownContent(contentEl, content);
        }

        container.scrollTop = container.scrollHeight;
    }

    /**
     * 打字机效果
     */
    private async typeWriter(element: HTMLElement, text: string, speed: number = 30): Promise<void> {
        let i = 0;
        element.textContent = '';
        
        const cursor = element.createEl("span", {
            cls: "highlight-chat-cursor"
        });

        const type = () => {
            if (i < text.length) {
                element.insertBefore(document.createTextNode(text.charAt(i)), cursor);
                i++;
                setTimeout(type, speed);
            } else {
                cursor.remove();
                this.renderMarkdownContent(element, text);
            }
        };

        type();
    }

    /**
     * 使用 Obsidian 的 MarkdownRenderer 渲染 Markdown 内容
     */
    private async renderMarkdownContent(containerEl: HTMLElement, content: string): Promise<void> {
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
        
        try {
            await MarkdownRenderer.render(
                this.app,
                content,
                containerEl,
                '',
                new Component()
            );
            
            const lists = containerEl.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.addClass('chat-markdown-list');
            });
        } catch (error) {
            console.error('Error rendering markdown in chat:', error);
            containerEl.textContent = content;
        }
    }

    /**
     * 处理发送消息
     */
    async handleSendMessage(
        textarea: HTMLTextAreaElement,
        chatHistoryEl: HTMLElement,
        getCurrentPreviewContainer: () => HTMLElement | null,
        setCurrentPreviewContainer: (container: HTMLElement | null) => void
    ): Promise<void> {
        const content = textarea.value.trim();
        if (!content || this.isProcessing) return;

        try {
            this.isProcessing = true;
            
            let messageToSend = content;
            let userMessage = content;

            const draggedContents = this.stateManager.getDraggedContents();

            if (draggedContents.length > 0) {
                const contextsPromises = draggedContents.map(highlight => 
                    this.contextService.getContextForHighlight(highlight, this.contextOptions)
                );
                
                const contexts = await Promise.all(contextsPromises);
                
                const contextualContents = contexts.map((context, index) => {
                    const highlight = draggedContents[index];
                    if (!context) {
                        return `**高亮内容 ${index + 1}:**\n${highlight.text}`;
                    }
                    
                    let contextMessage = `**Highlight ${index + 1}** (from: ${context.fileName}):\n`;
                    
                    if (context.sectionTitle) {
                        contextMessage += `**Section:** ${context.sectionTitle}\n\n`;
                    }
                    
                    if (context.beforeContext.trim()) {
                        contextMessage += `**Before:**\n${context.beforeContext.trim()}\n\n`;
                    }
                    
                    contextMessage += `**Highlight:**\n${highlight.text}\n\n`;
                    
                    if (context.afterContext.trim()) {
                        contextMessage += `**After:**\n${context.afterContext.trim()}`;
                    }
                    
                    return contextMessage;
                }).join('\n\n---\n\n');
                
                this.stateManager.addToHistory({ 
                    role: "user", 
                    content: `以下是需要分析的内容（包含上下文）：\n\n${contextualContents}`
                });

                messageToSend = content;
                userMessage = `用户提示：${content}`;

                const currentPreviewContainer = getCurrentPreviewContainer();
                if (currentPreviewContainer) {
                    const previewMessage = currentPreviewContainer.closest('.highlight-chat-message-preview');
                    if (previewMessage) {
                        previewMessage.addClass('sent');
                    }
                    setCurrentPreviewContainer(null);
                    this.stateManager.clearDraggedContents();
                }
            }

            this.stateManager.addToHistory({ role: "user", content: userMessage });

            requestAnimationFrame(() => {
                textarea.value = '';
                textarea.addClass('highlight-chat-input');
                textarea.dispatchEvent(new Event('input'));
            });

            this.addMessage(chatHistoryEl, content, "user", true);
            
            const response = await this.chatService.sendMessage(
                messageToSend,
                this.stateManager.getChatHistory()
            );
            
            this.stateManager.addToHistory({ role: "assistant", content: response.content });
            
            this.addMessage(chatHistoryEl, response.content, "assistant", true);

        } catch (error) {
            console.error('发送消息时出错:', error);
            new Notice('Failed to send message, please try again');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 清空对话
     */
    clearChat(chatHistoryEl: HTMLElement, textarea: HTMLTextAreaElement | null): void {
        this.stateManager.clearHistory();
        this.stateManager.clearDraggedContents();
        
        const currentPreviewContainer = this.stateManager.getCurrentPreviewContainer();
        if (currentPreviewContainer) {
            const previewMessage = currentPreviewContainer.closest('.highlight-chat-message-preview');
            if (previewMessage) {
                previewMessage.remove();
            }
            this.stateManager.setCurrentPreviewContainer(null);
        }

        while (chatHistoryEl.firstChild) {
            chatHistoryEl.removeChild(chatHistoryEl.firstChild);
        }

        if (textarea) {
            textarea.value = '';
            textarea.addClass('highlight-chat-input');
        }
    }

    /**
     * 获取上下文选项
     */
    getContextOptions(): ContextOptions {
        return this.contextOptions;
    }

    /**
     * 设置上下文选项
     */
    setContextOptions(options: ContextOptions): void {
        this.contextOptions = options;
    }

    /**
     * 保存上下文选项到插件设置
     */
    async saveContextOptions(): Promise<void> {
        if (!this.plugin.settings.contextOptions) {
            this.plugin.settings.contextOptions = {};
        }
        
        this.plugin.settings.contextOptions.strategy = this.contextOptions.strategy;
        this.plugin.settings.contextOptions.includeTitle = this.contextOptions.includeTitle;
        this.plugin.settings.contextOptions.maxLength = this.contextOptions.maxLength;
        this.plugin.settings.contextOptions.surroundingLines = this.contextOptions.surroundingLines;
        
        await this.plugin.saveSettings();
    }
}

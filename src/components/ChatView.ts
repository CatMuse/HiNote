import { ItemView, App } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';
import { CommentInput } from './comment/CommentInput';
import { HighlightInfo } from '../types';

export class ChatView {
    private chatService: ChatService;
    private isProcessing: boolean = false;
    private containerEl: HTMLElement;
    private draggedContent: string | null = null; // 存储拖拽的内容

    constructor(app: App, private plugin: any) {
        this.chatService = new ChatService(this.plugin);
        
        // 创建容器
        this.containerEl = document.createElement('div');
        this.containerEl.addClass("highlight-chat-window");
        
        // 添加标题栏
        const header = this.containerEl.createEl("div", {
            cls: "highlight-chat-header",
            text: "聊天"
        });

        // 添加关闭按钮
        const closeButton = header.createEl("div", {
            cls: "highlight-chat-close"
        });
        closeButton.innerHTML = "×";
        closeButton.addEventListener("click", () => this.close());

        const chatHistory = this.containerEl.createEl("div", {
            cls: "highlight-chat-history"
        });

        const inputContainer = this.containerEl.createEl("div", {
            cls: "highlight-chat-input-container"
        });

        // 创建一个临时的 HighlightInfo 对象
        const dummyHighlight: HighlightInfo = {
            text: "",
            position: 0,
            paragraphOffset: 0,
            paragraphId: "chat",
            paragraphText: "",
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // 使用 CommentInput 组件
        const commentInput = new CommentInput(inputContainer, dummyHighlight, undefined, {
            onSave: async (content: string) => {
                if (!content || this.isProcessing) return;

                try {
                    this.isProcessing = true;
                    
                    // 如果有拖拽内容，添加到提示中
                    let prompt = content;
                    if (this.draggedContent) {
                        prompt = `分析以下内容：\n\n${this.draggedContent}\n\n用户提示：${content}`;
                        this.draggedContent = null; // 清空拖拽内容
                    }

                    this.addMessage(chatHistory, content, "user");
                    const response = await this.chatService.sendMessage(prompt);
                    this.addMessage(chatHistory, response.content, "assistant");

                    const textarea = inputContainer.querySelector('.highlight-comment-input textarea') as HTMLTextAreaElement;
                    if (textarea) {
                        textarea.value = '';
                        textarea.dispatchEvent(new Event('input'));
                    }

                    // 重新显示拖拽区域
                    dropZone.style.display = '';
                    this.removeDraggedPreview(chatHistory);
                } catch (error) {
                    console.error('Failed to get AI response:', error);
                } finally {
                    this.isProcessing = false;
                }
            },
            onCancel: () => {
                // 不需要处理取消事件
            }
        });

        commentInput.show();

        // 添加拖拽目标区域
        const dropZone = chatHistory.createEl("div", {
            cls: "highlight-chat-dropzone",
            text: "将高亮内容拖拽到此处发送给 AI"
        });

        // 添加拖拽事件处理
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.addClass("drag-over");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.removeClass("drag-over");
        });

        dropZone.addEventListener("drop", async (e) => {
            e.preventDefault();
            dropZone.removeClass("drag-over");

            const highlightData = e.dataTransfer?.getData("application/highlight");
            if (highlightData) {
                try {
                    const highlight = JSON.parse(highlightData);
                    const content = highlight.text;
                    if (!content) return;

                    this.draggedContent = content;
                    
                    // 隐藏拖拽区域，显示预览
                    dropZone.style.display = 'none';
                    this.showDraggedPreview(chatHistory, content);

                    // 移除更新输入框的部分，保持输入框原有状态
                } catch (error) {
                    console.error('Failed to process dropped highlight:', error);
                }
            }
        });
    }

    private showDraggedPreview(container: HTMLElement, content: string) {
        const previewEl = container.createEl("div", {
            cls: "highlight-chat-preview"
        });

        previewEl.createEl("div", {
            cls: "highlight-chat-preview-header",
            text: "已选择的内容："
        });

        previewEl.createEl("div", {
            cls: "highlight-chat-preview-content",
            text: content
        });
    }

    private removeDraggedPreview(container: HTMLElement) {
        const preview = container.querySelector('.highlight-chat-preview');
        if (preview) {
            preview.remove();
        }
    }

    show() {
        document.body.appendChild(this.containerEl);
    }

    close() {
        this.containerEl.remove();
    }

    private addMessage(container: HTMLElement, content: string, type: "user" | "assistant") {
        const messageEl = container.createEl("div", {
            cls: `highlight-chat-message highlight-chat-message-${type}`
        });

        messageEl.createEl("div", {
            cls: "highlight-chat-message-content",
            text: content
        });

        container.scrollTop = container.scrollHeight;
    }
} 
import { Modal, App, Notice } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';
import { CommentInput } from './comment/CommentInput';
import { HighlightInfo } from '../types';

export class ChatModal extends Modal {
    private chatService: ChatService;
    private isProcessing: boolean = false;

    constructor(app: App, private plugin: any) {
        super(app);
        this.chatService = new ChatService(this.plugin);
        this.modalEl.addClass("highlight-chat-modal");
        
        const overlayEl = this.modalEl.parentElement;
        if (overlayEl) {
            overlayEl.addClass("highlight-chat-modal-overlay");
            
            overlayEl.addEventListener("click", (e: MouseEvent) => {
                if (e.target === overlayEl) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            });
        }
        
        document.addEventListener('click', this.handleOutsideClick);
    }

    async onOpen() {
        const { contentEl } = this;
        
        // 添加标题栏
        const header = contentEl.createEl("div", {
            cls: "highlight-chat-header",
            text: "聊天"
        });

        const chatHistory = contentEl.createEl("div", {
            cls: "highlight-chat-history"
        });

        const inputContainer = contentEl.createEl("div", {
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
                    this.addMessage(chatHistory, content, "user");

                    const response = await this.chatService.sendMessage(content);
                    this.addMessage(chatHistory, response.content, "assistant");

                    // 找到并清空输入框
                    const textarea = inputContainer.querySelector('.highlight-comment-input textarea') as HTMLTextAreaElement;
                    if (textarea) {
                        textarea.value = '';
                        // 触发输入事件以更新状态
                        textarea.dispatchEvent(new Event('input'));
                    }
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
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        document.removeEventListener('click', this.handleOutsideClick);
    }

    private handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const isOutsideModal = !this.modalEl.contains(target);
        const isOutsideButton = !target.closest('.highlight-floating-button');
        
        if (isOutsideModal && isOutsideButton) {
            this.close();
        }
    };

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
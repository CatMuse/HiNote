import { Modal, App, Notice } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';

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
        
        const chatContainer = contentEl.createEl("div", {
            cls: "highlight-chat-container"
        });

        const chatHistory = chatContainer.createEl("div", {
            cls: "highlight-chat-history"
        });

        const inputContainer = chatContainer.createEl("div", {
            cls: "highlight-chat-input-container"
        });

        const textarea = inputContainer.createEl("textarea", {
            cls: "highlight-chat-input",
            attr: {
                placeholder: "输入消息..."
            }
        });

        const sendButton = inputContainer.createEl("button", {
            cls: "highlight-chat-send-btn",
            text: "发送"
        });

        const loadingIndicator = chatHistory.createEl("div", {
            cls: "highlight-chat-loading",
            text: "AI正在思考..."
        });
        loadingIndicator.style.display = "none";

        const handleSend = async () => {
            const message = textarea.value.trim();
            if (!message || this.isProcessing) return;

            try {
                this.isProcessing = true;
                sendButton.disabled = true;
                loadingIndicator.style.display = "block";

                this.addMessage(chatHistory, message, "user");
                textarea.value = "";

                const response = await this.chatService.sendMessage(message);
                this.addMessage(chatHistory, response.content, "assistant");

            } catch (error) {
                console.error('Failed to get AI response:', error);
            } finally {
                this.isProcessing = false;
                sendButton.disabled = false;
                loadingIndicator.style.display = "none";
            }
        };

        sendButton.addEventListener("click", handleSend);

        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        setTimeout(() => textarea.focus(), 0);
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
import { ItemView, App, setIcon } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';
import { HighlightInfo } from '../types';

export class ChatView {
    public static instance: ChatView | null = null;
    private chatService: ChatService;
    private isProcessing: boolean = false;
    private containerEl: HTMLElement;
    private draggedContents: HighlightInfo[] = [];
    private chatHistory: { role: "user" | "assistant", content: string }[] = [];
    private floatingButton: HTMLElement | null;
    private currentPreviewContainer: HTMLElement | null = null;
    private static savedState: {
        chatHistory: { role: "user" | "assistant", content: string }[];
        draggedContents: HighlightInfo[];
        containerHTML: string | null;
        currentPreviewContainer: boolean;  // 记录是否有活跃的预览容器
    } | null = null;
    private textarea: HTMLTextAreaElement | null = null;  // 添加输入框引用

    constructor(app: App, private plugin: any) {
        if (ChatView.instance) {
            return ChatView.instance;
        }

        this.chatService = new ChatService(this.plugin);
        this.floatingButton = document.querySelector('.highlight-floating-button');
        
        // 创建容器
        this.containerEl = document.createElement('div');
        this.containerEl.addClass("highlight-chat-window");
        
        // 添加标题栏
        const header = this.containerEl.createEl("div", {
            cls: "highlight-chat-header"
        });

        // 添加标题
        header.createEl("div", {
            cls: "highlight-chat-title",
            text: "对话"
        });

        // 添加按钮容器
        const buttonsContainer = header.createEl("div", {
            cls: "highlight-chat-buttons"
        });

        // 添加清空按钮
        const clearButton = buttonsContainer.createEl("div", {
            cls: "highlight-chat-clear"
        });
        setIcon(clearButton, "trash");
        clearButton.addEventListener("click", () => this.clearChat());

        // 添加关闭按钮
        const closeButton = buttonsContainer.createEl("div", {
            cls: "highlight-chat-close"
        });
        setIcon(closeButton, "x");
        closeButton.addEventListener("click", () => this.close());

        const chatHistory = this.containerEl.createEl("div", {
            cls: "highlight-chat-history"
        });

        const inputContainer = this.containerEl.createEl("div", {
            cls: "highlight-chat-input-container"
        });

        this.setupChatInput(inputContainer);

        // 创建一个临时的 HighlightInfo 对象
        const dummyHighlight: HighlightInfo = {
            text: "",
            position: 0,
            paragraphOffset: 0,
            paragraphId: "chat",
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        // 将拖拽事件处理器添加到整个历史区域
        chatHistory.addEventListener("dragenter", (e) => {
            e.preventDefault();
            chatHistory.addClass("drag-over");
        });

        chatHistory.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            chatHistory.addClass("drag-over");

            // 计算聊天历史区域的可视区域位置
            const chatHistoryRect = chatHistory.getBoundingClientRect();
            const visibleTop = chatHistory.scrollTop;  // 当前滚动位置
            const visibleHeight = chatHistoryRect.height;  // 可视区域高度
            
            // 设置虚线框的位置，使其始终在可视区域内
            chatHistory.style.setProperty('--drag-guide-top', `${visibleTop + 12}px`);  // 顶部留出16px边距
            chatHistory.style.setProperty('--drag-guide-left', '12px');
            chatHistory.style.setProperty('--drag-guide-right', '12px');
            chatHistory.style.setProperty('--drag-guide-height', `${visibleHeight - 24}px`);  // 高度减去上下边距

            // 更新预览元素位置
            const preview = document.querySelector('.highlight-dragging') as HTMLElement;
            if (preview) {
                preview.style.left = `${e.clientX + 10}px`;
                preview.style.top = `${e.clientY + 10}px`;
            }
        });

        chatHistory.addEventListener("dragleave", (e) => {
            if (!chatHistory.contains(e.relatedTarget as Node)) {
                chatHistory.removeClass("drag-over");
            }
        });

        chatHistory.addEventListener("drop", async (e) => {
            e.preventDefault();
            chatHistory.removeClass("drag-over");

            const highlightData = e.dataTransfer?.getData("application/highlight");
            if (highlightData) {
                try {
                    const highlight = JSON.parse(highlightData);
                    if (!highlight.text) return;

                    // 检查是否已存在相同内容
                    const isDuplicate = this.draggedContents.some(
                        existing => existing.text === highlight.text
                    );

                    if (!isDuplicate) {
                        // 直接在对话流中显示预览
                        this.draggedContents.push(highlight);
                        this.showDraggedPreviewsInChat(chatHistory);
                    }
                } catch (error) {
                    console.error('Failed to process dropped highlight:', error);
                }
            }
        });

        // 添加标题栏拖拽功能
        let isDragging = false;
        let currentX: number;
        let currentY: number;
        let initialX: number;
        let initialY: number;

        header.addEventListener("mousedown", (e) => {
            if (e.target === closeButton || e.target === clearButton) return; // 如果点击的是关闭按钮或清空按钮不启动拖拽

            isDragging = true;
            initialX = e.clientX - this.containerEl.offsetLeft;
            initialY = e.clientY - this.containerEl.offsetTop;

            header.addClass("dragging");
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;

            e.preventDefault();
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // 确保窗口不会被拖出视图
            const maxX = window.innerWidth - this.containerEl.offsetWidth;
            const maxY = window.innerHeight - this.containerEl.offsetHeight;
            
            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            this.containerEl.style.left = `${currentX}px`;
            this.containerEl.style.top = `${currentY}px`;
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
            header.removeClass("dragging");
        });

        // 恢复保存的状态
        if (ChatView.savedState) {
            // 恢复对话历史
            this.chatHistory = ChatView.savedState.chatHistory;
            this.draggedContents = ChatView.savedState.draggedContents;

            // 恢复UI状态
            const chatHistory = this.containerEl.querySelector('.highlight-chat-history');
            if (chatHistory && ChatView.savedState.containerHTML) {
                chatHistory.innerHTML = ChatView.savedState.containerHTML;
                
                // 重新绑定删除按钮事件
                chatHistory.querySelectorAll('.highlight-chat-preview-delete').forEach((btn, index) => {
                    btn.addEventListener('click', () => {
                        const card = btn.closest('.highlight-chat-preview-card');
                        if (card) {
                            card.remove();
                            this.draggedContents.splice(index, 1);
                            this.updatePreviewCount();
                        }
                    });
                });

                // 如果有活跃的预览容器，恢复引用
                if (ChatView.savedState.currentPreviewContainer) {
                    this.currentPreviewContainer = chatHistory.querySelector('.highlight-chat-preview-cards');
                }
            }
        }

        ChatView.instance = this;
    }

    private showDraggedPreviewsInChat(container: HTMLElement) {
        // 如果没有当前预览容器，创建一个新的
        if (!this.currentPreviewContainer) {
            const messageEl = container.createEl("div", {
                cls: "highlight-chat-message highlight-chat-message-preview"
            });

            const previewsContainer = messageEl.createEl("div", {
                cls: "highlight-chat-previews"
            });

            // 添加标题
            const headerEl = previewsContainer.createEl("div", {
                cls: "highlight-chat-preview-header"
            });

            headerEl.createEl("span", {
                cls: "highlight-chat-preview-count",
                text: String(this.draggedContents.length)
            });

            headerEl.createSpan({
                text: "条高亮笔记"
            });

            // 创建卡片容器
            const cardsContainer = previewsContainer.createEl("div", {
                cls: "highlight-chat-preview-cards"
            });

            this.currentPreviewContainer = cardsContainer;
        }

        // 添加新的高亮卡片到当前容器
        const card = this.currentPreviewContainer.createEl("div", {
            cls: "highlight-chat-preview-card"
        });

        const content = this.draggedContents[this.draggedContents.length - 1];
        card.createEl("div", {
            cls: "highlight-chat-preview-content",
            text: content.text
        });

        const deleteBtn = card.createEl("div", {
            cls: "highlight-chat-preview-delete"
        });
        setIcon(deleteBtn, "x");
        deleteBtn.addEventListener("click", () => {
            const index = this.draggedContents.indexOf(content);
            if (index > -1) {
                this.draggedContents.splice(index, 1);
                card.remove();
                
                // 如果是最后一个卡片，移除整个预览容器
                if (this.draggedContents.length === 0) {
                    const previewMessage = this.currentPreviewContainer?.closest('.highlight-chat-message-preview');
                    if (previewMessage) {
                        previewMessage.remove();
                        this.currentPreviewContainer = null;
                    }
                } else {
                    // 更新计数
                    this.updatePreviewCount();
                }
            }
        });

        // 更新计数
        const countEl = this.currentPreviewContainer.closest('.highlight-chat-message-preview')
            ?.querySelector('.highlight-chat-preview-count');
        if (countEl) {
            countEl.textContent = String(this.draggedContents.length);
        }

        // 滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    show() {
        if (document.body.contains(this.containerEl)) {
            return;
        }

        // 设置初始位置
        this.containerEl.style.right = '30px';
        this.containerEl.style.bottom = '42px';
        
        document.body.appendChild(this.containerEl);

        // 隐藏浮动按钮
        if (this.floatingButton) {
            this.floatingButton.style.display = 'none';
        }

        // 如果有保存的状态，滚动到底部
        if (ChatView.savedState) {
            const chatHistory = this.containerEl.querySelector('.highlight-chat-history');
            if (chatHistory) {
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }
        }

        // 聚焦输入框
        requestAnimationFrame(() => {
            this.textarea?.focus();
        });
    }

    close() {
        // 保存当前状态
        ChatView.savedState = {
            chatHistory: this.chatHistory,
            draggedContents: this.draggedContents,
            containerHTML: this.containerEl.querySelector('.highlight-chat-history')?.innerHTML || null,
            currentPreviewContainer: !!this.currentPreviewContainer
        };

        this.containerEl.remove();
        ChatView.instance = null;

        if (this.floatingButton) {
            this.floatingButton.style.display = 'flex';
        }
    }

    private addMessage(container: HTMLElement, content: string, type: "user" | "assistant") {
        const messageEl = container.createEl("div", {
            cls: `highlight-chat-message highlight-chat-message-${type}`
        });

        const contentEl = messageEl.createEl("div", {
            cls: "highlight-chat-message-content"
        });

        if (type === "assistant") {
            // 为 AI 回复添加打字机效果
            this.typeWriter(contentEl, content);
        } else {
            // 用户消息直接显示
            contentEl.textContent = content;
        }

        container.scrollTop = container.scrollHeight;
    }

    private async typeWriter(element: HTMLElement, text: string, speed: number = 30) {
        let i = 0;
        element.textContent = ''; // 清空内容
        
        // 添加光标
        const cursor = element.createEl("span", {
            cls: "highlight-chat-cursor"
        });

        const type = () => {
            if (i < text.length) {
                element.insertBefore(document.createTextNode(text.charAt(i)), cursor);
                i++;
                setTimeout(type, speed);
            } else {
                // 打字完成后移除光标
                cursor.remove();
            }
        };

        type();
    }

    static getInstance(app: App, plugin: any): ChatView {
        if (!ChatView.instance) {
            ChatView.instance = new ChatView(app, plugin);
        }
        return ChatView.instance;
    }

    // 添加新的输入框实现
    private setupChatInput(inputContainer: HTMLElement) {
        const inputWrapper = inputContainer.createEl('div', {
            cls: 'highlight-chat-input-wrapper'
        });

        // 保存输入框引用
        this.textarea = inputWrapper.createEl('textarea', {
            cls: 'highlight-chat-input',
            attr: {
                placeholder: '输入消息...',
                rows: '1'
            }
        });

        // 自动调整高度
        const adjustHeight = () => {
            if (this.textarea) {  // 添加空值检查
                this.textarea.style.height = 'auto';
                this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 150)}px`;
            }
        };

        // 处理输入事件
        this.textarea.addEventListener('input', () => {
            adjustHeight();
        });

        // 处理按键事件
        this.textarea.addEventListener('keydown', async (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.textarea) {  // 添加空值检查
                    await this.handleSendMessage(this.textarea);
                }
            }
        });

        return this.textarea;
    }

    // 处理发送消息
    private async handleSendMessage(textarea: HTMLTextAreaElement) {
        const content = textarea.value.trim();
        if (!content || this.isProcessing) return;

        try {
            this.isProcessing = true;
            
            // 准备发送的消息内容
            let messageToSend = content;
            let userMessage = content;

            if (this.draggedContents.length > 0) {
                const textsToAnalyze = this.draggedContents
                    .map(h => h.text)
                    .join('\n\n---\n\n');
                
                this.chatHistory.push({ 
                    role: "user", 
                    content: `以下是需要分析的内容：\n\n${textsToAnalyze}`
                });
                
                messageToSend = content;
                userMessage = `用户提示：${content}`;
                
                // 标记当前容器为已发送
                if (this.currentPreviewContainer) {
                    const previewMessage = this.currentPreviewContainer.closest('.highlight-chat-message-preview');
                    if (previewMessage) {
                        previewMessage.addClass('sent');
                    }
                    // 重置容器引用，这样下次拖拽会创建新的容器
                    this.currentPreviewContainer = null;
                    // 清空待发送内容数组，为下一组做准备
                    this.draggedContents = [];
                }
            }

            // 添加用户消息到历史记录
            this.chatHistory.push({ role: "user", content: userMessage });

            // 清空输入框
            requestAnimationFrame(() => {
                textarea.value = '';
                textarea.style.height = 'auto';
                textarea.dispatchEvent(new Event('input'));
            });

            // 添加用户消息到UI
            const chatHistoryEl = this.containerEl.querySelector('.highlight-chat-history') as HTMLElement;
            if (chatHistoryEl) {
                this.addMessage(chatHistoryEl, content, "user");
                
                // 获取 AI 响应，传入完整的对话历史
                const response = await this.chatService.sendMessage(messageToSend, this.chatHistory);
                
                // 添加 AI 响应到历史记录
                this.chatHistory.push({ role: "assistant", content: response.content });
                
                // 添加 AI 响应到UI
                this.addMessage(chatHistoryEl, response.content, "assistant");
            }

        } catch (error) {
            console.error('Failed to get AI response:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // 添加更新预览计数的辅助方法
    private updatePreviewCount() {
        if (this.currentPreviewContainer) {
            const previewMessage = this.currentPreviewContainer.closest('.highlight-chat-message-preview');
            const countEl = previewMessage?.querySelector('.highlight-chat-preview-count');
            
            if (countEl) {
                countEl.textContent = String(this.draggedContents.length);
                
                // 当没有高亮内容时，隐藏整个预览消息
                if (this.draggedContents.length === 0 && previewMessage) {
                    previewMessage.remove();
                    this.currentPreviewContainer = null;
                }
            }
        }
    }

    // 清空对话内容
    private clearChat() {
        // 清空对话历史
        this.chatHistory = [];
        
        // 清空拖拽内容
        this.draggedContents = [];
        
        // 清空预览容器
        if (this.currentPreviewContainer) {
            const previewMessage = this.currentPreviewContainer.closest('.highlight-chat-message-preview');
            if (previewMessage) {
                previewMessage.remove();
            }
            this.currentPreviewContainer = null;
        }

        // 清空聊天历史区域
        const chatHistoryEl = this.containerEl.querySelector('.highlight-chat-history');
        if (chatHistoryEl) {
            chatHistoryEl.innerHTML = '';
        }

        // 清空输入框
        if (this.textarea) {
            this.textarea.value = '';
            this.textarea.style.height = 'auto';
        }
    }
} 
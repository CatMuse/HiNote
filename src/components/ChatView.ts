import { ItemView, App } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';
import { CommentInput } from './comment/CommentInput';
import { HighlightInfo } from '../types';

export class ChatView {
    private static instance: ChatView | null = null;
    private chatService: ChatService;
    private isProcessing: boolean = false;
    private containerEl: HTMLElement;
    private draggedContents: HighlightInfo[] = [];
    private dropZone: HTMLElement;

    constructor(app: App, private plugin: any) {
        if (ChatView.instance) {
            return ChatView.instance;
        }

        this.chatService = new ChatService(this.plugin);
        
        // 创建容器
        this.containerEl = document.createElement('div');
        this.containerEl.addClass("highlight-chat-window");
        
        // 添加标题栏
        const header = this.containerEl.createEl("div", {
            cls: "highlight-chat-header"
        });

        // 添加标题文本
        header.createEl("div", {
            cls: "highlight-chat-title",
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
                    if (this.draggedContents.length > 0) {
                        const textsToAnalyze = this.draggedContents
                            .map(h => h.text)
                            .join('\n\n---\n\n');
                        prompt = `分析以下内容：\n\n${textsToAnalyze}\n\n用户提示：${content}`;
                        this.draggedContents = []; // 清空拖拽内容
                    }

                    // 先清空输入框
                    const textarea = inputContainer.querySelector('.highlight-comment-input textarea') as HTMLTextAreaElement;
                    if (textarea) {
                        // 使用 requestAnimationFrame 确保在下一帧清空
                        requestAnimationFrame(() => {
                            textarea.value = '';
                            textarea.dispatchEvent(new Event('input'));
                        });
                    }

                    this.addMessage(chatHistory, content, "user");
                    const response = await this.chatService.sendMessage(prompt);
                    this.addMessage(chatHistory, response.content, "assistant");

                    // 重新显示拖拽区域
                    this.dropZone.style.display = '';
                    this.removeDraggedPreviews(chatHistory);
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
        this.dropZone = chatHistory.createEl("div", {
            cls: "highlight-chat-dropzone",
            text: "将高亮内容拖拽到此处发送给 AI"
        });

        // 添加拖拽事件处理
        this.dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            this.dropZone.addClass("drag-over");
        });

        this.dropZone.addEventListener("dragleave", () => {
            this.dropZone.removeClass("drag-over");
        });

        this.dropZone.addEventListener("drop", async (e) => {
            e.preventDefault();
            this.dropZone.removeClass("drag-over");

            const highlightData = e.dataTransfer?.getData("application/highlight");
            if (highlightData) {
                try {
                    const highlight = JSON.parse(highlightData);
                    if (!highlight.text) return;

                    this.draggedContents.push(highlight);
                    
                    this.showDraggedPreviews(chatHistory);
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
            if (e.target === closeButton) return; // 如果点击的是关闭按钮，不启动拖拽

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

        ChatView.instance = this;
    }

    private showDraggedPreviews(container: HTMLElement) {
        // 先清除现有预览
        this.removeDraggedPreviews(container);

        // 创建预览容器
        const previewsContainer = container.createEl("div", {
            cls: "highlight-chat-previews"
        });

        // 修改提示文本，添加可继续拖拽的提示
        previewsContainer.createEl("div", {
            cls: "highlight-chat-preview-header",
            text: `已选择 ${this.draggedContents.length} 条内容（可继续拖入）：`
        });

        // 创建卡片堆叠容器
        const cardsContainer = previewsContainer.createEl("div", {
            cls: "highlight-chat-preview-cards"
        });

        // 为每个内容创建预览卡片
        this.draggedContents.forEach((content, index) => {
            const card = cardsContainer.createEl("div", {
                cls: "highlight-chat-preview-card"
            });

            // 添加删除按钮
            const deleteBtn = card.createEl("div", {
                cls: "highlight-chat-preview-delete"
            });
            deleteBtn.innerHTML = "×";
            deleteBtn.addEventListener("click", () => {
                this.draggedContents.splice(index, 1);
                if (this.draggedContents.length === 0) {
                    this.dropZone.style.display = '';
                    this.removeDraggedPreviews(container);
                } else {
                    this.showDraggedPreviews(container);
                }
            });

            card.createEl("div", {
                cls: "highlight-chat-preview-content",
                text: content.text
            });
        });
    }

    private removeDraggedPreviews(container: HTMLElement) {
        const previews = container.querySelector('.highlight-chat-previews');
        if (previews) {
            previews.remove();
        }
    }

    show() {
        if (document.body.contains(this.containerEl)) {
            return;
        }

        // 设置初始位置
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const chatWidth = 350;
        const chatHeight = windowHeight * 0.6;

        this.containerEl.style.right = '30px';
        this.containerEl.style.bottom = '90px';
        
        document.body.appendChild(this.containerEl);
    }

    close() {
        this.containerEl.remove();
        ChatView.instance = null;
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
} 
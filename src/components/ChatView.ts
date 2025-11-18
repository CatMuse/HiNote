import { ItemView, App, setIcon, Menu, MenuItem, Notice, MarkdownRenderer, Component } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';
import { HighlightInfo, ChatViewState, AIModel, DEFAULT_SILICONFLOW_MODELS } from '../types';
import { ContextService, ContextOptions } from '../services/ContextService';
import { t } from "src/i18n";
import { AIProviderType } from '../services/ai';

export class ChatView extends Component {
    public static instance: ChatView | null = null;
    private chatService: ChatService;
    private contextService: ContextService;
    private isProcessing: boolean = false;
    private containerEl: HTMLElement;
    private draggedContents: HighlightInfo[] = [];
    private chatHistory: { role: "user" | "assistant", content: string }[] = [];
    private floatingButton: HTMLElement | null;
    private currentPreviewContainer: HTMLElement | null = null;
    private static savedState: ChatViewState | null = null;
    private textarea: HTMLTextAreaElement | null = null;  // Add textarea reference
    private app: App;
    private contextOptions: ContextOptions;

    constructor(app: App, private plugin: any) {
        super();
        
        if (ChatView.instance) {
            return ChatView.instance;
        }

        this.app = app;
        this.chatService = new ChatService(this.plugin);
        this.contextService = new ContextService(app);
        
        // Initialize context options from plugin settings
        this.contextOptions = {
            strategy: this.plugin.settings.contextOptions?.strategy || 'smart',
            includeTitle: this.plugin.settings.contextOptions?.includeTitle ?? true,
            maxLength: this.plugin.settings.contextOptions?.maxLength || 2000,
            surroundingLines: this.plugin.settings.contextOptions?.surroundingLines || 3
        };
        this.floatingButton = document.querySelector('.highlight-floating-button');
        
        // Create container
        this.containerEl = document.createElement('div');
        this.containerEl.addClass("highlight-chat-window");
        
        // Add title bar
        const header = this.containerEl.createEl("div", {
            cls: "highlight-chat-header"
        });

        // Add title and model name
        const titleContainer = header.createEl("div", {
            cls: "highlight-chat-title"
        });
        
        titleContainer.createEl("span", {
            text: t("Chat")
        });

        const modelSelector = titleContainer.createEl("div", {
            cls: "highlight-chat-model",
            text: this.getCurrentModelName()
        });

        // Add click event handler
        modelSelector.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            this.showModelSelector(modelSelector, e);
        });

        // Add button container
        const buttonsContainer = header.createEl("div", {
            cls: "highlight-chat-buttons"
        });

        // Add clear button
        const clearButton = buttonsContainer.createEl("div", {
            cls: "highlight-chat-clear"
        });
        setIcon(clearButton, "eraser");
        clearButton.addEventListener("click", () => this.clearChat());

        // Add close button
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

        // Add resize handle
        const resizeHandle = this.containerEl.createEl("div", {
            cls: "highlight-chat-resize-handle"
        });
        this.setupResizeHandle(resizeHandle);

        // Create a temporary HighlightInfo object
        const dummyHighlight: HighlightInfo = {
            id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: "",
            position: 0,
            paragraphOffset: 0,
            paragraphId: "chat",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            comments: []
        };

        // Add drag event handlers to the entire history area
        chatHistory.addEventListener("dragenter", (e: DragEvent) => {
            e.preventDefault();
            chatHistory.addClass("drag-over");
        });

        chatHistory.addEventListener("dragover", (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            chatHistory.addClass("drag-over");

            // Calculate visible area position of chat history
            const chatHistoryRect = chatHistory.getBoundingClientRect();
            const visibleTop = chatHistory.scrollTop;  // Current scroll position
            const visibleHeight = chatHistoryRect.height;  // Visible area height
            
            // Set dashed box position to always stay within visible area
            chatHistory.addClass('highlight-chat-history-drag-guide');
            chatHistory.style.setProperty('--drag-guide-top', `${visibleTop + 12}px`);  // Leave 12px margin at top
            chatHistory.style.setProperty('--drag-guide-height', `${visibleHeight - 24}px`);  // Height minus top/bottom margins

            // Update preview element position
            const preview = document.querySelector('.highlight-dragging') as HTMLElement;
            if (preview) {
                preview.addClass('highlight-chat-preview');
                preview.style.left = `${e.clientX + 10}px`;
                preview.style.top = `${e.clientY + 10}px`;
            }
        });

        chatHistory.addEventListener("dragleave", (e: DragEvent) => {
            if (!chatHistory.contains(e.relatedTarget as Node)) {
                chatHistory.removeClass("drag-over");
            }
        });

        chatHistory.addEventListener("drop", async (e: DragEvent) => {
            e.preventDefault();
            chatHistory.removeClass("drag-over");

            const highlightData = e.dataTransfer?.getData("application/highlight");

            if (highlightData) {
                try {
                    const highlight = JSON.parse(highlightData);

                    if (!highlight.text) {
                        return;
                    }

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

                }
            }
        });

        // 添加标题栏拖拽功能
        let isDragging = false;
        let currentX: number;
        let currentY: number;
        let initialX: number;
        let initialY: number;

        header.addEventListener("mousedown", (e: MouseEvent) => {
            if (e.target === closeButton || e.target === clearButton) return; // 如果点击的是关闭按钮或清空按钮不启动拖拽

            isDragging = true;
            initialX = e.clientX - this.containerEl.offsetLeft;
            initialY = e.clientY - this.containerEl.offsetTop;

            header.addClass("dragging");
        });

        document.addEventListener("mousemove", (e: MouseEvent) => {
            if (!isDragging) return;

            e.preventDefault();
            
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // 确保窗口不会被拖出视图
            const maxX = window.innerWidth - this.containerEl.offsetWidth;
            const maxY = window.innerHeight - this.containerEl.offsetHeight;
            
            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            this.containerEl.addClass('highlight-chat-window');
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
            const chatHistory = this.containerEl.querySelector('.highlight-chat-history') as HTMLElement;
            if (chatHistory) {
                // 清空现有内容
                while (chatHistory.firstChild) {
                    chatHistory.removeChild(chatHistory.firstChild);
                }

                // 重建消息历史（恢复时不使用打字机效果）
                this.chatHistory.forEach(msg => {
                    this.addMessage(chatHistory, msg.content, msg.role, false);
                });

                // 如果有拖拽内容，重建预览卡片
                if (this.draggedContents.length > 0) {
                    this.showDraggedPreviewsInChat(chatHistory);
                }

                // 如果有活跃的预览容器，恢复引用
                if (ChatView.savedState.currentPreviewContainer) {
                    this.currentPreviewContainer = chatHistory.querySelector('.highlight-chat-preview-cards') as HTMLElement;
                }
            }
        }

        ChatView.instance = this;
    }
    
    // Save context options to plugin settings
    private async saveContextOptions() {
        if (!this.plugin.settings.contextOptions) {
            this.plugin.settings.contextOptions = {};
        }
        
        this.plugin.settings.contextOptions.strategy = this.contextOptions.strategy;
        this.plugin.settings.contextOptions.includeTitle = this.contextOptions.includeTitle;
        this.plugin.settings.contextOptions.maxLength = this.contextOptions.maxLength;
        this.plugin.settings.contextOptions.surroundingLines = this.contextOptions.surroundingLines;
        
        await this.plugin.saveSettings();
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

            // 左侧：计数和标题
            const headerLeft = headerEl.createEl("div", {
                cls: "highlight-chat-preview-header-left"
            });

            headerLeft.createEl("span", {
                cls: "highlight-chat-preview-count",
                text: String(this.draggedContents.length)
            });

            headerLeft.createSpan({
                text: t("highlighted notes")
            });

            // 右侧：预览按钮
            const headerRight = headerEl.createEl("div", {
                cls: "highlight-chat-preview-header-right"
            });

            const previewBtn = headerRight.createEl("div", {
                cls: "highlight-chat-preview-btn",
                attr: {
                    title: "Preview"
                }
            });
            setIcon(previewBtn, "eye");

            previewBtn.addEventListener('click', () => {
                this.showContextPreviewWithSettings();
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
        // 如果容器已经存在，只需显示即可
        if (document.body.contains(this.containerEl)) {
            this.containerEl.removeClass('highlight-chat-hidden');
        } else {
            // 第一次创建时初始化
            this.containerEl.addClass("highlight-chat-window");
            this.containerEl.addClass("highlight-chat-window-position");
            // 添加浮动窗口的CSS类
            document.body.appendChild(this.containerEl);
        }

        // 隐藏所有浮动按钮
        document.querySelectorAll('.highlight-floating-button').forEach(btn => {
            (btn as HTMLElement).style.display = 'none';
        });

        // 聚焦输入框
        requestAnimationFrame(() => {
            this.textarea?.focus();
        });
    }

    close() {
        // 只隐藏而不移除
        this.containerEl.addClass('highlight-chat-hidden');

        // 显示所有浮动按钮
        document.querySelectorAll('.highlight-floating-button').forEach(btn => {
            (btn as HTMLElement).style.display = '';
        });
    }

    private addMessage(container: HTMLElement, content: string, type: "user" | "assistant", useTypeWriter: boolean = true) {
        const messageEl = container.createEl("div", {
            cls: "highlight-chat-message"
        });

        const contentEl = messageEl.createEl("div", {
            cls: "highlight-chat-message-content markdown-rendered"
        });

        // 添加类型特定的样式
        messageEl.addClass(`highlight-chat-message-${type}`);
        contentEl.addClass(`highlight-chat-message-content-${type}`);

        if (type === "assistant" && useTypeWriter) {
            // 为新的 AI 回复添加打字机效果
            this.typeWriter(contentEl, content);
        } else {
            // 用户消息或恢复的消息使用 Markdown 渲染
            this.renderMarkdownContent(contentEl, content);
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
                
                // 打字完成后渲染 Markdown
                this.renderMarkdownContent(element, text);
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
    
    // 新方法：使用 Obsidian 的 MarkdownRenderer 渲染 Markdown 内容
    private async renderMarkdownContent(containerEl: HTMLElement, content: string) {
        // 清空容器
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
        
        try {
            // 使用 Obsidian 的 MarkdownRenderer.render 方法（替代过期的 renderMarkdown）
            // 使用新的 Component 实例代替 this，避免继承复杂的样式规则
            await MarkdownRenderer.render(
                this.app,
                content,
                containerEl,
                '',  // 没有关联文件路径
                new Component()
            );
            
            // 添加自定义样式类以修复可能的样式问题
            const lists = containerEl.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.addClass('chat-markdown-list');
            });
        } catch (error) {
            console.error('Error rendering markdown in chat:', error);
            
            // 如果渲染失败，回退到纯文本渲染
            containerEl.textContent = content;
        }
    }

    // 添加调整大小手柄的设置方法
    private setupResizeHandle(resizeHandle: HTMLElement) {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            
            const rect = this.containerEl.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            
            this.containerEl.addClass('resizing');
        });

        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            const newWidth = Math.max(300, startWidth + deltaX); // 最小宽度 300px
            const newHeight = Math.max(300, startHeight + deltaY); // 最小高度 300px
            
            // 限制最大尺寸
            const maxWidth = Math.min(newWidth, window.innerWidth * 0.9);
            const maxHeight = Math.min(newHeight, window.innerHeight * 0.9);
            
            this.containerEl.style.width = `${maxWidth}px`;
            this.containerEl.style.height = `${maxHeight}px`;
        };

        const handleMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            this.containerEl.removeClass('resizing');
        };
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
                placeholder: t ('Input message...'),
                rows: '1'
            }
        });

        // 自动调整高度
        const adjustHeight = () => {
            if (this.textarea) {  // 添加空值检查
                this.textarea.addClass('highlight-chat-input');
                this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 150)}px`;
            }
        };

        // 处理输入事件
        this.textarea.addEventListener('input', () => {
            adjustHeight();
        });

        // 处理按键事件
        this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.textarea) {  // 添加空值检查
                    this.handleSendMessage(this.textarea);
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
                // 获取所有高亮内容的上下文
                const contextsPromises = this.draggedContents.map(highlight => 
                    this.contextService.getContextForHighlight(highlight, this.contextOptions)
                );
                
                const contexts = await Promise.all(contextsPromises);
                
                // 构建包含上下文的消息
                const contextualContents = contexts.map((context, index) => {
                    const highlight = this.draggedContents[index];
                    if (!context) {
                        return `**高亮内容 ${index + 1}:**\n${highlight.text}`;
                    }
                    
                    let contextMessage = `**Highlight ${index + 1}** (from: ${context.fileName}):\n`;
                    
                    // 添加章节标题（如果有）
                    if (context.sectionTitle) {
                        contextMessage += `**Section:** ${context.sectionTitle}\n\n`;
                    }
                    
                    // 添加上下文
                    if (context.beforeContext.trim()) {
                        contextMessage += `**Before:**\n${context.beforeContext.trim()}\n\n`;
                    }
                    
                    contextMessage += `**Highlight:**\n${highlight.text}\n\n`;
                    
                    if (context.afterContext.trim()) {
                        contextMessage += `**After:**\n${context.afterContext.trim()}`;
                    }
                    
                    return contextMessage;
                }).join('\n\n---\n\n');
                
                this.chatHistory.push({ 
                    role: "user", 
                    content: `以下是需要分析的内容（包含上下文）：\n\n${contextualContents}`
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
                textarea.addClass('highlight-chat-input');
                textarea.dispatchEvent(new Event('input'));
            });

            // 添加用户消息到UI（新消息使用打字机效果）
            const chatHistoryEl = this.containerEl.querySelector('.highlight-chat-history') as HTMLElement;
            if (chatHistoryEl) {
                this.addMessage(chatHistoryEl, content, "user", true);
                
                // 获取 AI 响应，传入完整的对话历史
                const response = await this.chatService.sendMessage(messageToSend, this.chatHistory);
                
                // 添加 AI 响应到历史记录
                this.chatHistory.push({ role: "assistant", content: response.content });
                
                // 添加 AI 响应到UI（新消息使用打字机效果）
                this.addMessage(chatHistoryEl, response.content, "assistant", true);
            }

        } catch (error) {
            console.error('发送消息时出错:', error);
            new Notice('Failed to send message, please try again');
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

    // 设置上下文控制功能
    private setupContextControls(container: HTMLElement) {
        // 上下文策略选择器
        const strategySelector = container.createEl("select", {
            cls: "highlight-chat-context-strategy",
            attr: {
                title: "选择上下文获取策略"
            }
        });

        const strategies = [
            { value: 'smart', label: '智能上下文' },
            { value: 'paragraph', label: '段落上下文' },
            { value: 'section', label: '章节上下文' },
            { value: 'surrounding', label: '邻近行数' }
        ];

        strategies.forEach(strategy => {
            const option = strategySelector.createEl("option", {
                value: strategy.value,
                text: strategy.label
            });
            if (strategy.value === this.contextOptions.strategy) {
                option.selected = true;
            }
        });

        strategySelector.addEventListener('change', () => {
            this.contextOptions.strategy = strategySelector.value as any;
        });

        // 上下文长度控制
        const lengthControl = container.createEl("div", {
            cls: "highlight-chat-context-length"
        });

        const lengthLabel = lengthControl.createEl("span", {
            cls: "highlight-chat-context-length-label",
            text: "长度:"
        });

        const lengthSlider = lengthControl.createEl("input", {
            type: "range",
            cls: "highlight-chat-context-length-slider",
            attr: {
                min: "500",
                max: "5000",
                step: "500",
                value: String(this.contextOptions.maxLength || 2000),
                title: "调整上下文最大长度"
            }
        }) as HTMLInputElement;

        const lengthValue = lengthControl.createEl("span", {
            cls: "highlight-chat-context-length-value",
            text: String(this.contextOptions.maxLength || 2000)
        });

        lengthSlider.addEventListener('input', () => {
            const value = parseInt(lengthSlider.value);
            this.contextOptions.maxLength = value;
            lengthValue.textContent = String(value);
        });

        // 预览按钮
        const previewBtn = container.createEl("button", {
            cls: "highlight-chat-context-preview",
            text: "预览",
            attr: {
                title: "预览将要发送给AI的内容"
            }
        });

        previewBtn.addEventListener('click', () => {
            this.showContextPreview();
        });

        // 设置按钮
        const settingsBtn = container.createEl("button", {
            cls: "highlight-chat-context-settings",
            attr: {
                title: "上下文设置"
            }
        });
        setIcon(settingsBtn, "settings");

        settingsBtn.addEventListener('click', (e) => {
            this.showContextSettingsMenu(settingsBtn, e);
        });
    }

    // 显示上下文预览和设置
    private async showContextPreviewWithSettings() {
        if (this.draggedContents.length === 0) {
            new Notice('没有高亮内容可预览');
            return;
        }

        // 创建主模态框
        const modal = this.app.workspace.containerEl.createEl('div', {
            cls: 'highlight-chat-context-modal'
        });

        const overlay = modal.createEl('div', {
            cls: 'highlight-chat-context-overlay'
        });

        const content = modal.createEl('div', {
            cls: 'highlight-chat-context-content'
        });

        // 标题栏
        const header = content.createEl('div', {
            cls: 'highlight-chat-context-header'
        });

        header.createEl('h3', {
            text: 'Context Preview & Settings'
        });

        const closeBtn = header.createEl('div', {
            cls: 'highlight-chat-context-close'
        });
        setIcon(closeBtn, 'x');

        // 主体区域
        const body = content.createEl('div', {
            cls: 'highlight-chat-context-body'
        });

        // 防抖自动刷新功能
        let refreshTimeout: NodeJS.Timeout;
        const autoRefresh = () => {
            clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
                updatePreview();
            }, 300); // 300ms 防抖延迟
        };

        // 左侧：设置面板
        const settingsPanel = body.createEl('div', {
            cls: 'highlight-chat-context-settings-panel'
        });

        this.createSettingsPanel(settingsPanel, autoRefresh);

        // 右侧：预览区域
        const previewPanel = body.createEl('div', {
            cls: 'highlight-chat-context-preview-panel'
        });

        const previewHeader = previewPanel.createEl('div', {
            cls: 'highlight-chat-context-preview-panel-header'
        });

        previewHeader.createEl('h4', {
            text: 'Preview Content (Auto-update)'
        });

        const previewContent = previewPanel.createEl('div', {
            cls: 'highlight-chat-context-preview-content'
        });

        // 底部按钮
        const footer = content.createEl('div', {
            cls: 'highlight-chat-context-footer'
        });

        const statsDiv = footer.createEl('div', {
            cls: 'highlight-chat-context-stats'
        });

        const buttonsDiv = footer.createEl('div', {
            cls: 'highlight-chat-context-buttons'
        });

        const cancelBtn = buttonsDiv.createEl('button', {
            cls: 'highlight-chat-context-cancel',
            text: 'Cancel'
        });

        const confirmBtn = buttonsDiv.createEl('button', {
            cls: 'highlight-chat-context-confirm',
            text: 'Apply'
        });

        // 初始化预览内容
        const updatePreview = async () => {
            try {
                previewContent.empty();
                previewContent.createEl('div', {
                    cls: 'highlight-chat-context-loading',
                    text: 'Generating preview...'
                });

                const contexts = await this.generateContextPreview();
                previewContent.empty();
                this.renderMarkdownContent(previewContent, contexts.content);
                
                statsDiv.textContent = `Characters: ${contexts.content.length} | Highlights: ${this.draggedContents.length}`;
            } catch (error) {
                previewContent.empty();
                previewContent.createEl('div', {
                    cls: 'highlight-chat-context-error',
                    text: 'Preview generation failed'
                });
            }
        };
        
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            // 使用当前设置，不做额外操作
            closeModal();
            new Notice('Context settings applied');
        });

        // ESC 键关闭
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);

        // 初始化预览
        await updatePreview();
    }

    // 创建设置面板
    private createSettingsPanel(container: HTMLElement, autoRefresh: () => void) {
        // 策略设置
        const strategySection = container.createEl('div', {
            cls: 'highlight-chat-settings-section'
        });

        strategySection.createEl('h5', {
            text: 'Context Strategy'
        });

        const strategySelector = strategySection.createEl('select', {
            cls: 'highlight-chat-settings-select'
        });

        const strategies = [
            { value: 'smart', label: 'Smart Context - Auto-select best strategy' },
            { value: 'paragraph', label: 'Paragraph Context - Get complete paragraphs' },
            { value: 'section', label: 'Section Context - Get entire sections' },
            { value: 'surrounding', label: 'Surrounding Lines - Specify before/after lines' }
        ];

        strategies.forEach(strategy => {
            const option = strategySelector.createEl('option', {
                value: strategy.value,
                text: strategy.label
            });
            if (strategy.value === this.contextOptions.strategy) {
                option.selected = true;
            }
        });

        strategySelector.addEventListener('change', async () => {
            this.contextOptions.strategy = strategySelector.value as any;
            await this.saveContextOptions();
            this.updateSurroundingLinesVisibility(container);
            autoRefresh(); // 自动刷新预览
        });

        // 长度设置
        const lengthSection = container.createEl('div', {
            cls: 'highlight-chat-settings-section'
        });

        lengthSection.createEl('h5', {
            text: 'Context Length'
        });

        const lengthContainer = lengthSection.createEl('div', {
            cls: 'highlight-chat-settings-slider-container'
        });

        const lengthSlider = lengthContainer.createEl('input', {
            type: 'range',
            cls: 'highlight-chat-settings-slider',
            attr: {
                min: '500',
                max: '5000',
                step: '500',
                value: String(this.contextOptions.maxLength || 2000)
            }
        }) as HTMLInputElement;

        const lengthValue = lengthContainer.createEl('span', {
            cls: 'highlight-chat-settings-value',
            text: `${this.contextOptions.maxLength || 2000} chars`
        });

        lengthSlider.addEventListener('input', async () => {
            const value = parseInt(lengthSlider.value);
            this.contextOptions.maxLength = value;
            lengthValue.textContent = `${value} chars`;
            await this.saveContextOptions();
            autoRefresh(); // 自动刷新预览
        });

        // 邻近行数设置（仅在 surrounding 策略下显示）
        const surroundingSection = container.createEl('div', {
            cls: 'highlight-chat-settings-section highlight-chat-surrounding-section'
        });

        surroundingSection.createEl('h5', {
            text: 'Surrounding Lines'
        });

        const surroundingContainer = surroundingSection.createEl('div', {
            cls: 'highlight-chat-settings-slider-container'
        });

        const surroundingSlider = surroundingContainer.createEl('input', {
            type: 'range',
            cls: 'highlight-chat-settings-slider',
            attr: {
                min: '1',
                max: '10',
                step: '1',
                value: String(this.contextOptions.surroundingLines || 3)
            }
        }) as HTMLInputElement;

        const surroundingValue = surroundingContainer.createEl('span', {
            cls: 'highlight-chat-settings-value',
            text: `${this.contextOptions.surroundingLines || 3} lines`
        });

        surroundingSlider.addEventListener('input', async () => {
            const value = parseInt(surroundingSlider.value);
            this.contextOptions.surroundingLines = value;
            surroundingValue.textContent = `${value} lines`;
            await this.saveContextOptions();
            autoRefresh(); // 自动刷新预览
        });

        // 其他选项
        const optionsSection = container.createEl('div', {
            cls: 'highlight-chat-settings-section'
        });

        optionsSection.createEl('h5', {
            text: 'Other Options'
        });

        const includeTitleCheckbox = optionsSection.createEl('label', {
            cls: 'highlight-chat-settings-checkbox'
        });

        const titleInput = includeTitleCheckbox.createEl('input', {
            type: 'checkbox'
        }) as HTMLInputElement;
        titleInput.checked = this.contextOptions.includeTitle || false;

        includeTitleCheckbox.createSpan({
            text: ' Include section titles'
        });

        titleInput.addEventListener('change', async () => {
            this.contextOptions.includeTitle = titleInput.checked;
            await this.saveContextOptions();
            autoRefresh(); // 自动刷新预览
        });

        // 初始化显示状态
        this.updateSurroundingLinesVisibility(container);

        // 重置按钮
        const resetBtn = container.createEl('button', {
            cls: 'highlight-chat-settings-reset',
            text: 'Reset to defaults'
        });

        resetBtn.addEventListener('click', async () => {
            this.contextOptions = {
                strategy: 'smart',
                includeTitle: true,
                maxLength: 2000,
                surroundingLines: 3
            };

            // 更新 UI
            strategySelector.value = 'smart';
            lengthSlider.value = '2000';
            lengthValue.textContent = '2000 chars';
            surroundingSlider.value = '3';
            surroundingValue.textContent = '3 lines';
            titleInput.checked = true;
            
            await this.saveContextOptions();
            this.updateSurroundingLinesVisibility(container);
            new Notice('Reset to default settings');
            autoRefresh(); // 自动刷新预览
        });
    }

    // 更新邻近行数设置的显示状态
    private updateSurroundingLinesVisibility(container: HTMLElement) {
        const surroundingSection = container.querySelector('.highlight-chat-surrounding-section') as HTMLElement;
        if (surroundingSection) {
            if (this.contextOptions.strategy === 'surrounding') {
                surroundingSection.style.display = 'block';
            } else {
                surroundingSection.style.display = 'none';
            }
        }
    }

    // 生成上下文预览
    private async generateContextPreview(): Promise<{ content: string }> {
        const contextsPromises = this.draggedContents.map(highlight => 
            this.contextService.getContextForHighlight(highlight, this.contextOptions)
        );
        
        const contexts = await Promise.all(contextsPromises);
        
        const contextualContents = contexts.map((context, index) => {
            const highlight = this.draggedContents[index];
            if (!context) {
                return `**Highlight ${index + 1}:**\n${highlight.text}`;
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

        return { content: contextualContents };
    }

    // 显示上下文预览（旧版本，保留兼容）
    private async showContextPreview() {
        if (this.draggedContents.length === 0) {
            new Notice('没有高亮内容可预览');
            return;
        }

        try {
            // 获取上下文
            const contextsPromises = this.draggedContents.map(highlight => 
                this.contextService.getContextForHighlight(highlight, this.contextOptions)
            );
            
            const contexts = await Promise.all(contextsPromises);
            
            // 构建预览内容
            const contextualContents = contexts.map((context, index) => {
                const highlight = this.draggedContents[index];
                if (!context) {
                    return `**高亮内容 ${index + 1}:**\n${highlight.text}`;
                }
                
                let contextMessage = `**高亮内容 ${index + 1}** (来自: ${context.fileName}):\n`;
                
                if (context.sectionTitle) {
                    contextMessage += `**章节:** ${context.sectionTitle}\n\n`;
                }
                
                if (context.beforeContext.trim()) {
                    contextMessage += `**前文:**\n${context.beforeContext.trim()}\n\n`;
                }
                
                contextMessage += `**高亮内容:**\n${highlight.text}\n\n`;
                
                if (context.afterContext.trim()) {
                    contextMessage += `**后文:**\n${context.afterContext.trim()}`;
                }
                
                return contextMessage;
            }).join('\n\n---\n\n');

            // 创建预览模态框
            const modal = this.app.workspace.containerEl.createEl('div', {
                cls: 'highlight-chat-context-preview-modal'
            });

            const overlay = modal.createEl('div', {
                cls: 'highlight-chat-context-preview-overlay'
            });

            const content = modal.createEl('div', {
                cls: 'highlight-chat-context-preview-content'
            });

            const header = content.createEl('div', {
                cls: 'highlight-chat-context-preview-header'
            });

            header.createEl('h3', {
                text: '上下文预览'
            });

            const closeBtn = header.createEl('button', {
                cls: 'highlight-chat-context-preview-close'
            });
            setIcon(closeBtn, 'x');

            const body = content.createEl('div', {
                cls: 'highlight-chat-context-preview-body'
            });

            const previewContent = body.createEl('div', {
                cls: 'highlight-chat-context-preview-text'
            });

            // 使用 Markdown 渲染器显示内容
            this.renderMarkdownContent(previewContent, contextualContents);

            const footer = content.createEl('div', {
                cls: 'highlight-chat-context-preview-footer'
            });

            const stats = footer.createEl('div', {
                cls: 'highlight-chat-context-preview-stats',
                text: `字符数: ${contextualContents.length} | 高亮数: ${this.draggedContents.length}`
            });

            // 关闭事件
            const closeModal = () => {
                modal.remove();
            };

            closeBtn.addEventListener('click', closeModal);
            overlay.addEventListener('click', closeModal);

            // ESC 键关闭
            const handleKeydown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    closeModal();
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);

        } catch (error) {
            console.error('预览上下文时出错:', error);
            new Notice('预览上下文失败');
        }
    }

    // 显示上下文设置菜单
    private showContextSettingsMenu(button: HTMLElement, event: MouseEvent) {
        const menu = new Menu();

        // 包含标题选项
        menu.addItem((item) => {
            item.setTitle('包含章节标题')
                .setChecked(this.contextOptions.includeTitle || false)
                .onClick(() => {
                    this.contextOptions.includeTitle = !this.contextOptions.includeTitle;
                });
        });

        menu.addSeparator();

        // 邻近行数设置（仅在 surrounding 策略下显示）
        if (this.contextOptions.strategy === 'surrounding') {
            menu.addItem((item) => {
                item.setTitle(`邻近行数: ${this.contextOptions.surroundingLines || 3}`)
                    .onClick(() => {
                        // 这里可以添加一个输入框来设置行数
                        const lines = prompt('请输入邻近行数 (1-10):', String(this.contextOptions.surroundingLines || 3));
                        if (lines) {
                            const num = parseInt(lines);
                            if (num >= 1 && num <= 10) {
                                this.contextOptions.surroundingLines = num;
                            }
                        }
                    });
            });
        }

        // 重置为默认设置
        menu.addSeparator();
        menu.addItem((item) => {
            item.setTitle('重置为默认设置')
                .onClick(() => {
                    this.contextOptions = {
                        strategy: 'smart',
                        includeTitle: true,
                        maxLength: 2000
                    };
                    
                    // 更新 UI 控件
                    const strategySelector = button.parentElement?.querySelector('.highlight-chat-context-strategy') as HTMLSelectElement;
                    const lengthSlider = button.parentElement?.querySelector('.highlight-chat-context-length-slider') as HTMLInputElement;
                    const lengthValue = button.parentElement?.querySelector('.highlight-chat-context-length-value');
                    
                    if (strategySelector) strategySelector.value = 'smart';
                    if (lengthSlider) lengthSlider.value = '2000';
                    if (lengthValue) lengthValue.textContent = '2000';
                    
                    new Notice('已重置为默认设置');
                });
        });

        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
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
            while (chatHistoryEl.firstChild) {
                chatHistoryEl.removeChild(chatHistoryEl.firstChild);
            }
        }

        // 清空输入框
        if (this.textarea) {
            this.textarea.value = '';
            this.textarea.addClass('highlight-chat-input');
        }
    }

    // 存储对话窗口的模型状态
    private chatModelState = {
        provider: '',
        model: ''
    };

    private getCurrentModelName(): string {
        const aiSettings = this.plugin.settings.ai;
        const provider = this.chatModelState.provider || aiSettings.provider;
        
        switch (provider) {
            case 'openai':
                return this.chatModelState.model || aiSettings.openai?.model || 'GPT-4';
            case 'anthropic':
                return this.chatModelState.model || aiSettings.anthropic?.model || 'Claude-3';
            case 'ollama':
                return this.chatModelState.model || aiSettings.ollama?.model || 'Ollama';
            case 'gemini':
                return this.chatModelState.model || aiSettings.gemini?.model || 'Gemini Pro';
            case 'deepseek':
                return this.chatModelState.model || aiSettings.deepseek?.model || 'Deepseek Chat';
            case 'siliconflow':
                // 如果有自定义模型，优先使用自定义模型名称
                if (aiSettings.siliconflow?.isCustomModel && aiSettings.siliconflow?.model) {
                    return aiSettings.siliconflow.model;
                }
                // 如果有当前选择的模型，使用当前模型
                if (this.chatModelState.model) {
                    return this.chatModelState.model;
                }
                // 否则使用设置中的模型或默认值
                return aiSettings.siliconflow?.model || 'SiliconFlow';
            default:
                return 'Unknown model';
        }
    }

    private async showModelSelector(selector: HTMLElement, e: MouseEvent) {
        const menu = new Menu();
        const aiSettings = this.plugin.settings.ai;

        switch (aiSettings.provider) {
            case 'siliconflow':
                try {
                    // 使用预设的模型列表
                    const models = DEFAULT_SILICONFLOW_MODELS;
                    
                    // 添加预设模型
                    models.forEach((model: AIModel) => {
                        menu.addItem((item: MenuItem) => {
                            const isSelected = !aiSettings.siliconflow?.isCustomModel && 
                                (this.chatModelState.model === model.id || aiSettings.siliconflow?.model === model.id);
                            
                            item.setTitle(model.name)
                                .setChecked(isSelected)
                                .onClick(async () => {
                                    if (!aiSettings.siliconflow) {
                                        aiSettings.siliconflow = { model: model.id, isCustomModel: false };
                                    } else {
                                        aiSettings.siliconflow.model = model.id;
                                        aiSettings.siliconflow.isCustomModel = false;
                                    }
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'siliconflow';
                                    this.chatModelState.model = model.id;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('siliconflow', model.id);
                                    // 保存设置
                                    await this.plugin.saveSettings();
                                    selector.textContent = model.name;
                                });
                        });
                    });

                    // 如果存在自定义模型，添加分隔线和自定义模型
                    if (aiSettings.siliconflow?.isCustomModel && aiSettings.siliconflow?.model) {
                        menu.addSeparator();
                        
                        const customModelId = aiSettings.siliconflow.model;
                        menu.addItem((item: MenuItem) => {
                            const isSelected = aiSettings.siliconflow?.isCustomModel && 
                                (this.chatModelState.model === customModelId || aiSettings.siliconflow?.model === customModelId);
                            
                            item.setTitle(customModelId)
                                .setChecked(isSelected)
                                .onClick(async () => {
                                    if (!aiSettings.siliconflow) {
                                        aiSettings.siliconflow = { model: customModelId, isCustomModel: true };
                                    } else {
                                        aiSettings.siliconflow.model = customModelId;
                                        aiSettings.siliconflow.isCustomModel = true;
                                    }
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'siliconflow';
                                    this.chatModelState.model = customModelId;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('siliconflow', customModelId);
                                    // 保存设置
                                    await this.plugin.saveSettings();
                                    selector.textContent = customModelId;
                                });
                        });
                    }
                } catch (error) {

                    new Notice(t('Unable to get SiliconFlow model list, please check API Key and network connection.'));
                }
                break;
            case 'openai':
                try {
                    const models = await this.chatService.aiService.listModels(AIProviderType.OPENAI);
                    
                    // 分别添加预设模型和自定义模型
                    const defaultModels = models.filter((model: AIModel) => !model.isCustom);
                    const customModels = models.filter((model: AIModel) => model.isCustom);

                    // 添加预设模型
                    defaultModels.forEach((model: AIModel) => {
                        menu.addItem((item: MenuItem) => {
                            item.setTitle(model.name)
                                .setChecked(this.chatModelState.model === model.id)
                                .onClick(async () => {
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'openai';
                                    this.chatModelState.model = model.id;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('openai', model.id);
                                    selector.textContent = this.getCurrentModelName();
                                });
                        });
                    });

                    // 如果有自定义模型，添加分隔线和自定义模型
                    if (customModels.length > 0) {
                        menu.addSeparator();
                        
                        customModels.forEach((model: AIModel) => {
                            menu.addItem((item: MenuItem) => {
                                item.setTitle(model.name)
                                    .setChecked(this.chatModelState.model === model.id)
                                    .onClick(async () => {
                                        // 更新对话窗口的模型状态
                                        this.chatModelState.provider = 'openai';
                                        this.chatModelState.model = model.id;
                                        // 更新服务使用的模型
                                        this.chatService.updateModel('openai', model.id);
                                        selector.textContent = this.getCurrentModelName();
                                    });
                            });
                        });
                    }
                } catch (error) {
                    new Notice(t('Unable to get OpenAI model list, please check API Key and network connection.'));
                }
                break;

            case 'anthropic':
                const anthropicModels = [
                    'claude-3-opus-20240229',
                    'claude-3-sonnet-20240229',
                    'claude-3-haiku-20240307'
                ];
                anthropicModels.forEach(model => {
                    menu.addItem((item: MenuItem) => {
                        item.setTitle(model)
                            .setChecked(aiSettings.anthropic?.model === model)
                            .onClick(async () => {
                                if (!aiSettings.anthropic) aiSettings.anthropic = { apiKey: '', model: model };
                                aiSettings.anthropic.model = model;
                                await this.plugin.saveSettings();
                                selector.textContent = this.getCurrentModelName();
                            });
                    });
                });
                break;

            case 'ollama':
                try {
                    const models = await this.chatService.aiService.listModels(AIProviderType.OLLAMA);
                    models.forEach((model: AIModel) => {
                        menu.addItem((item: MenuItem) => {
                            item.setTitle(model.name)
                                .setChecked(aiSettings.ollama?.model === model.id)
                                .onClick(async () => {
                                    if (!aiSettings.ollama) aiSettings.ollama = { host: 'http://localhost:11434', model: model.id };
                                    aiSettings.ollama.model = model.id;
                                    await this.plugin.saveSettings();
                                    selector.textContent = this.getCurrentModelName();
                                });
                        });
                    });
                } catch (error) {
                    new Notice(t('Unable to access the Ollama model, please check the service.'));
                }
                break;

            case 'gemini':
                try {
                    const models = await this.chatService.aiService.listModels(AIProviderType.GEMINI);
                    
                    models.forEach((model: AIModel) => {
                        menu.addItem((item: MenuItem) => {
                            item.setTitle(model.name)
                                .setChecked(aiSettings.gemini?.model === model.id)
                                .onClick(async () => {
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'gemini';
                                    this.chatModelState.model = model.id;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('gemini', model.id);
                                    selector.textContent = this.getCurrentModelName();
                                });
                        });
                    });

                    // 添加分隔线（如果有自定义模型）
                    if (aiSettings.gemini?.isCustomModel && aiSettings.gemini?.model) {
                        menu.addSeparator();
                        
                        // 添加自定义模型
                        menu.addItem((item: MenuItem) => {
                            const customModel = {
                                id: aiSettings.gemini?.model || '',
                                name:aiSettings.gemini?.model,
                                isCustom: true
                            };
                            
                            item.setTitle(customModel.name)
                                .setChecked(this.chatModelState.model === customModel.id)
                                .onClick(async () => {
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'gemini';
                                    this.chatModelState.model = customModel.id;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('gemini', customModel.id);
                                    selector.textContent = this.getCurrentModelName();
                                });
                        });
                    }
                } catch (error) {
                    new Notice(t('Unable to get Gemini model list, please check API Key and network connection.'));
                }
                break;

            case 'deepseek':
                try {
                    const models = await this.chatService.aiService.listModels(AIProviderType.DEEPSEEK);
                    
                    // 添加预设模型
                    models.forEach((model: { id: string, name: string }) => {
                        menu.addItem((item: MenuItem) => {
                            item.setTitle(model.name)
                                .setChecked(aiSettings.deepseek?.model === model.id)
                                .onClick(async () => {
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'deepseek';
                                    this.chatModelState.model = model.id;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('deepseek', model.id);
                                    selector.textContent = this.getCurrentModelName();
                                });
                        });
                    });

                    // 添加分隔线（如果有自定义模型）
                    if (aiSettings.deepseek?.isCustomModel && aiSettings.deepseek?.model) {
                        menu.addSeparator();
                        
                        // 添加自定义模型
                        menu.addItem((item: MenuItem) => {
                            const customModel = {
                                id: aiSettings.deepseek?.model || '',
                                name: aiSettings.deepseek?.model,
                                isCustom: true
                            };
                            
                            item.setTitle(customModel.name)
                                .setChecked(this.chatModelState.model === customModel.id)
                                .onClick(async () => {
                                    // 更新对话窗口的模型状态
                                    this.chatModelState.provider = 'deepseek';
                                    this.chatModelState.model = customModel.id;
                                    // 更新服务使用的模型
                                    this.chatService.updateModel('deepseek', customModel.id);
                                    selector.textContent = this.getCurrentModelName();
                                });
                        });
                    }
                } catch (error) {

                    new Notice(t('Unable to get Deepseek model list, please check API Key and network connection.'));
                }
                break;

            default:

                new Notice(t('Unknown AI provider'));
                break;
        }

        const rect = selector.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }
}

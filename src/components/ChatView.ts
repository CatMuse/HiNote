import { ItemView, App, setIcon, Menu, MenuItem, Notice } from "obsidian";
import { ChatService, ChatMessage } from '../services/ChatService';
import { HighlightInfo, ChatViewState, AIModel, DEFAULT_SILICONFLOW_MODELS } from '../types';
import { t } from "src/i18n";

export class ChatView {
    public static instance: ChatView | null = null;
    private chatService: ChatService;
    private isProcessing: boolean = false;
    private containerEl: HTMLElement;
    private draggedContents: HighlightInfo[] = [];
    private chatHistory: { role: "user" | "assistant", content: string }[] = [];
    private floatingButton: HTMLElement | null;
    private currentPreviewContainer: HTMLElement | null = null;
    private static savedState: ChatViewState | null = null;
    private textarea: HTMLTextAreaElement | null = null;  // 添加输入框引用
    private app: App;

    constructor(app: App, private plugin: any) {
        if (ChatView.instance) {
            return ChatView.instance;
        }

        this.app = app;
        this.chatService = new ChatService(this.plugin);
        this.floatingButton = document.querySelector('.highlight-floating-button');
        
        // 创建容器
        this.containerEl = document.createElement('div');
        this.containerEl.addClass("highlight-chat-window");
        
        // 添加标题栏
        const header = this.containerEl.createEl("div", {
            cls: "highlight-chat-header"
        });

        // 添加标题和模型名称
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

        // 添加点击事件处理
        modelSelector.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            this.showModelSelector(modelSelector, e);
        });

        // 添加按钮容器
        const buttonsContainer = header.createEl("div", {
            cls: "highlight-chat-buttons"
        });

        // 添加清空按钮
        const clearButton = buttonsContainer.createEl("div", {
            cls: "highlight-chat-clear"
        });
        setIcon(clearButton, "eraser");
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
        chatHistory.addEventListener("dragenter", (e: DragEvent) => {
            e.preventDefault();
            chatHistory.addClass("drag-over");
        });

        chatHistory.addEventListener("dragover", (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            chatHistory.addClass("drag-over");

            // 计算聊天历史区域的可视区域位置
            const chatHistoryRect = chatHistory.getBoundingClientRect();
            const visibleTop = chatHistory.scrollTop;  // 当前滚动位置
            const visibleHeight = chatHistoryRect.height;  // 可视区域高度
            
            // 设置虚线框的位置，使其始终在可视区域内
            chatHistory.addClass('highlight-chat-history-drag-guide');
            chatHistory.style.setProperty('--drag-guide-top', `${visibleTop + 12}px`);  // 顶部留出16px边距
            chatHistory.style.setProperty('--drag-guide-height', `${visibleHeight - 24}px`);  // 高度减去上下边距

            // 更新预览元素位置
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
                text: t("highlighted notes")
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
            document.body.appendChild(this.containerEl);
        }

        // 隐藏浮动按钮
        if (this.floatingButton) {
            this.floatingButton.addClass("hi-note-hidden");
        }

        // 聚焦输入框
        requestAnimationFrame(() => {
            this.textarea?.focus();
        });
    }

    close() {
        // 只隐藏而不移除
        this.containerEl.addClass('highlight-chat-hidden');

        if (this.floatingButton) {
            this.floatingButton.removeClass("hi-note-hidden");
        }
    }

    private addMessage(container: HTMLElement, content: string, type: "user" | "assistant", useTypeWriter: boolean = true) {
        const messageEl = container.createEl("div", {
            cls: "highlight-chat-message"
        });

        const contentEl = messageEl.createEl("div", {
            cls: "highlight-chat-message-content"
        });

        // 添加类型特定的样式
        messageEl.addClass(`highlight-chat-message-${type}`);
        contentEl.addClass(`highlight-chat-message-content-${type}`);

        if (type === "assistant" && useTypeWriter) {
            // 为新的 AI 回复添加打字机效果
            this.typeWriter(contentEl, content);
        } else {
            // 用户消息或恢复的消息直接显示
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
                return 'Unknown Model';
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
                    const models = await this.chatService.aiService.listOpenAIModels();
                    
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
                    const models = await this.chatService.aiService.listOllamaModels();
                    models.forEach(model => {
                        menu.addItem((item: MenuItem) => {
                            item.setTitle(model)
                                .setChecked(aiSettings.ollama?.model === model)
                                .onClick(async () => {
                                    if (!aiSettings.ollama) aiSettings.ollama = { host: 'http://localhost:11434', model: model };
                                    aiSettings.ollama.model = model;
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
                    const models = await this.chatService.aiService.listGeminiModels();
                    
                    // 添加预设模型
                    models.forEach(model => {
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
                    const models = await this.chatService.aiService.listDeepseekModels();
                    
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

import { App, setIcon } from "obsidian";
import { t } from "../../i18n";
import { ChatStateManager } from './ChatStateManager';

/**
 * 对话 UI 构建器
 * 负责创建和初始化所有 UI 元素
 */
export class ChatUIBuilder {
    private app: App;
    private plugin: any;
    private stateManager: ChatStateManager;
    private containerEl: HTMLElement;
    private textarea: HTMLTextAreaElement | null = null;

    constructor(app: App, plugin: any, stateManager: ChatStateManager) {
        this.app = app;
        this.plugin = plugin;
        this.stateManager = stateManager;
        this.containerEl = document.createElement('div');
    }

    /**
     * 构建完整的对话窗口
     */
    buildChatWindow(
        onClearChat: () => void,
        onClose: () => void,
        onModelClick: (selector: HTMLElement, e: MouseEvent) => void,
        getCurrentModelName: () => string
    ): HTMLElement {
        this.containerEl.addClass("highlight-chat-window");

        // 构建标题栏
        const header = this.buildHeader(onClearChat, onClose, onModelClick, getCurrentModelName);
        
        // 构建对话历史区域
        const chatHistory = this.buildChatHistory();
        
        // 构建输入区域
        const inputContainer = this.buildInputArea();
        
        // 添加调整大小手柄
        const resizeHandle = this.containerEl.createEl("div", {
            cls: "highlight-chat-resize-handle"
        });
        this.setupResizeHandle(resizeHandle);

        // 设置窗口拖拽
        this.setupWindowDrag(header, onClearChat, onClose);

        return this.containerEl;
    }

    /**
     * 构建标题栏
     */
    private buildHeader(
        onClearChat: () => void,
        onClose: () => void,
        onModelClick: (selector: HTMLElement, e: MouseEvent) => void,
        getCurrentModelName: () => string
    ): HTMLElement {
        const header = this.containerEl.createEl("div", {
            cls: "highlight-chat-header"
        });

        // 标题和模型名称
        const titleContainer = header.createEl("div", {
            cls: "highlight-chat-title"
        });
        
        titleContainer.createEl("span", {
            text: t("Chat")
        });

        const modelSelector = titleContainer.createEl("div", {
            cls: "highlight-chat-model",
            text: getCurrentModelName()
        });

        modelSelector.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            onModelClick(modelSelector, e);
        });

        // 按钮容器
        const buttonsContainer = header.createEl("div", {
            cls: "highlight-chat-buttons"
        });

        // 清空按钮
        const clearButton = buttonsContainer.createEl("div", {
            cls: "highlight-chat-clear"
        });
        setIcon(clearButton, "eraser");
        clearButton.addEventListener("click", onClearChat);

        // 关闭按钮
        const closeButton = buttonsContainer.createEl("div", {
            cls: "highlight-chat-close"
        });
        setIcon(closeButton, "x");
        closeButton.addEventListener("click", onClose);

        return header;
    }

    /**
     * 构建对话历史区域
     */
    private buildChatHistory(): HTMLElement {
        const chatHistory = this.containerEl.createEl("div", {
            cls: "highlight-chat-history"
        });

        return chatHistory;
    }

    /**
     * 构建输入区域
     */
    private buildInputArea(): HTMLElement {
        const inputContainer = this.containerEl.createEl("div", {
            cls: "highlight-chat-input-container"
        });

        return inputContainer;
    }

    /**
     * 设置输入框
     */
    setupChatInput(
        inputContainer: HTMLElement,
        onSendMessage: (textarea: HTMLTextAreaElement) => void
    ): HTMLTextAreaElement {
        const inputWrapper = inputContainer.createEl('div', {
            cls: 'highlight-chat-input-wrapper'
        });

        this.textarea = inputWrapper.createEl('textarea', {
            cls: 'highlight-chat-input',
            attr: {
                placeholder: t('Input message...'),
                rows: '1'
            }
        });

        // 自动调整高度
        const adjustHeight = () => {
            if (this.textarea) {
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
                if (this.textarea) {
                    onSendMessage(this.textarea);
                }
            }
        });

        return this.textarea;
    }

    /**
     * 设置调整大小手柄
     */
    private setupResizeHandle(resizeHandle: HTMLElement): void {
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
            
            const newWidth = Math.max(300, startWidth + deltaX);
            const newHeight = Math.max(300, startHeight + deltaY);
            
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

    /**
     * 设置窗口拖拽
     */
    private setupWindowDrag(
        header: HTMLElement,
        onClearChat: () => void,
        onClose: () => void
    ): void {
        let isDragging = false;
        let currentX: number;
        let currentY: number;
        let initialX: number;
        let initialY: number;

        header.addEventListener("mousedown", (e: MouseEvent) => {
            // 如果点击的是按钮，不启动拖拽
            if ((e.target as HTMLElement).closest('.highlight-chat-clear') || 
                (e.target as HTMLElement).closest('.highlight-chat-close')) {
                return;
            }

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
    }

    /**
     * 获取容器元素
     */
    getContainer(): HTMLElement {
        return this.containerEl;
    }

    /**
     * 获取输入框
     */
    getTextarea(): HTMLTextAreaElement | null {
        return this.textarea;
    }

    /**
     * 获取对话历史容器
     */
    getChatHistoryContainer(): HTMLElement | null {
        return this.containerEl.querySelector('.highlight-chat-history');
    }
}

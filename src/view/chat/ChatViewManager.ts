import { App, Component } from "obsidian";
import { ChatService } from '../../services/ChatService';
import { ContextService } from '../../services/ContextService';
import { ChatStateManager } from './ChatStateManager';
import { ChatUIBuilder } from './ChatUIBuilder';
import { ChatMessageHandler } from './ChatMessageHandler';
import { ChatDragHandler } from './ChatDragHandler';
import { ChatContextHandler } from './ChatContextHandler';
import { ChatModelSelector } from './ChatModelSelector';
import { ChatViewState } from './types';

/**
 * 对话视图管理器
 * 协调所有子模块，提供统一的对外接口
 */
export class ChatViewManager extends Component {
    public static instance: ChatViewManager | null = null;
    
    private app: App;
    private plugin: any;
    
    // 服务
    private chatService: ChatService;
    private contextService: ContextService;
    
    // 管理器
    private stateManager: ChatStateManager;
    private uiBuilder: ChatUIBuilder;
    private messageHandler: ChatMessageHandler;
    private dragHandler: ChatDragHandler;
    private contextHandler: ChatContextHandler;
    private modelSelector: ChatModelSelector;
    
    // UI 元素
    private containerEl: HTMLElement;
    private textarea: HTMLTextAreaElement | null = null;

    constructor(app: App, plugin: any) {
        super();
        
        // 单例模式
        if (ChatViewManager.instance) {
            return ChatViewManager.instance;
        }

        this.app = app;
        this.plugin = plugin;
        
        // 初始化服务
        this.chatService = new ChatService(this.plugin);
        this.contextService = new ContextService(app);
        
        // 初始化管理器
        this.stateManager = new ChatStateManager();
        this.uiBuilder = new ChatUIBuilder(app, plugin, this.stateManager);
        this.messageHandler = new ChatMessageHandler(
            app,
            plugin,
            this.chatService,
            this.contextService,
            this.stateManager
        );
        this.dragHandler = new ChatDragHandler(
            this.stateManager,
            () => this.contextHandler.showContextPreviewWithSettings()
        );
        this.contextHandler = new ChatContextHandler(
            app,
            plugin,
            this.contextService,
            this.stateManager,
            this.messageHandler
        );
        this.modelSelector = new ChatModelSelector(
            plugin,
            this.chatService,
            this.stateManager
        );
        
        // 构建 UI
        this.containerEl = this.uiBuilder.buildChatWindow(
            () => this.clearChat(),
            () => this.close(),
            (selector, e) => this.modelSelector.showModelSelector(selector, e),
            () => this.modelSelector.getCurrentModelName()
        );
        
        // 设置输入框
        const inputContainer = this.containerEl.querySelector('.highlight-chat-input-container') as HTMLElement;
        if (inputContainer) {
            this.textarea = this.uiBuilder.setupChatInput(
                inputContainer,
                (textarea) => this.handleSendMessage(textarea)
            );
        }
        
        // 设置拖拽处理
        const chatHistory = this.uiBuilder.getChatHistoryContainer();
        if (chatHistory) {
            this.dragHandler.setupDragHandlers(chatHistory);
        }
        
        // 恢复保存的状态
        this.restoreSavedState();
        
        ChatViewManager.instance = this;
    }

    /**
     * 显示对话窗口
     */
    show(): void {
        if (document.body.contains(this.containerEl)) {
            this.containerEl.removeClass('highlight-chat-hidden');
        } else {
            this.containerEl.addClass("highlight-chat-window");
            this.containerEl.addClass("highlight-chat-window-position");
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

    /**
     * 关闭对话窗口
     */
    close(): void {
        this.containerEl.addClass('highlight-chat-hidden');

        // 显示所有浮动按钮
        document.querySelectorAll('.highlight-floating-button').forEach(btn => {
            (btn as HTMLElement).style.display = '';
        });
    }

    /**
     * 清空对话
     */
    private clearChat(): void {
        const chatHistoryEl = this.uiBuilder.getChatHistoryContainer();
        if (chatHistoryEl && this.textarea) {
            this.messageHandler.clearChat(chatHistoryEl, this.textarea);
        }
    }

    /**
     * 处理发送消息
     */
    private async handleSendMessage(textarea: HTMLTextAreaElement): Promise<void> {
        const chatHistoryEl = this.uiBuilder.getChatHistoryContainer();
        if (!chatHistoryEl) return;

        await this.messageHandler.handleSendMessage(
            textarea,
            chatHistoryEl,
            () => this.stateManager.getCurrentPreviewContainer(),
            (container) => this.stateManager.setCurrentPreviewContainer(container)
        );
    }

    /**
     * 恢复保存的状态
     */
    private restoreSavedState(): void {
        const savedState = ChatStateManager.getSavedState();
        if (!savedState) return;

        // 恢复状态
        this.stateManager.restoreState(savedState);

        const chatHistory = this.uiBuilder.getChatHistoryContainer();
        if (!chatHistory) return;

        // 清空现有内容
        while (chatHistory.firstChild) {
            chatHistory.removeChild(chatHistory.firstChild);
        }

        // 重建消息历史（恢复时不使用打字机效果）
        this.stateManager.getChatHistory().forEach(msg => {
            this.messageHandler.addMessage(chatHistory, msg.content, msg.role, false);
        });

        // 如果有拖拽内容，重建预览卡片
        if (this.stateManager.getDraggedContents().length > 0) {
            this.dragHandler.rebuildPreviewCards(chatHistory);
        }

        // 如果有活跃的预览容器，恢复引用
        if (savedState.currentPreviewContainer) {
            const previewContainer = chatHistory.querySelector('.highlight-chat-preview-cards') as HTMLElement;
            this.stateManager.setCurrentPreviewContainer(previewContainer);
        }
    }

    /**
     * 获取单例实例
     */
    static getInstance(app: App, plugin: any): ChatViewManager {
        if (!ChatViewManager.instance) {
            ChatViewManager.instance = new ChatViewManager(app, plugin);
        }
        return ChatViewManager.instance;
    }

    /**
     * 保存状态（在关闭前调用）
     */
    saveState(): void {
        this.stateManager.saveState();
    }
}

import { HighlightInfo } from '../../types';
import { ChatViewState, ChatMessage, ChatModelState } from './types';

/**
 * 对话状态管理器
 * 负责管理对话历史、拖拽内容和模型状态的保存与恢复
 */
export class ChatStateManager {
    private static savedState: ChatViewState | null = null;
    
    private chatHistory: ChatMessage[] = [];
    private draggedContents: HighlightInfo[] = [];
    private currentPreviewContainer: HTMLElement | null = null;
    private chatModelState: ChatModelState = {
        provider: '',
        model: ''
    };

    constructor() {}

    /**
     * 获取对话历史
     */
    getChatHistory(): ChatMessage[] {
        return this.chatHistory;
    }

    /**
     * 设置对话历史
     */
    setChatHistory(history: ChatMessage[]): void {
        this.chatHistory = history;
    }

    /**
     * 添加消息到历史
     */
    addToHistory(message: ChatMessage): void {
        this.chatHistory.push(message);
    }

    /**
     * 清空对话历史
     */
    clearHistory(): void {
        this.chatHistory = [];
    }

    /**
     * 获取拖拽内容
     */
    getDraggedContents(): HighlightInfo[] {
        return this.draggedContents;
    }

    /**
     * 设置拖拽内容
     */
    setDraggedContents(contents: HighlightInfo[]): void {
        this.draggedContents = contents;
    }

    /**
     * 添加拖拽内容
     */
    addDraggedContent(content: HighlightInfo): void {
        this.draggedContents.push(content);
    }

    /**
     * 移除拖拽内容
     */
    removeDraggedContent(content: HighlightInfo): void {
        const index = this.draggedContents.indexOf(content);
        if (index > -1) {
            this.draggedContents.splice(index, 1);
        }
    }

    /**
     * 清空拖拽内容
     */
    clearDraggedContents(): void {
        this.draggedContents = [];
    }

    /**
     * 获取当前预览容器
     */
    getCurrentPreviewContainer(): HTMLElement | null {
        return this.currentPreviewContainer;
    }

    /**
     * 设置当前预览容器
     */
    setCurrentPreviewContainer(container: HTMLElement | null): void {
        this.currentPreviewContainer = container;
    }

    /**
     * 获取模型状态
     */
    getModelState(): ChatModelState {
        return this.chatModelState;
    }

    /**
     * 设置模型状态
     */
    setModelState(state: ChatModelState): void {
        this.chatModelState = state;
    }

    /**
     * 保存当前状态
     */
    saveState(): void {
        ChatStateManager.savedState = {
            chatHistory: [...this.chatHistory],
            draggedContents: [...this.draggedContents],
            currentPreviewContainer: this.currentPreviewContainer !== null
        };
    }

    /**
     * 获取保存的状态
     */
    static getSavedState(): ChatViewState | null {
        return ChatStateManager.savedState;
    }

    /**
     * 清除保存的状态
     */
    static clearSavedState(): void {
        ChatStateManager.savedState = null;
    }

    /**
     * 恢复保存的状态
     */
    restoreState(state: ChatViewState): void {
        this.chatHistory = state.chatHistory;
        this.draggedContents = state.draggedContents;
    }
}

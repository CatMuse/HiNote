import { setIcon } from "obsidian";
import { HighlightInfo } from '../../types';
import { ChatStateManager } from './ChatStateManager';
import { t } from "../../i18n";

/**
 * 对话拖拽处理器
 * 负责处理高亮内容的拖拽和预览
 */
export class ChatDragHandler {
    private stateManager: ChatStateManager;
    private onPreviewClick: () => void;

    constructor(stateManager: ChatStateManager, onPreviewClick: () => void) {
        this.stateManager = stateManager;
        this.onPreviewClick = onPreviewClick;
    }

    /**
     * 设置拖拽事件处理器
     */
    setupDragHandlers(chatHistory: HTMLElement): void {
        chatHistory.addEventListener("dragenter", (e: DragEvent) => {
            e.preventDefault();
            chatHistory.addClass("drag-over");
        });

        chatHistory.addEventListener("dragover", (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            chatHistory.addClass("drag-over");

            const chatHistoryRect = chatHistory.getBoundingClientRect();
            const visibleTop = chatHistory.scrollTop;
            const visibleHeight = chatHistoryRect.height;
            
            chatHistory.addClass('highlight-chat-history-drag-guide');
            chatHistory.style.setProperty('--drag-guide-top', `${visibleTop + 12}px`);
            chatHistory.style.setProperty('--drag-guide-height', `${visibleHeight - 24}px`);

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

                    const isDuplicate = this.stateManager.getDraggedContents().some(
                        existing => existing.text === highlight.text
                    );

                    if (!isDuplicate) {
                        this.stateManager.addDraggedContent(highlight);
                        this.showDraggedPreviewsInChat(chatHistory);
                    }
                } catch (error) {
                    console.error('Error parsing highlight data:', error);
                }
            }
        });
    }

    /**
     * 在对话流中显示拖拽预览
     */
    private showDraggedPreviewsInChat(container: HTMLElement): void {
        let currentPreviewContainer = this.stateManager.getCurrentPreviewContainer();

        if (!currentPreviewContainer) {
            const messageEl = container.createEl("div", {
                cls: "highlight-chat-message highlight-chat-message-preview"
            });

            const previewsContainer = messageEl.createEl("div", {
                cls: "highlight-chat-previews"
            });

            const headerEl = previewsContainer.createEl("div", {
                cls: "highlight-chat-preview-header"
            });

            const headerLeft = headerEl.createEl("div", {
                cls: "highlight-chat-preview-header-left"
            });

            headerLeft.createEl("span", {
                cls: "highlight-chat-preview-count",
                text: String(this.stateManager.getDraggedContents().length)
            });

            headerLeft.createSpan({
                text: t("highlighted notes")
            });

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
                this.onPreviewClick();
            });

            const cardsContainer = previewsContainer.createEl("div", {
                cls: "highlight-chat-preview-cards"
            });

            currentPreviewContainer = cardsContainer;
            this.stateManager.setCurrentPreviewContainer(cardsContainer);
        }

        const draggedContents = this.stateManager.getDraggedContents();
        const card = currentPreviewContainer.createEl("div", {
            cls: "highlight-chat-preview-card"
        });

        const content = draggedContents[draggedContents.length - 1];
        card.createEl("div", {
            cls: "highlight-chat-preview-content",
            text: content.text
        });

        const deleteBtn = card.createEl("div", {
            cls: "highlight-chat-preview-delete"
        });
        setIcon(deleteBtn, "x");
        deleteBtn.addEventListener("click", () => {
            this.stateManager.removeDraggedContent(content);
            card.remove();
            
            if (this.stateManager.getDraggedContents().length === 0) {
                const previewMessage = currentPreviewContainer?.closest('.highlight-chat-message-preview');
                if (previewMessage) {
                    previewMessage.remove();
                    this.stateManager.setCurrentPreviewContainer(null);
                }
            } else {
                this.updatePreviewCount();
            }
        });

        this.updatePreviewCount();
        container.scrollTop = container.scrollHeight;
    }

    /**
     * 更新预览计数
     */
    updatePreviewCount(): void {
        const currentPreviewContainer = this.stateManager.getCurrentPreviewContainer();
        if (currentPreviewContainer) {
            const previewMessage = currentPreviewContainer.closest('.highlight-chat-message-preview');
            const countEl = previewMessage?.querySelector('.highlight-chat-preview-count');
            
            if (countEl) {
                countEl.textContent = String(this.stateManager.getDraggedContents().length);
                
                if (this.stateManager.getDraggedContents().length === 0 && previewMessage) {
                    previewMessage.remove();
                    this.stateManager.setCurrentPreviewContainer(null);
                }
            }
        }
    }

    /**
     * 重建预览卡片（用于状态恢复）
     */
    rebuildPreviewCards(chatHistory: HTMLElement): void {
        const draggedContents = this.stateManager.getDraggedContents();
        if (draggedContents.length > 0) {
            draggedContents.forEach(() => {
                this.showDraggedPreviewsInChat(chatHistory);
            });
        }
    }
}

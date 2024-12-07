import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { ActionButtons } from "./ActionButtons";
import { CommentList } from "./CommentList";
import { setIcon } from "obsidian";

export class HighlightCard {
    private card: HTMLElement;

    constructor(
        private container: HTMLElement,
        private highlight: HighlightInfo,
        private plugin: CommentPlugin,
        private options: {
            onHighlightClick: (highlight: HighlightInfo) => Promise<void>;
            onCommentAdd: (highlight: HighlightInfo) => void;
            onExport: (highlight: HighlightInfo) => void;
            onCommentEdit: (highlight: HighlightInfo, comment: CommentItem) => void;
            onAIResponse: (content: string) => Promise<void>;
        },
        private isInMainView: boolean = false,
        private fileName?: string
    ) {
        this.render();
    }

    private render() {
        this.card = this.container.createEl("div", {
            cls: "highlight-card",
            attr: {
                'data-highlight': JSON.stringify(this.highlight)
            }
        });

        // 在主视图中显示文件名
        if (this.isInMainView && this.fileName) {
            const fileNameEl = this.card.createEl("div", {
                cls: "highlight-card-filename"
            });

            // 添加拖拽属性到文件名区域
            fileNameEl.setAttribute("draggable", "true");
            
            // 添加拖拽事件
            fileNameEl.addEventListener("dragstart", (e) => {
                e.dataTransfer?.setData("text/plain", this.highlight.text);
                e.dataTransfer?.setData("application/highlight", JSON.stringify(this.highlight));
                fileNameEl.addClass("dragging");
                
                // 添加拖拽预览
                if (e.dataTransfer) {
                    const previewEl = document.createElement('div');
                    previewEl.className = 'highlight-drag-preview';
                    previewEl.textContent = this.highlight.text.slice(0, 50) + (this.highlight.text.length > 50 ? '...' : '');
                    document.body.appendChild(previewEl);
                    
                    // 设置拖拽图像
                    e.dataTransfer.setDragImage(previewEl, 0, 0);
                    
                    // 延迟移除预览元素
                    setTimeout(() => previewEl.remove(), 0);
                }
            });

            fileNameEl.addEventListener("dragend", () => {
                fileNameEl.removeClass("dragging");
            });

            // 创建文件图标
            const fileIcon = fileNameEl.createEl("span", {
                cls: "highlight-card-filename-icon"
            });
            
            setIcon(fileIcon, 'file-text');

            // 创建文件名文本
            fileNameEl.createEl("span", {
                text: this.fileName,
                cls: "highlight-card-filename-text"
            });
        }

        // 创建 content 容器
        const contentEl = this.card.createEl("div", {
            cls: "highlight-content"
        });

        // 渲染高亮内容
        new HighlightContent(
            contentEl,
            this.highlight,
            this.options.onHighlightClick
        );

        // 渲染操作按钮 (在 content 容器内)
        new ActionButtons(
            contentEl,
            this.highlight,
            this.plugin,
            {
                onCommentAdd: () => this.options.onCommentAdd(this.highlight),
                onExport: () => this.options.onExport(this.highlight),
                onAIResponse: this.options.onAIResponse
            }
        );

        // 渲染评论列表 (在 card 容器内)
        new CommentList(
            this.card,
            this.highlight,
            (comment) => this.options.onCommentEdit(this.highlight, comment)
        );
    }

    public getElement(): HTMLElement {
        return this.card;
    }

    public update(highlight: HighlightInfo) {
        this.highlight = highlight;
        this.card.empty();
        this.render();
    }
} 
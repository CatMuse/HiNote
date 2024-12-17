import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { ActionButtons } from "./ActionButtons";
import { CommentList } from "./CommentList";
import { setIcon } from "obsidian";
import { DragPreview } from './DragPreview';

export class HighlightCard {
    private card: HTMLElement;
    private static selectedCard: HTMLElement | null = null;  

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

        // 添加点击事件用于切换选中状态
        this.card.addEventListener("click", () => {
            if (HighlightCard.selectedCard && HighlightCard.selectedCard !== this.card) {
                HighlightCard.selectedCard.removeClass('selected');
            }
            this.card.addClass('selected');
            HighlightCard.selectedCard = this.card;
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
                
                // 使用 DragPreview 替代原来的预览处理
                DragPreview.start(e, this.highlight.text);
            });

            fileNameEl.addEventListener("dragend", () => {
                fileNameEl.removeClass("dragging");
                DragPreview.clear();
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
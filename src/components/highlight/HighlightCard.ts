import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { ActionButtons } from "./ActionButtons";
import { CommentList } from "./CommentList";

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

            // 创建文件图标
            const fileIcon = fileNameEl.createEl("span", {
                cls: "highlight-card-filename-icon"
            });
            fileIcon.innerHTML = `<svg viewBox="0 0 100 100" class="document" width="16" height="16">
                <path fill="currentColor" stroke="currentColor" d="M85.714,14.286V85.714H14.286V14.286H85.714 M85.714,0H14.286 C6.396,0,0,6.396,0,14.286v71.429C0,93.604,6.396,100,14.286,100h71.429C93.604,100,100,93.604,100,85.714V14.286 C100,6.396,93.604,0,85.714,0L85.714,0z"/>
            </svg>`;

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
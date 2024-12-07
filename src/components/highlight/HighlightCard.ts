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
        }
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

        // 渲染高亮内容
        new HighlightContent(
            this.card,
            this.highlight,
            this.options.onHighlightClick
        );

        // 渲染操作按钮
        new ActionButtons(
            this.card,
            this.highlight,
            this.plugin,
            {
                onCommentAdd: () => this.options.onCommentAdd(this.highlight),
                onExport: () => this.options.onExport(this.highlight),
                onAIResponse: this.options.onAIResponse
            }
        );

        // 渲染评论列表
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
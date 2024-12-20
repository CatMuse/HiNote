import { setIcon } from "obsidian";
import { HighlightInfo } from "../../types";
import { AIButton } from "../AIButton";
import type CommentPlugin from "../../../main";

export class ActionButtons {
    private container: HTMLElement;

    constructor(
        parentEl: HTMLElement,
        private highlight: HighlightInfo,
        private plugin: CommentPlugin,
        private options: {
            onCommentAdd: () => void;
            onExport: (highlight: HighlightInfo) => void;
            onAIResponse: (content: string) => Promise<void>;
        }
    ) {
        this.render(parentEl);
    }

    private render(parentEl: HTMLElement) {
        this.container = parentEl.createEl("div", {
            cls: "highlight-action-buttons"
        });

        this.renderLeftButtons();
        this.renderRightButtons();
    }

    private renderLeftButtons() {
        const leftButtons = this.container.createEl("div", {
            cls: "highlight-action-buttons-left"
        });

        // 初始化 AI 按钮
        new AIButton(
            leftButtons,
            this.highlight,
            this.plugin,
            this.options.onAIResponse
        );
    }

    private renderRightButtons() {
        const rightButtons = this.container.createEl("div", {
            cls: "highlight-action-buttons-right"
        });

        // 添加评论按钮
        const addCommentBtn = rightButtons.createEl("button", {
            cls: "highlight-action-btn highlight-add-comment-btn",
            attr: { 'aria-label': '添加评论' }
        });
        setIcon(addCommentBtn, "square-plus");
        addCommentBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.options.onCommentAdd();
        });

        // 分享按钮
        const shareBtn = rightButtons.createEl("button", {
            cls: "highlight-action-btn highlight-share-btn",
            attr: { 'aria-label': '导出为图片' }
        });
        setIcon(shareBtn, "image-down");
        shareBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.options.onExport(this.highlight);
        });
    }
} 
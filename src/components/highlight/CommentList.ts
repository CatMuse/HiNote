import { CommentItem, HighlightInfo } from "../../types";

export class CommentList {
    private container: HTMLElement;

    constructor(
        parentEl: HTMLElement,
        private highlight: HighlightInfo,
        private onCommentEdit: (comment: CommentItem) => void
    ) {
        this.render(parentEl);
    }

    private render(parentEl: HTMLElement) {
        const comments = this.highlight.comments || [];
        if (comments.length === 0) return;

        const commentsSection = parentEl.createEl("div", {
            cls: "highlight-comments-section"
        });

        this.container = commentsSection.createEl("div", {
            cls: "highlight-comments-list"
        });

        this.renderComments();
    }

    private renderComments() {
        const comments = this.highlight.comments || [];
        comments.forEach(comment => {
            const commentEl = this.container.createEl("div", {
                cls: "highlight-comment",
                attr: { 'data-comment-id': comment.id }
            });

            // 评论内容 - 添加双击事件
            const contentEl = commentEl.createEl("div", {
                text: comment.content,
                cls: "highlight-comment-content"
            });

            // 添加双击事件监听
            contentEl.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                this.onCommentEdit(comment);
            });

            // 创建底部操作栏
            const footer = commentEl.createEl("div", {
                cls: "highlight-comment-footer"
            });

            // 评论时间
            footer.createEl("div", {
                text: new Date(comment.createdAt).toLocaleString(),
                cls: "highlight-comment-time"
            });

            // 操作按钮容器
            footer.createEl("div", {
                cls: "highlight-comment-actions"
            });
        });
    }
} 
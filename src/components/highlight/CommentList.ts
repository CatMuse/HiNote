import { CommentItem, HighlightInfo } from "../../types";

// 标签格式的正则表达式
const TAG_REGEX = /#[\w\u4e00-\u9fa5]+/g;
const PURE_TAGS_FORMAT = /^\s*(#[\w\u4e00-\u9fa5]+(\s+#[\w\u4e00-\u9fa5]+)*\s*)$/;

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
            cls: "hi-notes-section"
        });

        this.container = commentsSection.createEl("div", {
            cls: "hi-notes-list"
        });

        this.renderComments();
    }

    private renderComments() {
        const comments = this.highlight.comments || [];
        
        // 按更新时间倒序排序，并将纯标签评论放在前面
        comments.sort((a, b) => {
            const aIsTag = PURE_TAGS_FORMAT.test(a.content);
            const bIsTag = PURE_TAGS_FORMAT.test(b.content);
            if (aIsTag && !bIsTag) return -1;
            if (!aIsTag && bIsTag) return 1;
            return b.updatedAt - a.updatedAt;
        });

        // 清空容器
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        
        comments.forEach(comment => {
            // 检查是否是纯标签评论
            const isPureTagComment = PURE_TAGS_FORMAT.test(comment.content);

            const commentEl = this.container.createEl("div", {
                cls: `hi-note${isPureTagComment ? ' pure-tags-comment' : ''}`,
                attr: { 'data-comment-id': comment.id }
            });

            // 评论内容 - 添加双击事件
            // 处理标签和内容
            const contentEl = commentEl.createEl("div", {
                cls: "hi-note-content"
            });

            const content = comment.content;
            // 检查是否是纯标签格式
            if (PURE_TAGS_FORMAT.test(content)) {
                // 如果是纯标签格式，将每个标签替换为样式化的标签
                let formattedContent = content;
                const tags = content.match(TAG_REGEX) || [];
                
                // Clear the content element
                while (contentEl.firstChild) {
                    contentEl.removeChild(contentEl.firstChild);
                }
                
                // If there are tags, process them
                if (tags.length > 0) {
                    // Split the content by tags to preserve the order
                    const parts = formattedContent.split(TAG_REGEX);
                    let currentIndex = 0;
                    
                    // Interleave text parts and styled tags
                    parts.forEach((part, index) => {
                        // Add the text part
                        if (part) {
                            contentEl.appendChild(document.createTextNode(part));
                        }
                        
                        // Add the tag (if there is one after this part)
                        if (index < tags.length) {
                            const tagSpan = document.createElement('span');
                            tagSpan.className = 'highlight-tag';
                            tagSpan.textContent = tags[index];
                            contentEl.appendChild(tagSpan);
                        }
                    });
                } else {
                    // 如果不是纯标签格式，直接显示原始内容
                    contentEl.textContent = content;
                }
            } else {
                // 如果不是纯标签格式，直接显示原始内容
                contentEl.textContent = content;
            }

            // 添加双击事件监听
            contentEl.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                e.preventDefault(); // 阻止默认行为
                this.onCommentEdit(comment);
            });

            // 阻止单击事件冒泡，避免与双击冲突
            contentEl.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            // 创建底部操作栏
            const footer = commentEl.createEl("div", {
                cls: "hi-note-footer"
            });

            // 评论时间
            footer.createEl("div", {
                text: new Date(comment.updatedAt).toLocaleString(),
                cls: "hi-note-time"
            });

            // 添加双击编辑提示
            footer.createEl("span", {
                text: "双击编辑",
                cls: "hi-note-edit-hint"
            });

            // 操作按钮容器
            footer.createEl("div", {
                cls: "hi-note-actions"
            });
        });
    }
} 
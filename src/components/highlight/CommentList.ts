import { CommentItem, HighlightInfo } from "../../types";
import { MarkdownRenderer, Component, App } from "obsidian";
import { t } from "../../i18n";

export class CommentList extends Component {
    private container: HTMLElement;
    private app: App;

    constructor(
        parentEl: HTMLElement,
        private highlight: HighlightInfo,
        private onCommentEdit: (comment: CommentItem) => void
    ) {
        super();
        this.app = (window as any).app;
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

        this.renderComments().catch(error => {
            console.error('Error rendering comments:', error);
        });
    }

    private async renderComments() {
        const comments = this.highlight.comments || [];
        
        // 按更新时间倒序排序
        comments.sort((a, b) => b.updatedAt - a.updatedAt);

        // 清空容器
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
        
        // 使用 for...of 循环以支持 await
        for (const comment of comments) {
            const commentEl = this.container.createEl("div", {
                cls: "hi-note",
                attr: { 'data-comment-id': comment.id }
            });

            // 创建内容包装器（用于展开/收起功能）
            const contentWrapper = commentEl.createEl("div", {
                cls: "hi-note-content-wrapper"
            });

            // 评论内容 - 添加双击事件
            const contentEl = contentWrapper.createEl("div", {
                cls: "hi-note-content markdown-rendered"
            });

            const content = comment.content;
            try {
                // 使用 MarkdownRenderer 渲染 Markdown 内容
                await MarkdownRenderer.renderMarkdown(
                    content,
                    contentEl,
                    this.highlight.filePath || '',
                    this
                );
                
                // 添加自定义样式类以修复可能的样式问题
                const lists = contentEl.querySelectorAll('ul, ol');
                lists.forEach(list => {
                    list.addClass('comment-markdown-list');
                });
                
                // 激活内部链接
                await this.activateInternalLinks(contentEl, this.highlight.filePath || '');
            } catch (error) {
                console.error('Error rendering markdown in comment:', error);
                // 如果渲染失败，回退到纯文本渲染
                contentEl.textContent = content;
            }

            // 添加双击事件监听
            contentEl.addEventListener("dblclick", (e) => {
                // 如果点击的是链接，不触发编辑事件
                if ((e.target as HTMLElement).closest('a')) {
                    return;
                }
                e.stopPropagation();
                e.preventDefault(); // 阻止默认行为
                this.onCommentEdit(comment);
            });

            // 阻止单击事件冒泡，避免与双击冲突
            contentEl.addEventListener("click", (e) => {
                // 如果点击的是链接，允许事件传递
                if ((e.target as HTMLElement).closest('a')) {
                    return;
                }
                e.stopPropagation();
            });

            // 检查内容高度并添加展开/收起按钮（在下一帧执行，确保内容已渲染）
            requestAnimationFrame(() => {
                this.checkAndAddToggleButton(contentWrapper, contentEl, comment);
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

            // 添加双击编辑提示（如果有作者信息则默认显示作者）
            const editHint = footer.createEl("span", {
                text: comment.author || "Double click to edit",
                cls: "hi-note-edit-hint"
            });

            // 如果有作者信息，在hover时切换文本
            if (comment.author) {
                editHint.style.display = "inline-block";

                contentEl.addEventListener("mouseenter", () => {
                    editHint.textContent = "Double click to edit";
                });

                contentEl.addEventListener("mouseleave", () => {
                    editHint.textContent = comment.author!;
                });
            }

            // 操作按钮容器
            footer.createEl("div", {
                cls: "hi-note-actions"
            });
        }
    }
    
    /**
     * 检查内容高度并添加展开/收起按钮
     * @param wrapper 内容包装器
     * @param contentEl 内容元素
     * @param comment 评论对象
     */
    private checkAndAddToggleButton(
        wrapper: HTMLElement,
        contentEl: HTMLElement,
        comment: CommentItem
    ): void {
        const MAX_HEIGHT = 240; // 折叠时的最大高度（像素）
        const actualHeight = contentEl.scrollHeight;

        // 如果内容高度超过阈值，添加展开/收起功能
        if (actualHeight > MAX_HEIGHT) {
            // 添加可折叠标记类
            wrapper.addClass('has-collapsible-content');
            wrapper.addClass('collapsed');

            // 添加渐变遮罩
            const fadeOut = wrapper.createEl("div", {
                cls: "content-fade-out"
            });

            // 添加展开/收起按钮
            const toggleBtn = wrapper.createEl("div", {
                cls: "toggle-content-btn"
            });

            // 创建按钮文本和图标
            const btnText = toggleBtn.createEl("span", {
                text: t("Expand")
            });

            // 添加点击事件
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isCollapsed = wrapper.hasClass('collapsed');

                if (isCollapsed) {
                    // 展开
                    wrapper.removeClass('collapsed');
                    wrapper.addClass('expanded');
                    btnText.textContent = t("Collapse");
                } else {
                    // 收起
                    wrapper.addClass('collapsed');
                    wrapper.removeClass('expanded');
                    btnText.textContent = t("Expand");
                }
            });
        }
    }

    /**
     * 激活内部链接，添加悬停预览和点击跳转功能
     * @param element 包含链接的元素
     * @param sourcePath 源文件路径
     */
    private async activateInternalLinks(element: HTMLElement, sourcePath: string) {
        // 查找所有内部链接元素
        const internalLinks = element.querySelectorAll('a.internal-link');
        
        internalLinks.forEach(link => {
            // 获取链接目标
            const target = link.getAttribute('data-href') || link.getAttribute('href');
            if (!target) return;
            
            // 添加点击事件
            link.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // 打开链接
                const targetFile = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
                if (targetFile) {
                    this.app.workspace.openLinkText(target, sourcePath, false);
                }
            });
            
            // 添加悬停预览
            link.addEventListener('mouseenter', (event) => {
                this.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: element,
                    targetEl: link,
                    linktext: target,
                    sourcePath: sourcePath
                });
            });
        });
        
        // 查找所有标签
        const tags = element.querySelectorAll('a.tag');
        
        tags.forEach(tag => {
            // 获取标签文本
            const tagText = tag.getAttribute('href');
            if (!tagText) return;
            
            // 添加点击事件
            tag.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // 打开标签搜索
                this.app.workspace.trigger('search:open', tagText);
            });
        });
    }
} 
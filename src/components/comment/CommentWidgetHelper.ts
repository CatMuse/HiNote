import { Plugin, MarkdownRenderer, Component, App } from "obsidian";
import { HighlightInfo as HiNote, CommentItem } from "../../types";
import { setIcon } from "obsidian";

/**
 * 批注小部件辅助类
 * 提供编辑模式和阅读模式共享的工具方法
 */
export class CommentWidgetHelper {
    private static readonly MAX_TOOLTIP_COMMENTS = 3;

    /**
     * 创建批注按钮
     */
    static createButton(container: HTMLElement, hasComments: boolean): HTMLElement {
        const button = container.createEl("button", {
            cls: `hi-note-button clickable-icon ${!hasComments ? 'hi-note-button-hidden' : ''}`
        });

        const iconContainer = button.createEl("span", {
            cls: "hi-note-icon-container"
        });

        setIcon(iconContainer, "message-circle");

        return button;
    }

    /**
     * 添加评论数量标签
     */
    static addCommentCount(iconContainer: HTMLElement, count: number): void {
        if (count > 0) {
            iconContainer.createEl("span", {
                cls: "hi-note-count",
                text: count.toString()
            });
        }
    }

    /**
     * 创建工具提示
     */
    static createTooltip(app: App, highlight: HiNote): HTMLElement {
        const tooltip = document.createElement("div");
        tooltip.addClass("hi-note-tooltip", "hi-note-tooltip-hidden");
        if (highlight.id) {
            tooltip.setAttribute("data-highlight-id", highlight.id);
        }

        const commentsList = tooltip.createEl("div", {
            cls: "hi-note-tooltip-list"
        });

        // 渲染评论内容
        this.renderTooltipContent(app, commentsList, tooltip, highlight.comments || []);

        document.body.appendChild(tooltip);
        
        return tooltip;
    }

    /**
     * 渲染工具提示内容
     */
    private static renderTooltipContent(
        app: App,
        commentsList: HTMLElement, 
        tooltip: HTMLElement, 
        comments: CommentItem[]
    ): void {
        if (comments.length === 0) return;

        // 最多显示3条评论
        comments.slice(0, this.MAX_TOOLTIP_COMMENTS).forEach(comment => {
            const item = commentsList.createEl('div', { cls: 'hi-note-tooltip-item' });
            
            // 使用 Markdown 渲染内容
            const contentEl = item.createEl('div', { 
                cls: 'hi-note-tooltip-content markdown-rendered' 
            });
            
            this.renderMarkdownContent(app, contentEl, comment.content);

            item.createEl('div', {
                cls: 'hi-note-tooltip-time',
                text: new Date(comment.createdAt).toLocaleString()
            });
        });

        // 显示剩余评论数量
        if (comments.length > this.MAX_TOOLTIP_COMMENTS) {
            tooltip.createEl("div", {
                cls: "hi-note-tooltip-more",
                text: `还有 ${comments.length - this.MAX_TOOLTIP_COMMENTS} 条评论...`
            });
        }
    }

    /**
     * 渲染 Markdown 内容
     */
    private static renderMarkdownContent(app: App, containerEl: HTMLElement, content: string): void {
        MarkdownRenderer.render(
            app,
            content,
            containerEl,
            '',
            new Component()
        ).catch(error => {
            console.error('Error rendering markdown in tooltip:', error);
            containerEl.textContent = content;
        });
    }

    /**
     * 更新工具提示位置
     */
    static updateTooltipPosition(widget: HTMLElement, tooltip: HTMLElement): void {
        const buttonRect = widget.getBoundingClientRect();
        tooltip.style.top = `${buttonRect.bottom + 4}px`;
        tooltip.style.left = `${buttonRect.right - tooltip.offsetWidth}px`;
    }

    /**
     * 设置工具提示的显示/隐藏事件
     */
    static setupTooltipEvents(
        button: HTMLElement,
        widget: HTMLElement,
        tooltip: HTMLElement
    ): void {
        button.addEventListener("mouseenter", () => {
            tooltip.removeClass("hi-note-tooltip-hidden");
            this.updateTooltipPosition(widget, tooltip);
        });

        button.addEventListener("mouseleave", () => {
            tooltip.addClass("hi-note-tooltip-hidden");
        });
    }

    /**
     * 打开评论面板
     */
    static async openCommentPanel(app: App, highlight: HiNote): Promise<void> {
        const workspace = app.workspace;
        const existing = workspace.getLeavesOfType("hinote-view");

        if (existing.length) {
            workspace.revealLeaf(existing[0]);
            await new Promise(resolve => setTimeout(resolve, 50));
        } else {
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: "hinote-view",
                    active: true
                });
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        const event = new CustomEvent("open-comment-input", {
            detail: {
                highlightId: highlight.id,
                text: highlight.text
            }
        });
        window.dispatchEvent(event);
    }

    /**
     * 设置点击事件
     */
    static setupClickEvent(
        button: HTMLElement,
        tooltip: HTMLElement,
        onClick: () => void | Promise<void>
    ): void {
        button.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            tooltip.addClass("hi-note-tooltip-hidden");
            await onClick();
        });
    }

    /**
     * 创建清理观察器（用于阅读模式）
     */
    static createCleanupObserver(widget: HTMLElement, tooltip: HTMLElement): MutationObserver {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.removedNodes.forEach((node) => {
                     if (node === widget) {
                         tooltip.remove();
                         observer.disconnect();
                     }
                });
            });
        });
        
        if (widget.parentElement) {
            observer.observe(widget.parentElement, { childList: true });
        }
        
        return observer;
    }
}

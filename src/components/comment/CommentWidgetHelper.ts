import { MarkdownRenderer, Component, App, setIcon } from "obsidian";
import { HighlightInfo as HiNote, CommentItem } from "../../types/highlight";
import type { EventManager } from "../../services/EventManager";

/**
 * 批注小部件辅助类
 * 提供编辑模式和阅读模式共享的工具方法
 */
export class CommentWidgetHelper {
    private static readonly MAX_TOOLTIP_COMMENTS = 3;
    private static readonly TOOLTIP_MARGIN = 8;
    private static readonly TOOLTIP_GAP = 4;

    /**
     * 创建批注按钮
     */
    static createButton(container: HTMLElement, hasComments: boolean): HTMLElement {
        const button = container.createEl("button", {
            cls: `hi-note-button clickable-icon ${!hasComments ? 'hi-note-button-hidden' : ''}`
        });

        const iconContainer = button.createSpan({
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
            iconContainer.createSpan({
                cls: "hi-note-count",
                text: count.toString()
            });
        }
    }

    /**
     * 创建工具提示
     */
    static createTooltip(app: App, highlight: HiNote): HTMLElement {
        const tooltip = createDiv();
        tooltip.addClass("hi-note-tooltip", "hi-note-tooltip-hidden");
        if (highlight.id) {
            tooltip.setAttribute("data-highlight-id", highlight.id);
        }

        const commentsList = tooltip.createDiv({
            cls: "hi-note-tooltip-list"
        });

        // 渲染评论内容
        this.renderTooltipContent(app, commentsList, tooltip, highlight.comments || []);

        activeDocument.body.appendChild(tooltip);
        
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
            const item = commentsList.createDiv({ cls: 'hi-note-tooltip-item' });
            
            // 使用 Markdown 渲染内容
            const contentEl = item.createDiv({
                cls: 'hi-note-tooltip-content markdown-rendered' 
            });
            
            this.renderMarkdownContent(app, contentEl, comment.content);

            item.createDiv({
                cls: 'hi-note-tooltip-time',
                text: new Date(comment.createdAt).toLocaleString()
            });
        });

        // 显示剩余评论数量
        if (comments.length > this.MAX_TOOLTIP_COMMENTS) {
            tooltip.createDiv({
                cls: "hi-note-tooltip-more",
                text: `还有 ${comments.length - this.MAX_TOOLTIP_COMMENTS} 条评论...`
            });
        }
    }

    /**
     * 渲染 Markdown 内容
     */
    private static renderMarkdownContent(app: App, containerEl: HTMLElement, content: string): void {
        const markdownComponent = new Component();
        MarkdownRenderer.render(
            app,
            content,
            containerEl,
            '',
            markdownComponent
        ).then(() => {
            containerEl.querySelectorAll('ul, ol').forEach(list => {
                list.addClass('tooltip-markdown-list');
            });
        }).catch(error => {
            console.error('Error rendering markdown in tooltip:', error);
            containerEl.textContent = content;
        });
    }

    /**
     * 更新工具提示位置
     */
    static updateTooltipPosition(widget: HTMLElement, tooltip: HTMLElement): void {
        const buttonRect = widget.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = this.TOOLTIP_MARGIN;

        tooltip.addClass("hi-note-tooltip-positioned");

        const tooltipRect = tooltip.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width || tooltip.offsetWidth;
        const tooltipHeight = tooltipRect.height || tooltip.offsetHeight;

        const spaceRight = viewportWidth - buttonRect.left - margin;
        let left = spaceRight >= tooltipWidth
            ? buttonRect.left
            : buttonRect.right - tooltipWidth;

        left = Math.min(
            Math.max(left, margin),
            Math.max(margin, viewportWidth - tooltipWidth - margin)
        );

        let top = buttonRect.bottom + this.TOOLTIP_GAP;
        if (top + tooltipHeight + margin > viewportHeight) {
            top = buttonRect.top - tooltipHeight - this.TOOLTIP_GAP;
        }
        top = Math.max(margin, top);

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
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
     * 没有评论时，只有悬停在高亮区域才显示添加批注按钮
     */
    static setupEmptyCommentHover(widget: HTMLElement, button: HTMLElement): void {
        button.addClass("hi-note-button-hidden");

        widget.addEventListener("mouseenter", () => {
            button.removeClass("hi-note-button-hidden");
        });

        widget.addEventListener("mouseleave", () => {
            button.addClass("hi-note-button-hidden");
        });
    }

    /**
     * 让拥有独立生命周期的 Widget 能清理窗口监听器
     */
    static registerResizePositioning(widget: HTMLElement, tooltip: HTMLElement): () => void {
        const resizeListener = () => this.updateTooltipPosition(widget, tooltip);
        window.addEventListener("resize", resizeListener);
        return () => window.removeEventListener("resize", resizeListener);
    }

    /**
     * 打开评论面板
     */
    static async openCommentPanel(app: App, highlight: HiNote, eventManager: EventManager): Promise<void> {
        const workspace = app.workspace;
        const existing = workspace.getLeavesOfType("hinote-view");

        if (existing.length) {
            await workspace.revealLeaf(existing[0]);
            await new Promise(resolve => window.setTimeout(resolve, 50));
        } else {
            const leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({
                    type: "hinote-view",
                    active: true
                });
                await new Promise(resolve => window.setTimeout(resolve, 200));
            }
        }
        
        eventManager.emitCommentInputOpen(highlight.id || '', highlight.text);
    }

    /**
     * 设置点击事件
     */
    static setupClickEvent(
        button: HTMLElement,
        tooltip: HTMLElement,
        onClick: () => void | Promise<void>
    ): void {
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            tooltip.addClass("hi-note-tooltip-hidden");
            void Promise.resolve(onClick()).catch(error => {
                console.error('[HiNote] Error handling comment widget click:', error);
            });
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

    /**
     * 根据高亮 ID 清理工具提示，避免 CSS selector 转义问题
     */
    static removeTooltipsForHighlight(highlight: HiNote): void {
        if (!highlight.id) return;

        activeDocument.querySelectorAll(".hi-note-tooltip").forEach(tooltip => {
            if (tooltip.getAttribute("data-highlight-id") === highlight.id) {
                tooltip.remove();
            }
        });
    }
}

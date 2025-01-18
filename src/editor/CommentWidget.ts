import { WidgetType } from "@codemirror/view";
import type { Plugin } from "obsidian";
import { HighlightComment, CommentItem } from "../CommentStore";
import { setIcon } from "obsidian";

export class CommentWidget extends WidgetType {
    /**
     * 构造函数
     * @param plugin Obsidian 插件实例
     * @param highlight 当前高亮对象
     * @param paragraphHighlights 同一段落中的所有高亮
     * @param onClick 点击评论按钮时的回调函数
     */
    constructor(
        private plugin: Plugin,
        private highlight: HighlightComment,
        private paragraphHighlights: HighlightComment[],
        private onClick: () => void
    ) {
        super();
    }

    /**
     * 比较两个小部件是否相等
     * 用于 CodeMirror 的优化，避免不必要的 DOM 更新
     * @param widget 要比较的另一个小部件
     * @returns 如果两个小部件内容相同则返回 true
     */
    eq(widget: WidgetType): boolean {
        if (!(widget instanceof CommentWidget)) return false;
        
        return this.paragraphHighlights.length === widget.paragraphHighlights.length &&
               this.paragraphHighlights.every((h, i) => 
                   h.text === widget.paragraphHighlights[i].text &&
                   h.comments.length === widget.paragraphHighlights[i].comments.length
               );
    }

    /**
     * 获取小部件的估计高度
     * 返回 0 因为我们的小部件是内联的，不占用额外的垂直空间
     */
    get estimatedHeight(): number {
        return 0;
    }

    /**
     * 获取小部件包含的换行符数量
     * 返回 0 因为我们的小部件是内联的，不包含换行
     */
    get lineBreaks(): number {
        return 0;
    }

    /**
     * 获取小部件在指定位置的坐标
     * 返回 null 因为我们不需要这个功能
     */
    coordsAt(dom: HTMLElement, pos: number, side: number): { top: number, bottom: number, left: number, right: number } | null {
        return null;
    }

    /**
     * 创建小部件的 DOM 结构
     * @returns 包含评论按钮和预览的 HTML 元素
     */
    toDOM() {
        const wrapper = document.createElement("span");
        wrapper.addClass("highlight-comment-widget");
        wrapper.setAttribute('data-paragraph-id', this.highlight.paragraphId);
        wrapper.setAttribute('data-highlights', this.paragraphHighlights.map(h => h.text).join(','));
        
        this.createButton(wrapper);
        return wrapper;
    }

    /**
     * 创建评论按钮
     * @param wrapper 父容器元素
     */
    private createButton(wrapper: HTMLElement) {
        const button = wrapper.createEl("button", {
            cls: "highlight-comment-button highlight-comment-button-hidden"
        });

        const iconContainer = this.createIconContainer(button);
        const tooltipData = this.createTooltip(wrapper);
        
        this.setupEventListeners(wrapper, button, tooltipData);
    }

    /**
     * 创建评论图标和评论数量标签
     * @param button 评论按钮元素
     * @returns 图标容器元素
     */
    private createIconContainer(button: HTMLElement) {
        const iconContainer = button.createEl("span", {
            cls: "highlight-comment-icon-container"
        });

        // 使用 setIcon API 替代内联 SVG
        setIcon(iconContainer, "message-circle");
        
        // 添加调试日志
        console.log('[CommentWidget] paragraphHighlights:', this.paragraphHighlights);
        
        // 如果有评论，显示评论数量
        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        console.log('[CommentWidget] allComments:', allComments);
        
        const commentCount = allComments.length;
        console.log('[CommentWidget] commentCount:', commentCount);

        if (commentCount > 0) {
            console.log('[CommentWidget] Creating comment count element');
            iconContainer.createEl("span", {
                cls: "highlight-comment-count",
                text: commentCount.toString()
            });
            button.removeClass("highlight-comment-button-hidden");
            console.log('[CommentWidget] Comment count element created and button shown');
        }

        return iconContainer;
    }

    /**
     * 创建评论预览工具提示
     * @param wrapper 父容器元素
     * @returns 工具提示相关的数据和更新位置的函数
     */
    private createTooltip(wrapper: HTMLElement) {
        const tooltip = document.createElement("div");
        tooltip.addClass("highlight-comment-tooltip", "hidden");

        const commentsList = tooltip.createEl("div", {
            cls: "highlight-comment-tooltip-list"
        });

        // 获取所有评论并渲染到工具提示中
        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        this.renderTooltipContent(commentsList, allComments, tooltip);

        document.body.appendChild(tooltip);

        // 创建更新工具提示位置的函数
        const updateTooltipPosition = () => {
            const buttonRect = wrapper.getBoundingClientRect();
            tooltip.style.position = 'fixed';
            tooltip.style.top = `${buttonRect.bottom + 4}px`;
            tooltip.style.left = `${buttonRect.right - tooltip.offsetWidth}px`;
        };

        return { tooltip, updateTooltipPosition };
    }

    /**
     * 渲染工具提示的内容
     * @param commentsList 评论列表容器
     * @param comments 评论数组
     * @param tooltip 工具提示容器
     */
    private renderTooltipContent(commentsList: HTMLElement, comments: CommentItem[], tooltip: HTMLElement) {
        if (comments.length === 0) return;

        // 最多显示 3 条评论
        comments.slice(0, 3).forEach(comment => {
            const commentItem = commentsList.createEl("div", {
                cls: "highlight-comment-tooltip-item"
            });
            
            // 显示评论内容
            commentItem.createEl("div", {
                cls: "highlight-comment-tooltip-content",
                text: comment.content
            });
            
            // 显示评论时间
            commentItem.createEl("div", {
                cls: "highlight-comment-tooltip-time",
                text: new Date(comment.createdAt).toLocaleString()
            });
        });

        // 如果评论数超过 3 条，显示剩余数量
        if (comments.length > 3) {
            tooltip.createEl("div", {
                cls: "highlight-comment-tooltip-more",
                text: `还有 ${comments.length - 3} 条评论...`
            });
        }
    }

    /**
     * 设置事件监听器
     * @param wrapper 父容器元素
     * @param button 评论按钮元素
     * @param tooltipData 工具提示相关的数据
     */
    private setupEventListeners(wrapper: HTMLElement, button: HTMLElement, tooltipData: { tooltip: HTMLElement, updateTooltipPosition: () => void }) {
        const { tooltip, updateTooltipPosition } = tooltipData;
        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        const commentCount = allComments.length;

        // 如果有评论，添加工具提示的显示/隐藏事件，并保持按钮始终可见
        if (commentCount > 0) {
            button.removeClass("highlight-comment-button-hidden");
            
            button.addEventListener("mouseenter", () => {
                tooltip.removeClass("hidden");
                updateTooltipPosition();
            });

            button.addEventListener("mouseleave", () => {
                tooltip.addClass("hidden");
            });
        } else {
            // 如果没有评论，默认隐藏按钮
            button.addClass("highlight-comment-button-hidden");
            
            // 鼠标悬停在高亮区域时显示按钮
            wrapper.addEventListener("mouseenter", () => {
                button.removeClass("highlight-comment-button-hidden");
            });

            wrapper.addEventListener("mouseleave", () => {
                button.addClass("highlight-comment-button-hidden");
            });
        }

        // 点击按钮时触发评论输入事件
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onClick();

            const event = new CustomEvent("open-comment-input", {
                detail: {
                    highlightId: this.highlight.id,
                    text: this.highlight.text
                }
            });
            window.dispatchEvent(event);
        });

        // 监听窗口大小改变事件，更新工具提示位置
        window.addEventListener("resize", updateTooltipPosition);
    }

    /**
     * 销毁小部件时清理资源
     * @param dom 小部件的 DOM 元素
     */
    destroy(dom: HTMLElement): void {
        const tooltip = document.querySelector(`.highlight-comment-tooltip[data-paragraph-id="${this.highlight.paragraphId}"]`);
        if (tooltip) {
            tooltip.remove();
        }
        dom.remove();
    }

    /**
     * 更新小部件的 DOM
     * 返回 false 表示我们总是重新创建 DOM 而不是更新它
     */
    updateDOM(dom: HTMLElement): boolean {
        return false;
    }

    /**
     * 是否忽略事件
     * 返回 false 表示我们要处理所有事件
     */
    ignoreEvent(): boolean {
        return false;
    }
}
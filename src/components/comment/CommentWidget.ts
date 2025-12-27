import { WidgetType } from "@codemirror/view";
import type { Plugin } from "obsidian";
import { HighlightInfo as HiNote, CommentItem } from "../../types";
import { setIcon, MarkdownRenderer, Component, App } from "obsidian";

export class CommentWidget extends WidgetType {
    private app: App;
    private comments: CommentItem[];
    private resizeListener: (() => void) | null = null;
    
    // 常量定义
    private static readonly POSITION_MATCH_THRESHOLD = 30;
    private static readonly MAX_TOOLTIP_COMMENTS = 3;
    
    /**
     * 构造函数
     * @param plugin Obsidian 插件实例
     * @param highlight 当前高亮对象
     * @param onClick 点击评论按钮时的回调函数
     */
    constructor(
        private plugin: Plugin,
        private highlight: HiNote,
        private onClick: () => void
    ) {
        super();
        this.app = this.plugin.app;
        this.comments = this.highlight.comments || [];
    }

    /**
     * 比较两个小部件是否相等
     * 用于 CodeMirror 的优化，避免不必要的 DOM 更新
     * @param widget 要比较的另一个小部件
     * @returns 如果两个小部件内容相同则返回 true
     */
    eq(widget: WidgetType): boolean {
        if (!(widget instanceof CommentWidget)) return false;
        
        // 使用位置匹配策略：如果位置接近且评论数量相同，认为是同一个 widget
        // 不依赖 ID 匹配，因为每次提取高亮时 ID 可能会变化
        const positionMatch = typeof this.highlight.position === 'number' && 
                             typeof widget.highlight.position === 'number' &&
                             Math.abs(this.highlight.position - widget.highlight.position) < CommentWidget.POSITION_MATCH_THRESHOLD;
        
        const textMatch = this.highlight.text === widget.highlight.text;
        const commentsMatch = (this.highlight.comments?.length ?? 0) === (widget.highlight.comments?.length ?? 0);
        
        // 只要位置匹配或文本匹配，且评论数量相同，就认为是同一个 widget
        const isEqual = (textMatch || positionMatch) && commentsMatch;
        
        return isEqual;
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
     * 创建小部件的 DOM 结构
     * @returns 包含评论按钮和预览的 HTML 元素
     */
    toDOM(): HTMLElement {
        const wrapper = document.createElement("span");
        wrapper.addClass("hi-note-widget");
        
        // 添加高亮 ID 作为数据属性，确保每个 Widget 都有唯一标识
        if (this.highlight.id) {
            wrapper.setAttribute('data-highlight-id', this.highlight.id);
        }
        
        this.createButton(wrapper);
        return wrapper;
    }

    /**
     * 创建评论按钮
     * @param wrapper 父容器元素
     */
    private createButton(wrapper: HTMLElement) {
        const hasComments = this.comments.length > 0;
        
        // 创建按钮，如果没有评论，添加隐藏类
        // 添加 clickable-icon 类以避免在平板模式下被拉伸
        const button = wrapper.createEl("button", {
            cls: `hi-note-button clickable-icon ${!hasComments ? 'hi-note-button-hidden' : ''}`
        });

        const iconContainer = this.createIconContainer(button);
        
        // 创建工具提示，无论是否有评论
        const tooltipData = this.createTooltip(wrapper);
        
        // 设置事件监听器
        this.setupEventListeners(wrapper, button, tooltipData);
    }

    /**
     * 创建评论图标和评论数量标签
     * @param button 评论按钮元素
     * @returns 图标容器元素
     */
    private createIconContainer(button: HTMLElement) {
        const iconContainer = button.createEl("span", {
            cls: "hi-note-icon-container"
        });

        // 使用 setIcon API 替代内联 SVG
        setIcon(iconContainer, "message-circle");

        // 如果有评论，显示评论数量
        if (this.comments.length > 0) {
            iconContainer.createEl("span", {
                cls: "hi-note-count",
                text: this.comments.length.toString()
            });
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
        tooltip.addClass("hi-note-tooltip", "hi-note-tooltip-hidden");
        
        // 添加高亮 ID 作为工具提示的标识符
        if (this.highlight.id) {
            tooltip.setAttribute("data-highlight-id", this.highlight.id);
        }

        const commentsList = tooltip.createEl("div", {
            cls: "hi-note-tooltip-list"
        });

        // 渲染评论到工具提示中
        this.renderTooltipContent(commentsList, tooltip);

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
     * @param tooltip 工具提示容器
     */
    private renderTooltipContent(commentsList: HTMLElement, tooltip: HTMLElement) {
        if (this.comments.length === 0) return;

        // 最多显示指定数量的评论
        this.comments.slice(0, CommentWidget.MAX_TOOLTIP_COMMENTS).forEach(comment => {
            const commentItem = commentsList.createEl("div", {
                cls: "hi-note-tooltip-item"
            });
            
            // 显示评论内容 - 使用 Markdown 渲染
            const contentEl = commentItem.createEl("div", {
                cls: "hi-note-tooltip-content markdown-rendered"
            });
            
            // 异步渲染 Markdown 内容
            this.renderMarkdownContent(contentEl, comment.content);
            
            // 显示评论时间
            commentItem.createEl("div", {
                cls: "hi-note-tooltip-time",
                text: new Date(comment.createdAt).toLocaleString()
            });
        });

        // 如果评论数超过最大显示数量，显示剩余数量
        if (this.comments.length > CommentWidget.MAX_TOOLTIP_COMMENTS) {
            tooltip.createEl("div", {
                cls: "hi-note-tooltip-more",
                text: `还有 ${this.comments.length - CommentWidget.MAX_TOOLTIP_COMMENTS} 条评论...`
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

        // 如果有评论，添加工具提示的显示/隐藏事件，并保持按钮始终可见
        if (this.comments.length > 0) {
            button.removeClass("hi-note-button-hidden");
            
            button.addEventListener("mouseenter", () => {
                tooltip.removeClass("hi-note-tooltip-hidden");
                updateTooltipPosition();
            });

            button.addEventListener("mouseleave", () => {
                tooltip.addClass("hi-note-tooltip-hidden");
            });
        } else {
            // 如果没有评论，默认隐藏按钮
            button.addClass("hi-note-button-hidden");
            
            // 鼠标悬停在高亮区域时显示按钮
            wrapper.addEventListener("mouseenter", () => {
                button.removeClass("hi-note-button-hidden");
            });

            wrapper.addEventListener("mouseleave", () => {
                button.addClass("hi-note-button-hidden");
            });
        }

        // 点击按钮时触发评论输入事件
        button.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // 隐藏工具提示
            tooltip.addClass("hi-note-tooltip-hidden");
            
            // 调用 onClick 回调，它会处理打开侧边栏和触发 open-comment-input 事件
            await this.onClick();
        });

        // 监听窗口大小改变事件，更新工具提示位置
        // 保存监听器引用以便在销毁时清理
        this.resizeListener = updateTooltipPosition;
        window.addEventListener("resize", this.resizeListener);
    }
    
    /**
     * 渲染 Markdown 内容
     * @param containerEl 容器元素
     * @param content Markdown 文本内容
     */
    private async renderMarkdownContent(containerEl: HTMLElement, content: string) {
        try {
            // 使用 Obsidian 的 MarkdownRenderer.render 方法渲染 Markdown
            await MarkdownRenderer.render(
                this.app,
                content,
                containerEl,
                '',  // 没有关联文件路径
                new Component()
            );
            
            // 添加自定义样式类以修复可能的样式问题
            const lists = containerEl.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.addClass('tooltip-markdown-list');
            });
        } catch (error) {
            console.error('Error rendering markdown in tooltip:', error);
            
            // 如果渲染失败，回退到纯文本渲染
            containerEl.textContent = content;
        }
    }

    /**
     * 销毁小部件时清理资源
     * @param dom 小部件的 DOM 元素
     */
    destroy(dom: HTMLElement): void {
        // 移除 resize 监听器，防止内存泄漏
        if (this.resizeListener) {
            window.removeEventListener("resize", this.resizeListener);
            this.resizeListener = null;
        }
        
        // 查找并移除对应的工具提示
        if (this.highlight.id) {
            const tooltip = document.querySelector(`.hi-note-tooltip[data-highlight-id="${this.highlight.id}"]`);
            if (tooltip) {
                tooltip.remove();
            }
        }
        
        // 移除 DOM 元素
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
        return true; // 返回 true 以阻止事件冒泡到编辑器，避免激活源码模式
    }
}

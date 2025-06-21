import { WidgetType } from "@codemirror/view";
import type { Plugin } from "obsidian";
import { HiNote, CommentItem } from "../../CommentStore";
import { setIcon, MarkdownRenderer, Component, App } from "obsidian";
import { TextSimilarityService } from "../../services/TextSimilarityService";

export class CommentWidget extends WidgetType {
    private app: App;
    private textSimilarityService: TextSimilarityService;
    
    /**
     * 构造函数
     * @param plugin Obsidian 插件实例
     * @param highlight 当前高亮对象
     * @param paragraphHighlights 同一段落中的所有高亮
     * @param onClick 点击评论按钮时的回调函数
     */
    constructor(
        private plugin: Plugin,
        private highlight: HiNote,
        private highlightItems: HiNote[],
        private onClick: () => void
    ) {
        super();
        this.app = this.plugin.app;
        this.textSimilarityService = new TextSimilarityService(this.plugin.app);
    }

    // /**
    //  * 比较两个小部件是否相等
    //  * 用于 CodeMirror 的优化，避免不必要的 DOM 更新
    //  * @param widget 要比较的另一个小部件
    //  * @returns 如果两个小部件内容相同则返回 true
    //  */
    eq(widget: WidgetType): boolean {
        if (!(widget instanceof CommentWidget)) return false;
        
        // 首先比较高亮 ID，如果不同则直接返回 false
        if (this.highlight.id !== widget.highlight.id) return false;
        
        // 使用模糊匹配来比较文本相似度
        const textSimilarity = this.textSimilarityService.calculateSimilarity(
            this.highlight.text,
            widget.highlight.text
        );
        
        // 如果文本相似度超过阈值，或者文本完全相同，则认为是相同的小部件
        return (textSimilarity > 0.7 || this.highlight.text === widget.highlight.text) &&
               this.highlight.comments.length === widget.highlight.comments.length;
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
    toDOM() {
        const wrapper = document.createElement("span");
        wrapper.addClass("hi-note-widget");
        
        // 添加高亮 ID 作为数据属性，确保每个 Widget 都有唯一标识
        wrapper.setAttribute('data-highlight-id', this.highlight.id);
        
        // // 优先使用 blockId，如果没有则使用 paragraphId
        // if (this.highlight.blockId) {
        //     wrapper.setAttribute('data-block-id', this.highlight.blockId);
        // }
        
        // // 保留 paragraphId 以保持兼容性
        // if (this.highlight.paragraphId) {
        //     wrapper.setAttribute('data-paragraph-id', this.highlight.paragraphId);
        // }
        
        // wrapper.setAttribute('data-highlight-text', this.highlight.text);
        
        // 检查是否有评论
        const hasComments = (this.highlight.comments || []).length > 0;
        
        // 如果没有评论，添加一个额外的类，但不完全隐藏
        // if (!hasComments) {
        //     wrapper.addClass("hi-note-widget-no-comments");
        // }
        
        this.createButton(wrapper);
        return wrapper;
    }

    /**
     * 创建评论按钮
     * @param wrapper 父容器元素
     */
    private createButton(wrapper: HTMLElement) {
        // 检查是否有评论
        const hasComments = (this.highlight.comments || []).length > 0;
        
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
        
        // 直接使用当前高亮的评论数量，不从其他高亮中查找
        const comments = this.highlight.comments || [];
        const commentCount = comments.length;

        // 如果有评论，显示评论数量
        if (commentCount > 0) {
            iconContainer.createEl("span", {
                cls: "hi-note-count",
                text: commentCount.toString()
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
        tooltip.setAttribute("data-highlight-id", this.highlight.id);

        const commentsList = tooltip.createEl("div", {
            cls: "hi-note-tooltip-list"
        });

        // 获取评论并渲染到工具提示中
        const comments = this.highlight.comments || [];
        this.renderTooltipContent(commentsList, comments, tooltip);

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

        // 如果评论数超过 3 条，显示剩余数量
        if (comments.length > 3) {
            tooltip.createEl("div", {
                cls: "hi-note-tooltip-more",
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
        const comments = this.highlight.comments || [];
        const commentCount = comments.length;

        // 如果有评论，添加工具提示的显示/隐藏事件，并保持按钮始终可见
        if (commentCount > 0) {
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
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onClick();
            
            // 隐藏工具提示
            tooltip.addClass("hi-note-tooltip-hidden");

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
        // 查找并移除对应的工具提示
        const tooltip = document.querySelector(`.hi-note-tooltip[data-highlight-id="${this.highlight.id}"]`);
        if (tooltip) {
            tooltip.remove();
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
        return false;
    }
}

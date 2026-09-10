import { WidgetType } from "@codemirror/view";
import type { Plugin } from "obsidian";
import { HighlightInfo as HiNote } from "../../types/highlight";
import { CommentWidgetHelper } from "./CommentWidgetHelper";

export class CommentWidget extends WidgetType {
    private cleanupResizePositioning: (() => void) | null = null;
    
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
    }

    /**
     * 比较两个小部件是否相等
     * 用于 CodeMirror 的优化，避免不必要的 DOM 更新
     * @param widget 要比较的另一个小部件
     * @returns 如果两个小部件内容相同则返回 true
     */
    eq(widget: WidgetType): boolean {
        if (!(widget instanceof CommentWidget)) return false;

        const idMatch = !!this.highlight.id && this.highlight.id === widget.highlight.id;
        const textMatch = this.highlight.text === widget.highlight.text;
        const positionMatch = this.highlight.position === widget.highlight.position;
        const commentsMatch = (this.highlight.comments?.length ?? 0) === (widget.highlight.comments?.length ?? 0);

        return (idMatch || (textMatch && positionMatch)) && commentsMatch;
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
        const wrapper = createEl("span");
        wrapper.addClass("hi-note-widget");
        
        // 添加高亮 ID 作为数据属性，确保每个 Widget 都有唯一标识
        if (this.highlight.id) {
            wrapper.setAttribute('data-highlight-id', this.highlight.id);
        }
        
        this.setupButton(wrapper);
        return wrapper;
    }

    /**
     * 创建评论按钮，并接入共享的提示与点击行为
     * @param wrapper 父容器元素
     */
    private setupButton(wrapper: HTMLElement): void {
        const comments = this.highlight.comments || [];
        const hasComments = comments.length > 0;
        const button = CommentWidgetHelper.createButton(wrapper, hasComments);
        const iconContainer = button.querySelector<HTMLElement>('.hi-note-icon-container');

        if (iconContainer) {
            CommentWidgetHelper.addCommentCount(iconContainer, comments.length);
        }

        const tooltip = CommentWidgetHelper.createTooltip(this.plugin.app, this.highlight);

        if (hasComments) {
            button.removeClass("hi-note-button-hidden");
            CommentWidgetHelper.setupTooltipEvents(button, wrapper, tooltip);
        } else {
            CommentWidgetHelper.setupEmptyCommentHover(wrapper, button);
        }

        CommentWidgetHelper.setupClickEvent(button, tooltip, () => this.onClick());

        // CodeMirror Widget 有独立 destroy 生命周期，这里保留监听器引用便于卸载。
        this.cleanupResizePositioning = CommentWidgetHelper.registerResizePositioning(wrapper, tooltip);
    }

    /**
     * 销毁小部件时清理资源
     * @param dom 小部件的 DOM 元素
     */
    destroy(dom: HTMLElement): void {
        // 移除 resize 监听器，防止内存泄漏
        if (this.cleanupResizePositioning) {
            this.cleanupResizePositioning();
            this.cleanupResizePositioning = null;
        }
        
        CommentWidgetHelper.removeTooltipsForHighlight(this.highlight);
        
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

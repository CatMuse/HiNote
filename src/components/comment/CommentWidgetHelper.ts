import { App, setIcon } from "obsidian";
import { HighlightInfo as HiNote } from "../../types/highlight";
import type { EventManager } from "../../services/EventManager";
import { CommentTooltipController, type CommentTooltipBinding } from './CommentTooltipController';

/**
 * 批注小部件辅助类
 * 提供编辑模式和阅读模式共享的工具方法
 */
export class CommentWidgetHelper {
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

    static bindTooltip(app: App, button: HTMLElement, widget: HTMLElement, highlight: HiNote): CommentTooltipBinding {
        return CommentTooltipController.bind(app, button, widget, highlight);
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
        hideTooltip: () => void,
        onClick: () => void | Promise<void>
    ): void {
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideTooltip();
            void Promise.resolve(onClick()).catch(error => {
                console.error('[HiNote] Error handling comment widget click:', error);
            });
        });
    }
}

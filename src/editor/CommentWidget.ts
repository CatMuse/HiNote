import { WidgetType } from "@codemirror/view";
import type { Plugin } from "obsidian";
import { HighlightComment, CommentItem } from "../CommentStore";

export class CommentWidget extends WidgetType {
    constructor(
        private plugin: Plugin,
        private highlight: HighlightComment,
        private paragraphHighlights: HighlightComment[],
        private onClick: () => void
    ) {
        super();
    }

    eq(widget: WidgetType): boolean {
        if (!(widget instanceof CommentWidget)) return false;
        
        return this.paragraphHighlights.length === widget.paragraphHighlights.length &&
               this.paragraphHighlights.every((h, i) => 
                   h.text === widget.paragraphHighlights[i].text &&
                   h.comments.length === widget.paragraphHighlights[i].comments.length
               );
    }

    get estimatedHeight(): number {
        return 0;
    }

    get lineBreaks(): number {
        return 0;
    }

    coordsAt(dom: HTMLElement, pos: number, side: number): { top: number, bottom: number, left: number, right: number } | null {
        return null;
    }

    toDOM() {
        const wrapper = document.createElement("span");
        wrapper.addClass("highlight-comment-widget");
        wrapper.setAttribute('data-paragraph-id', this.highlight.paragraphId);
        wrapper.setAttribute('data-highlights', this.paragraphHighlights.map(h => h.text).join(','));
        
        this.createButton(wrapper);
        return wrapper;
    }

    private createButton(wrapper: HTMLElement) {
        const button = wrapper.createEl("button", {
            cls: "highlight-comment-button highlight-comment-button-hidden"
        });

        const iconContainer = this.createIconContainer(button);
        const tooltip = this.createTooltip(wrapper);
        
        this.setupEventListeners(wrapper, button, tooltip);
    }

    private createIconContainer(button: HTMLElement) {
        const iconContainer = button.createEl("span", {
            cls: "highlight-comment-icon-container"
        });

        iconContainer.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
            </svg>
        `;

        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        const commentCount = allComments.length;

        if (commentCount > 0) {
            iconContainer.createEl("span", {
                cls: "highlight-comment-count",
                text: commentCount.toString()
            });
            button.removeClass("highlight-comment-button-hidden");
        }

        return iconContainer;
    }

    private createTooltip(wrapper: HTMLElement) {
        const tooltip = wrapper.createEl("div", {
            cls: "highlight-comment-tooltip hidden"
        });

        const commentsList = tooltip.createEl("div", {
            cls: "highlight-comment-tooltip-list"
        });

        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        this.renderTooltipContent(commentsList, allComments, tooltip);

        return tooltip;
    }

    private renderTooltipContent(commentsList: HTMLElement, comments: CommentItem[], tooltip: HTMLElement) {
        if (comments.length === 0) return;

        comments.slice(0, 3).forEach(comment => {
            const commentItem = commentsList.createEl("div", {
                cls: "highlight-comment-tooltip-item"
            });
            
            commentItem.createEl("div", {
                cls: "highlight-comment-tooltip-content",
                text: comment.content
            });
            
            commentItem.createEl("div", {
                cls: "highlight-comment-tooltip-time",
                text: new Date(comment.createdAt).toLocaleString()
            });
        });

        if (comments.length > 3) {
            tooltip.createEl("div", {
                cls: "highlight-comment-tooltip-more",
                text: `还有 ${comments.length - 3} 条评论...`
            });
        }
    }

    private setupEventListeners(wrapper: HTMLElement, button: HTMLElement, tooltip: HTMLElement) {
        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        const commentCount = allComments.length;

        if (commentCount > 0) {
            button.addEventListener("mouseenter", () => {
                tooltip.removeClass("hidden");
            });

            button.addEventListener("mouseleave", () => {
                tooltip.addClass("hidden");
            });
        }

        wrapper.addEventListener("mouseenter", () => {
            button.removeClass("highlight-comment-button-hidden");
        });

        wrapper.addEventListener("mouseleave", () => {
            if (commentCount === 0) {
                button.addClass("highlight-comment-button-hidden");
            }
        });

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
    }

    destroy(dom: HTMLElement): void {
        dom.remove();
    }

    updateDOM(dom: HTMLElement): boolean {
        return false;
    }

    ignoreEvent(): boolean {
        return false;
    }
} 
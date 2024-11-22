import { EditorView, ViewPlugin, DecorationSet, Decoration, WidgetType } from "@codemirror/view";
import { Plugin, MarkdownView } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from "./CommentStore";

class CommentWidget extends WidgetType {
    constructor(
        private plugin: Plugin,
        private highlights: { text: string; position: number }[],
        private commentCount: number,
        private comments: CommentItem[],
        private onClick: () => void
    ) {
        super();
    }

    toDOM() {
        const wrapper = document.createElement("span");
        wrapper.addClass("highlight-comment-widget");
        
        const button = wrapper.createEl("button", {
            cls: "highlight-comment-button"
        });

        // 评论图标和数量容器
        const iconContainer = button.createEl("span", {
            cls: "highlight-comment-icon-container"
        });

        // 更新评论图标为简单版本
        iconContainer.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14">
                <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
        `;

        // 评论数量
        if (this.commentCount > 0) {
            iconContainer.createEl("span", {
                cls: "highlight-comment-count",
                text: this.commentCount.toString()
            });

            // 如果有评论，默认显示按钮
            button.removeClass("highlight-comment-button-hidden");
        } else {
            button.addClass("highlight-comment-button-hidden");
        }

        // 创建评论预览弹窗
        if (this.comments && this.comments.length > 0) {
            const tooltip = wrapper.createEl("div", {
                cls: "highlight-comment-tooltip hidden"
            });

            const commentsList = tooltip.createEl("div", {
                cls: "highlight-comment-tooltip-list"
            });

            this.comments.slice(0, 3).forEach(comment => {
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

            if (this.comments.length > 3) {
                tooltip.createEl("div", {
                    cls: "highlight-comment-tooltip-more",
                    text: `还有 ${this.comments.length - 3} 条评论...`
                });
            }

            // 只在有评论时添加悬停事件
            button.addEventListener("mouseenter", () => {
                tooltip.removeClass("hidden");
            });

            button.addEventListener("mouseleave", () => {
                tooltip.addClass("hidden");
            });
        }

        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onClick();
        });

        return wrapper;
    }
}

export class HighlightDecorator {
    private plugin: Plugin;
    private commentStore: CommentStore;

    constructor(plugin: Plugin, commentStore: CommentStore) {
        this.plugin = plugin;
        this.commentStore = commentStore;
    }

    enable() {
        const plugin = this.plugin;
        const commentStore = this.commentStore;

        const highlightPlugin = ViewPlugin.fromClass(class {
            decorations: DecorationSet;
            plugin: Plugin;
            commentStore: CommentStore;

            constructor(view: EditorView) {
                this.plugin = plugin;
                this.commentStore = commentStore;
                this.decorations = this.buildDecorations(view);
            }

            update(update: any) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            buildDecorations(view: EditorView) {
                const widgets: any[] = [];
                const doc = view.state.doc;
                const markdownView = this.getActiveMarkdownView();
                
                if (!markdownView || !markdownView.file) return Decoration.none;

                const content = doc.toString();
                const fileComments = this.commentStore.getFileComments(markdownView.file);

                // 按段落分析高亮内容
                const paragraphs = content.split(/\n\n+/);
                let offset = 0;

                paragraphs.forEach(paragraph => {
                    const highlightRegex = /==(.*?)==|<mark>(.*?)<\/mark>/g;
                    const paragraphHighlights: Array<{ text: string; position: number }> = [];
                    let match;

                    // 收集段落中的所有高亮
                    while ((match = highlightRegex.exec(paragraph)) !== null) {
                        const text = match[1] || match[2];
                        if (text.trim()) {
                            const absolutePosition = offset + match.index;
                            paragraphHighlights.push({
                                text: text.trim(),
                                position: absolutePosition
                            });

                            // 添加高亮文本的装饰
                            const highlightMark = Decoration.mark({
                                class: "cm-highlight"
                            });
                            widgets.push(highlightMark.range(absolutePosition, absolutePosition + match[0].length));
                        }
                    }

                    // 如果段落中有高亮内容，添加评论按钮
                    if (paragraphHighlights.length > 0) {
                        // 获取段落中所有高亮的评论
                        const paragraphComments = paragraphHighlights.flatMap(highlight => {
                            const storedHighlight = fileComments.find(
                                h => h.text === highlight.text && h.position === highlight.position
                            );
                            return storedHighlight?.comments || [];
                        });

                        // 在段落开始位置添加评论按钮
                        const widget = Decoration.widget({
                            widget: new CommentWidget(
                                this.plugin,
                                paragraphHighlights,
                                paragraphComments.length,
                                paragraphComments,
                                () => this.openCommentPanel(paragraphHighlights[0])
                            ),
                            side: -1
                        });

                        widgets.push(widget.range(offset));
                    }

                    offset += paragraph.length + 2; // +2 for the newlines
                });

                return Decoration.set(widgets, true);
            }

            private getActiveMarkdownView() {
                return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            }

            private openCommentPanel(highlight: { text: string; position: number }) {
                const workspace = this.plugin.app.workspace;
                const existing = workspace.getLeavesOfType("comment-view");
                
                if (existing.length) {
                    workspace.revealLeaf(existing[0]);
                } else {
                    const leaf = workspace.getRightLeaf(false);
                    if (leaf) {
                        leaf.setViewState({
                            type: "comment-view",
                            active: true
                        });
                    }
                }
            }
        }, {
            decorations: v => v.decorations,
        });

        // 注册插件
        this.plugin.registerEditorExtension([highlightPlugin]);
    }
} 
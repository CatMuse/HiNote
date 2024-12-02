import { EditorView, ViewPlugin, DecorationSet, Decoration, WidgetType } from "@codemirror/view";
import { Plugin, MarkdownView } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from "./CommentStore";
import { CommentUpdateEvent } from "./types";

class CommentWidget extends WidgetType {
    constructor(
        private plugin: Plugin,
        private highlight: HighlightComment,
        private paragraphHighlights: HighlightComment[],
        private onClick: () => void
    ) {
        super();
    }

    eq(other: CommentWidget): boolean {
        // 比较评论内容是否相同
        return this.paragraphHighlights.length === other.paragraphHighlights.length &&
               this.paragraphHighlights.every((h, i) => 
                   h.text === other.paragraphHighlights[i].text &&
                   h.comments.length === other.paragraphHighlights[i].comments.length
               );
    }

    toDOM() {
        const wrapper = document.createElement("span");
        wrapper.addClass("highlight-comment-widget");
        wrapper.setAttribute('data-paragraph-id', this.highlight.paragraphId);
        wrapper.setAttribute('data-highlights', this.paragraphHighlights.map(h => h.text).join(','));
        
        const button = wrapper.createEl("button", {
            cls: "highlight-comment-button highlight-comment-button-hidden"
        });

        // 评论图标和数量容器
        const iconContainer = button.createEl("span", {
            cls: "highlight-comment-icon-container"
        });

        // 更新评论图标为 Lucide 样式
        iconContainer.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
            </svg>
        `;

        // 获取所有评论
        const allComments = this.paragraphHighlights.flatMap(h => h.comments || []);
        const commentCount = allComments.length;

        // 评论数量
        if (commentCount > 0) {
            iconContainer.createEl("span", {
                cls: "highlight-comment-count",
                text: commentCount.toString()
            });
            button.removeClass("highlight-comment-button-hidden");
        }

        // 创建预览弹窗
        const tooltip = wrapper.createEl("div", {
            cls: "highlight-comment-tooltip hidden"
        });

        const commentsList = tooltip.createEl("div", {
            cls: "highlight-comment-tooltip-list"
        });

        if (commentCount > 0) {
            allComments.slice(0, 3).forEach(comment => {
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

            if (allComments.length > 3) {
                tooltip.createEl("div", {
                    cls: "highlight-comment-tooltip-more",
                    text: `还有 ${allComments.length - 3} 条评论...`
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

        // 添加鼠标悬停事件 - 控制按钮显示
        wrapper.addEventListener("mouseenter", () => {
            button.removeClass("highlight-comment-button-hidden");
        });

        wrapper.addEventListener("mouseleave", () => {
            if (commentCount === 0) {  // 只有在没有评论时才隐藏
                button.addClass("highlight-comment-button-hidden");
            }
        });

        // 点击事件
        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onClick();
            
            window.dispatchEvent(new CustomEvent("open-comment-input", {
                detail: {
                    highlightId: this.highlight.id,
                    text: this.highlight.text
                }
            }));
        });

        return wrapper;
    }

    destroy(dom: HTMLElement): void {
        dom.remove();
    }
}

export class HighlightDecorator {
    private plugin: Plugin;
    private commentStore: CommentStore;

    constructor(plugin: Plugin, commentStore: CommentStore) {
        this.plugin = plugin;
        this.commentStore = commentStore;
    }

    private getActiveMarkdownView() {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    enable() {
        const plugin = this.plugin;
        const commentStore = this.commentStore;

        // 监听评论更新事件
        this.plugin.registerDomEvent(window, 'comment-updated', (e: CustomEvent) => {
            const buttons = document.querySelectorAll('.highlight-comment-widget');
            const updatedText = e.detail.text;
            
            // 获取当前文档和评论
            const view = this.getActiveMarkdownView();
            if (!view || !view.file) return;
            
            const fileComments = this.commentStore.getFileComments(view.file);
            if (!fileComments) return;

            buttons.forEach(button => {
                const highlightTexts = button.getAttribute('data-highlights')?.split(',') || [];
                
                // 如果这个段落包含更新的高亮文本
                if (highlightTexts.includes(updatedText)) {
                    // 获取段落中所有高亮的评论
                    const allComments = fileComments
                        .filter(comment => highlightTexts.includes(comment.text))
                        .flatMap(h => h.comments || []);

                    // 更新评论数量
                    const countEl = button.querySelector('.highlight-comment-count');
                    if (countEl) {
                        const commentCount = allComments.length;
                        countEl.textContent = commentCount.toString();
                        
                        const commentButton = button.querySelector('.highlight-comment-button');
                        if (commentCount === 0) {
                            commentButton?.addClass('highlight-comment-button-hidden');
                        } else {
                            commentButton?.removeClass('highlight-comment-button-hidden');
                        }
                    }

                    // 更新预览内容
                    const tooltip = button.querySelector('.highlight-comment-tooltip');
                    if (tooltip) {
                        this.updateTooltipContent(tooltip, allComments);
                    }
                }
            });
        });

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
                const markdownView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                
                if (!markdownView || !markdownView.file) return Decoration.none;

                const content = doc.toString();
                const fileComments = this.commentStore.getFileComments(markdownView.file);

                // 按段落分析内容
                const paragraphs = content.split(/\n\n+/);
                let offset = 0;

                paragraphs.forEach((paragraph) => {
                    // 在当前段落中查找高亮文本
                    const highlightRegex = /==\s*(.*?)\s*==|<mark>\s*(.*?)\s*<\/mark>|<span style="background:(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,6})">\s*(.*?)\s*<\/span>/g;
                    let match;
                    const paragraphHighlights: HighlightComment[] = [];

                    while ((match = highlightRegex.exec(paragraph)) !== null) {
                        const text = match[1] || match[2] || match[4];
                        const backgroundColor = match[3];
                        if (text?.trim()) {
                            const from = offset + match.index;
                            const to = from + match[0].length;
                            
                            // 添加高亮标记
                            const highlightMark = Decoration.mark({
                                class: "cm-highlight-text",
                                attributes: backgroundColor ? { style: `background-color: ${backgroundColor}` } : {}
                            });
                            widgets.push(highlightMark.range(from, to));

                            // 查找已存在的评论
                            const matchedComment = fileComments?.find(c => c.text === text.trim());
                            if (matchedComment) {
                                paragraphHighlights.push(matchedComment);
                            } else {
                                // 为没有评论的高亮创建一个新的评论对象
                                paragraphHighlights.push({
                                    id: `highlight-${Date.now()}-${from}`,
                                    text: text.trim(),
                                    position: from,
                                    comments: [],
                                    createdAt: Date.now(),
                                    updatedAt: Date.now(),
                                    paragraphId: `p-${offset}-${Date.now()}`
                                } as HighlightComment);
                            }
                        }
                    }

                    // 只要段落中有高亮就创建评论按钮
                    if (paragraphHighlights.length > 0) {
                        // 使用 flatMap 合并该段落中所有高亮的评论
                        const allComments = paragraphHighlights.flatMap(h => h.comments || []);
                        const combinedHighlight = {
                            ...paragraphHighlights[0],
                            comments: allComments
                        };

                        // 在段落末尾添加评论小部件
                        const widget = Decoration.widget({
                            widget: new CommentWidget(
                                this.plugin,
                                combinedHighlight,
                                paragraphHighlights,
                                () => this.openCommentPanel(combinedHighlight)
                            ),
                            side: 1
                        });
                        widgets.push(widget.range(offset + paragraph.length));
                    }

                    offset += paragraph.length + 2; // +2 for the paragraph separators
                });

                return Decoration.set(widgets);
            }

            private openCommentPanel(highlight: HighlightComment) {
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
            decorations: v => v.decorations
        });

        this.plugin.registerEditorExtension([highlightPlugin]);
    }

    private updateTooltipContent(tooltip: Element, comments: CommentItem[]) {
        const list = tooltip.querySelector('.highlight-comment-tooltip-list');
        if (!list) return;

        // 清空现有内容
        list.empty();

        // 添加最新的评论
        comments.slice(0, 3).forEach(comment => {
            const item = list.createEl('div', { cls: 'highlight-comment-tooltip-item' });
            item.createEl('div', {
                cls: 'highlight-comment-tooltip-content',
                text: comment.content
            });
            item.createEl('div', {
                cls: 'highlight-comment-tooltip-time',
                text: new Date(comment.createdAt).toLocaleString()
            });
        });

        // 更新"更多评论"提示
        const moreEl = tooltip.querySelector('.highlight-comment-tooltip-more');
        if (comments.length > 3) {
            if (moreEl) {
                moreEl.textContent = `还有 ${comments.length - 3} 条评论...`;
                moreEl.removeClass('hidden');
            } else {
                tooltip.createEl('div', {
                    cls: 'highlight-comment-tooltip-more',
                    text: `还有 ${comments.length - 3} 条评论...`
                });
            }
        } else if (moreEl) {
            moreEl.addClass('hidden');
        }
    }
} 
import { EditorView, ViewPlugin, DecorationSet, Decoration } from "@codemirror/view";
import { Plugin, MarkdownView } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from "./CommentStore";
import { CommentWidget } from "./editor/CommentWidget";

export class HighlightDecorator {
    private plugin: Plugin;
    private commentStore: CommentStore;
    private highlightPlugin: any;

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
                    const highlightRegex = /==\s*(.*?)\s*==|<mark(?:\s+style="[^"]*?background(?:-color)?:\s*(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,8})[^"]*")?\s*>(.*?)<\/mark>|<span\s+style="background(?:-color)?:\s*(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,8})">\s*(.*?)\s*<\/span>/g;
                    let match;
                    const paragraphHighlights: HighlightComment[] = [];

                    while ((match = highlightRegex.exec(paragraph)) !== null) {
                        const text = match[1] || match[3] || match[5]; // 更新索引以匹配新的捕获组
                        const backgroundColor = match[2] || match[4]; // 更新索引以匹配新的捕获组
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

                        // 在段落末尾添加评论部件
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

        this.highlightPlugin = highlightPlugin;
        this.plugin.registerEditorExtension([highlightPlugin]);
    }

    disable() {
        // 移除编辑器扩展
        if (this.highlightPlugin) {
            const view = this.getActiveMarkdownView();
            if (view?.editor) {
                // 刷新编辑器以移除所有装饰器
                view.editor.refresh();
            }
        }

        // 移除所有高亮评论按钮
        document.querySelectorAll('.highlight-comment-widget').forEach(el => el.remove());
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

        // // 更新"更多评论"提示,应该是重复代码，注释观察
        // const moreEl = tooltip.querySelector('.highlight-comment-tooltip-more');
        // if (comments.length > 3) {
        //     if (moreEl) {
        //         moreEl.textContent = `还有 ${comments.length - 3} 条评论...`;
        //         moreEl.removeClass('hidden');
        //     } else {
        //         tooltip.createEl('div', {
        //             cls: 'highlight-comment-tooltip-more',
        //             text: `还有 ${comments.length - 3} 条评论...`
        //         });
        //     }
        // } else if (moreEl) {
        //     moreEl.addClass('hidden');
        // }
    }
} 
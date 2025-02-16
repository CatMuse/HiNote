import { EditorView, ViewPlugin, DecorationSet, Decoration } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { Plugin, MarkdownView } from "obsidian";
import { CommentStore, HiNote, CommentItem } from "./CommentStore";
import { CommentWidget } from "./editor/CommentWidget";
import { HighlightService } from './services/HighlightService';

export class HighlightDecorator {
    private plugin: Plugin;
    private commentStore: CommentStore;
    private highlightPlugin: any;
    private highlightService: HighlightService;

    constructor(plugin: Plugin, commentStore: CommentStore) {
        this.plugin = plugin;
        this.commentStore = commentStore;
        this.highlightService = new HighlightService(this.plugin.app);
    }

    private getActiveMarkdownView() {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    enable() {
        const plugin = this.plugin;
        const commentStore = this.commentStore;

        // 监听评论更新事件
        this.plugin.registerDomEvent(window, 'comment-updated', (e: CustomEvent) => {
            const buttons = document.querySelectorAll('.hi-note-widget');
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
                    const countEl = button.querySelector('.hi-note-count');
                    if (countEl) {
                        const commentCount = allComments.length;
                        countEl.textContent = commentCount.toString();
                        
                        const commentButton = button.querySelector('.hi-note-button');
                        if (commentCount === 0) {
                            commentButton?.addClass('hi-note-button-hidden');
                        } else {
                            commentButton?.removeClass('hi-note-button-hidden');
                        }
                    }

                    // 更新预览内容
                    const tooltip = button.querySelector('.hi-note-tooltip');
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
            highlightService: HighlightService;

            constructor(view: EditorView) {
                this.plugin = plugin;
                this.commentStore = commentStore;
                this.highlightService = new HighlightService(this.plugin.app);
                this.decorations = this.buildDecorations(view);
            }

            update(update: any) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            private buildDecorations(view: EditorView): DecorationSet {
                const decorations: Range<Decoration>[] = [];
                const doc = view.state.doc;
                const text = doc.toString();

                // 获取当前文件
                const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
                if (!activeView || !activeView.file) {
                    return Decoration.none;
                }

                // 检查文件是否应该被排除
                if (!this.highlightService.shouldProcessFile(activeView.file)) {
                    return Decoration.none;
                }

                // 使用 HighlightService 提取高亮
                const highlights = this.highlightService.extractHighlights(text);

                // 将高亮分组到段落中
                const paragraphMap = new Map<string, HiNote[]>();
                for (const highlight of highlights) {
                    if (highlight.position === undefined) continue;

                    // 转换为 HiNote 类型
                    const commentHighlight: HiNote = {
                        ...highlight,
                        id: highlight.id || `highlight-${Date.now()}-${highlight.position}`,
                        comments: highlight.comments || [],
                        position: highlight.position,
                        paragraphOffset: highlight.paragraphOffset || 0,
                        paragraphId: highlight.paragraphId || `p-${highlight.paragraphOffset || 0}`,
                        createdAt: highlight.createdAt || Date.now(),
                        updatedAt: highlight.updatedAt || Date.now(),
                        text: highlight.text
                    };

                    // 从 CommentStore 中获取最新的评论数据
                    const storedHighlight = this.commentStore.getHiNotes(commentHighlight);
                    if (storedHighlight && storedHighlight.length > 0) {
                        commentHighlight.comments = storedHighlight[0].comments || [];
                    }

                    // 使用 paragraphId 作为 Map 的键
                    const highlightsInParagraph = paragraphMap.get(commentHighlight.paragraphId) || [];
                    highlightsInParagraph.push(commentHighlight);
                    paragraphMap.set(commentHighlight.paragraphId, highlightsInParagraph);
                }

                // 为每个段落添加 CommentWidget
                for (const [paragraphId, paragraphHighlights] of paragraphMap.entries()) {
                    // 找到段落中最后一个高亮的位置
                    const lastHighlight = paragraphHighlights[paragraphHighlights.length - 1];
                    if (!lastHighlight) continue;

                    // 找到段落的末尾位置
                    let paragraphEndPos = lastHighlight.position;
                    const textAfterOffset = text.slice(paragraphEndPos);
                    const nextNewlineMatch = textAfterOffset.match(/\n\s*\n|\n\s*$|\n?$/);
                    
                    if (nextNewlineMatch) {
                        paragraphEndPos += nextNewlineMatch.index || textAfterOffset.length;
                    } else {
                        paragraphEndPos += textAfterOffset.length;
                    }

                    // 创建并添加 widget
                    const widget = this.createCommentWidget(lastHighlight, paragraphHighlights);
                    decorations.push(widget.range(paragraphEndPos));
                }

                // 为每个高亮添加背景色
                for (const highlight of highlights) {
                    if (highlight.position === undefined) continue;

                    // 转换为 HiNote 类型
                    const commentHighlight: HiNote = {
                        ...highlight,
                        id: highlight.id || `highlight-${Date.now()}-${highlight.position}`,
                        comments: highlight.comments || [],
                        position: highlight.position,
                        paragraphOffset: highlight.paragraphOffset || 0,
                        paragraphId: highlight.paragraphId || `p-${highlight.paragraphOffset || 0}`,
                        createdAt: highlight.createdAt || Date.now(),
                        updatedAt: highlight.updatedAt || Date.now(),
                        text: highlight.text
                    };

                    // 从 CommentStore 中获取最新的评论数据
                    const storedHighlight = this.commentStore.getHiNotes(commentHighlight);
                    if (storedHighlight && storedHighlight.length > 0) {
                        commentHighlight.comments = storedHighlight[0].comments || [];
                    }

                    // 获取原始的匹配文本，包括标签
                    const originalLength = highlight.originalLength ?? highlight.text.length + 4;
                    const originalText = text.slice(highlight.position, highlight.position + originalLength);
                    const isHtmlTag = originalText.startsWith('<');

                    if (isHtmlTag) {
                        // 对于 HTML 标签，我们需要找到内容的实际位置
                        const startTagMatch = /<[^>]+>/.exec(originalText);
                        const endTagMatch = /<\/[^>]+>/.exec(originalText);
                        
                        if (startTagMatch && endTagMatch) {
                            const contentStart = highlight.position + startTagMatch[0].length;
                            const contentEnd = highlight.position + originalLength - endTagMatch[0].length;

                            // 获取评论
                            const comments = this.commentStore.getHiNotes(commentHighlight);
                            const firstComment = comments.length > 0 ? comments[0].comments[0]?.content : '';

                            // 创建装饰器元素，使用标签中定义的背景色
                            const highlightMark = Decoration.mark({
                                class: 'cm-highlight',
                                attributes: {
                                    title: firstComment || '',
                                    'data-highlight-type': 'html',
                                    style: highlight.backgroundColor ? `background-color: ${highlight.backgroundColor}` : ''
                                }
                            });

                            decorations.push(highlightMark.range(contentStart, contentEnd));
                        }
                    } else {
                        // 对于 Markdown 语法的高亮，保持原有行为
                        const from = highlight.position;
                        const to = from + highlight.text.length + 4; // +4 for == ==

                        // 获取评论
                        const comments = this.commentStore.getHiNotes(commentHighlight);
                        const firstComment = comments.length > 0 ? comments[0].comments[0]?.content : '';

                        // TODO: 暂时注释掉 Markdown 语法高亮的装饰器代码，因为目前没有功能使用它
                        // // 创建装饰器元素
                        // const highlightMark = Decoration.mark({
                        //     class: 'cm-highlight',
                        //     attributes: {
                        //         title: firstComment || '',
                        //         'data-highlight-type': 'markdown'
                        //     }
                        // });

                        // decorations.push(highlightMark.range(from, to));
                    }
                }

                return Decoration.set(decorations.sort((a, b) => a.from - b.from));
            }

            private createCommentWidget(highlight: HiNote, paragraphHighlights: HiNote[]) {
                return Decoration.widget({
                    widget: new CommentWidget(
                        this.plugin,
                        highlight,
                        paragraphHighlights,
                        () => this.openCommentPanel(highlight)
                    ),
                    side: 1
                });
            }

            private openCommentPanel(highlight: HiNote) {
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
        document.querySelectorAll('.hi-note-widget').forEach(el => el.remove());
    }

    private updateTooltipContent(tooltip: Element, comments: CommentItem[]) {
        const list = tooltip.querySelector('.hi-note-tooltip-list');
        if (!list) return;

        // 清空现有内容
        list.empty();

        // 添加最新的评论
        comments.slice(0, 3).forEach(comment => {
            const item = list.createEl('div', { cls: 'hi-note-tooltip-item' });
            item.createEl('div', {
                cls: 'hi-note-tooltip-content',
                text: comment.content
            });
            item.createEl('div', {
                cls: 'hi-note-tooltip-time',
                text: new Date(comment.createdAt).toLocaleString()
            });
        });
    }
}
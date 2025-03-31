import { EditorView, ViewPlugin, DecorationSet, Decoration } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { Plugin, MarkdownView } from "obsidian";
import { CommentStore, HiNote, CommentItem } from "./CommentStore";
import { CommentWidget } from "./components/comment/CommentWidget";
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
                const highlightText = button.getAttribute('data-highlight-text');
                
                // 如果这个高亮文本是更新的文本
                if (highlightText === updatedText) {
                    // 获取当前高亮的评论
                    const highlight = fileComments.find(h => h.text === highlightText);
                    const allComments = highlight?.comments || [];

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

                // 为每个高亮文本添加 CommentWidget
                for (const highlight of highlights) {
                    if (highlight.position === undefined) continue;

                    // 转换为 HiNote 类型
                    const commentHighlight: HiNote = {
                        ...highlight,
                        id: highlight.id || `highlight-${Date.now()}-${highlight.position}`,
                        comments: highlight.comments || [],
                        position: highlight.position,
                        paragraphOffset: highlight.paragraphOffset || 0,
                        // 优先使用 blockId
                        blockId: highlight.blockId,
                        // 保留 paragraphId 以保持兼容性
                        paragraphId: highlight.paragraphId || `p-${highlight.paragraphOffset || 0}`,
                        createdAt: highlight.createdAt || Date.now(),
                        updatedAt: highlight.updatedAt || Date.now(),
                        text: highlight.text
                    };

                    // 从 CommentStore 中获取最新的评论数据
                    // 先尝试使用 blockId 获取
                    if (commentHighlight.blockId) {
                        const blockComments = this.commentStore.getCommentsByBlockId(activeView.file, commentHighlight.blockId);
                        if (blockComments && blockComments.length > 0) {
                            // 找到与当前高亮文本和位置匹配的特定高亮
                            const matchingHighlight = blockComments.find(h => 
                                h.text === commentHighlight.text && 
                                (typeof h.position !== 'number' || 
                                 typeof commentHighlight.position !== 'number' || 
                                 Math.abs(h.position - commentHighlight.position) < 10)
                            );
                            
                            if (matchingHighlight) {
                                commentHighlight.comments = matchingHighlight.comments || [];
                            } else {
                                commentHighlight.comments = blockComments[0].comments || [];
                            }
                        }
                    } else {
                        // 如果没有 blockId，则使用旧的方法
                        const storedHighlight = this.commentStore.getHiNotes(commentHighlight);
                        if (storedHighlight && storedHighlight.length > 0) {
                            // 找到与当前高亮文本和位置匹配的特定高亮
                            const matchingHighlight = storedHighlight.find(h => 
                                h.text === commentHighlight.text && 
                                (typeof h.position !== 'number' || 
                                 typeof commentHighlight.position !== 'number' || 
                                 Math.abs(h.position - commentHighlight.position) < 10)
                            );
                            
                            if (matchingHighlight) {
                                commentHighlight.comments = matchingHighlight.comments || [];
                            } else {
                                commentHighlight.comments = storedHighlight[0].comments || [];
                            }
                        }
                    }

                    // 计算高亮文本的结束位置
                    let highlightEndPos;
                    const originalLength = highlight.originalLength ?? highlight.text.length + 4;
                    const originalText = text.slice(highlight.position, highlight.position + originalLength);
                    const isHtmlTag = originalText.startsWith('<');
                    
                    if (isHtmlTag) {
                        // 对于 HTML 标签，找到内容的结束位置
                        const startTagMatch = /<[^>]+>/.exec(originalText);
                        const endTagMatch = /<\/[^>]+>/.exec(originalText);
                        
                        if (startTagMatch && endTagMatch) {
                            highlightEndPos = highlight.position + originalLength;
                        } else {
                            highlightEndPos = highlight.position + originalLength;
                        }
                    } else {
                        // 对于 Markdown 语法的高亮
                        highlightEndPos = highlight.position + highlight.text.length + 4; // +4 for == ==
                    }

                    // 检查文本是否在段落末尾
                    const isAtParagraphEnd = this.isAtParagraphEnd(text, highlightEndPos);

                    // 创建 widget
                    const widget = this.createCommentWidget(commentHighlight, [commentHighlight]);
                    
                    if (isAtParagraphEnd) {
                        // 如果在段落末尾，直接在高亮文本后面放置 Widget
                        decorations.push(widget.range(highlightEndPos));
                    } else {
                        // 如果不在段落末尾，直接在高亮文本后面放置 Widget
                        // 不添加额外的装饰器，避免"吞掉"高亮后的第一个字符
                        decorations.push(widget.range(highlightEndPos));
                    }
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
                        // 优先使用 blockId
                        blockId: highlight.blockId,
                        // 保留 paragraphId 以保持兼容性
                        paragraphId: highlight.paragraphId || `p-${highlight.paragraphOffset || 0}`,
                        createdAt: highlight.createdAt || Date.now(),
                        updatedAt: highlight.updatedAt || Date.now(),
                        text: highlight.text
                    };

                    // 从 CommentStore 中获取最新的评论数据
                    // 先尝试使用 blockId 获取
                    if (commentHighlight.blockId) {
                        const blockComments = this.commentStore.getCommentsByBlockId(activeView.file, commentHighlight.blockId);
                        if (blockComments && blockComments.length > 0) {
                            // 找到与当前高亮文本和位置匹配的特定高亮
                            const matchingHighlight = blockComments.find(h => 
                                h.text === commentHighlight.text && 
                                (typeof h.position !== 'number' || 
                                 typeof commentHighlight.position !== 'number' || 
                                 Math.abs(h.position - commentHighlight.position) < 10)
                            );
                            
                            if (matchingHighlight) {
                                commentHighlight.comments = matchingHighlight.comments || [];
                            } else {
                                commentHighlight.comments = blockComments[0].comments || [];
                            }
                        }
                    } else {
                        // 如果没有 blockId，则使用旧的方法
                        const storedHighlight = this.commentStore.getHiNotes(commentHighlight);
                        if (storedHighlight && storedHighlight.length > 0) {
                            // 找到与当前高亮文本和位置匹配的特定高亮
                            const matchingHighlight = storedHighlight.find(h => 
                                h.text === commentHighlight.text && 
                                (typeof h.position !== 'number' || 
                                 typeof commentHighlight.position !== 'number' || 
                                 Math.abs(h.position - commentHighlight.position) < 10)
                            );
                            
                            if (matchingHighlight) {
                                commentHighlight.comments = matchingHighlight.comments || [];
                            } else {
                                commentHighlight.comments = storedHighlight[0].comments || [];
                            }
                        }
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

            private createCommentWidget(highlight: HiNote, highlightItems: HiNote[]) {
                return Decoration.widget({
                    widget: new CommentWidget(
                        this.plugin,
                        highlight,
                        highlightItems,
                        () => this.openCommentPanel(highlight)
                    ),
                    side: 2, // 将小部件放在文本右侧
                    stopEvent: (event: Event) => {
                        // 阻止事件冒泡，防止意外切换视图
                        return true;
                    }
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
            
            /**
             * 检查指定位置是否在段落末尾
             * @param text 文本内容
             * @param position 要检查的位置
             * @returns 如果在段落末尾返回 true，否则返回 false
             */
            private isAtParagraphEnd(text: string, position: number): boolean {
                // 如果位置已经在文本末尾，返回 true
                if (position >= text.length) {
                    return true;
                }
                
                // 检查位置后的字符是否为换行符
                const nextChar = text.charAt(position);
                const nextTwoChars = text.substr(position, 2);
                
                // 检查常见的换行符: \n, \r, \r\n
                const isNewline = nextChar === '\n' || nextChar === '\r' || nextTwoChars === '\r\n';
                
                // 检查是否为段落结束标记（例如空行或文档结束）
                let isParagraphEnd = isNewline;
                
                // 如果是换行符，还需要检查下一行是否为空行
                if (isNewline) {
                    // 跳过当前换行符
                    let nextPos = position + (nextTwoChars === '\r\n' ? 2 : 1);
                    
                    // 检查下一行是否为空行或文档结束
                    if (nextPos >= text.length) {
                        isParagraphEnd = true;
                    } else {
                        // 检查下一个字符是否也是换行符（空行）
                        const nextLineChar = text.charAt(nextPos);
                        const nextLineTwoChars = text.substr(nextPos, 2);
                        isParagraphEnd = nextLineChar === '\n' || nextLineChar === '\r' || nextLineTwoChars === '\r\n';
                    }
                }
                
                return isParagraphEnd;
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
import { EditorView, ViewPlugin, DecorationSet, Decoration } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { Plugin, MarkdownView, TFile } from "obsidian";
import { CommentStore, HiNote, CommentItem } from "./CommentStore";
import { CommentWidget } from "./components/comment/CommentWidget";
import { HighlightService } from './services/HighlightService';
import { TextSimilarityService } from './services/TextSimilarityService';

export class HighlightDecorator {
    private plugin: Plugin;
    private commentStore: CommentStore;
    private highlightPlugin: any;
    private highlightService: HighlightService;
    private textSimilarityService: TextSimilarityService;

    constructor(plugin: Plugin, commentStore: CommentStore) {
        this.plugin = plugin;
        this.commentStore = commentStore;
        this.highlightService = new HighlightService(this.plugin.app);
        this.textSimilarityService = new TextSimilarityService(this.plugin.app);
    }


    
    /**
     * 使用多种策略匹配高亮和评论
     * @param file 当前文件
     * @param commentHighlight 高亮对象
     * @param storedHighlights 存储的高亮列表
     * @returns 匹配到的高亮对象，如果没有匹配到则返回 null
     */
    private findMatchingHighlight(file: TFile, commentHighlight: HiNote, storedHighlights: HiNote[]): HiNote | null {
        if (!storedHighlights || storedHighlights.length === 0) return null;
        
        // 1. 首先尝试精确匹配文本和位置
        let matchingHighlight = storedHighlights.find(h => 
            h.text === commentHighlight.text && 
            (typeof h.position !== 'number' || 
             typeof commentHighlight.position !== 'number' || 
             Math.abs(h.position - commentHighlight.position) < 10)
        ) || null;
        
        // 2. 如果精确匹配失败，尝试只匹配位置（允许文本有变化）
        if (!matchingHighlight && typeof commentHighlight.position === 'number') {
            matchingHighlight = storedHighlights.find(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - commentHighlight.position) < 30
            ) || null;
        }
        
        // 3. 如果位置匹配也失败，尝试使用模糊文本匹配
        if (!matchingHighlight) {
            // 对每个存储的高亮计算与当前高亮文本的相似度
            let bestMatch = null;
            let highestSimilarity = 0;
            
            for (const h of storedHighlights) {
                // 跳过没有评论的高亮
                if (!h.comments || h.comments.length === 0) continue;
                
                const similarity = this.textSimilarityService.calculateSimilarity(
                    h.text, 
                    commentHighlight.text
                );
                
                if (similarity > highestSimilarity && similarity > 0.6) { // 设置一个相似度阈值
                    highestSimilarity = similarity;
                    bestMatch = h;
                }
            }
            
            if (bestMatch) {
                matchingHighlight = bestMatch;
            }
        }
        
        return matchingHighlight;
    }

    private getActiveMarkdownView() {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    enable() {
        const plugin = this.plugin;
        const commentStore = this.commentStore;
        const highlightService = this.highlightService;
        const textSimilarityService = this.textSimilarityService;
        const findMatchingHighlightMethod = this.findMatchingHighlight.bind(this);

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
            textSimilarityService: TextSimilarityService;

            constructor(view: EditorView) {
                this.plugin = plugin;
                this.commentStore = commentStore;
                this.highlightService = new HighlightService(this.plugin.app);
                this.textSimilarityService = new TextSimilarityService(this.plugin.app);
                this.decorations = this.buildDecorations(view);
            }
            
            /**
             * 从高亮对象创建 HiNote 对象
             * @param highlight 高亮对象
             * @returns 创建的 HiNote 对象
             */
            private createHiNoteFromHighlight(highlight: any): HiNote {
                return {
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
            }

            /**
             * 精确匹配高亮
             * @param highlight 当前高亮
             * @param highlights 高亮列表
             * @returns 匹配的高亮或 null
             */
            private findExactMatchingHighlight(highlight: HiNote, highlights: HiNote[]): HiNote | null {
                return highlights.find(h => 
                    h.text === highlight.text && 
                    (typeof h.position !== 'number' || 
                     typeof highlight.position !== 'number' || 
                     Math.abs(h.position - highlight.position) < 10)
                ) || null;
            }

            /**
             * 处理文本变化
             * @param file 当前文件
             * @param bestMatch 最佳匹配的高亮
             * @param currentHighlight 当前高亮
             */
            private handleTextChanges(file: TFile, bestMatch: HiNote, currentHighlight: HiNote) {
                if (bestMatch.text !== currentHighlight.text) {
                    (plugin as any).highlightMatchingService.recoverHighlight(
                        file,
                        bestMatch,
                        currentHighlight.text
                    ).then((recoveredHighlight: HiNote | null) => {
                        if (recoveredHighlight) {
                            (plugin as any).eventManager.emitHighlightUpdate(
                                file.path,
                                bestMatch.text,
                                currentHighlight.text
                            );
                        }
                    });
                }
            }

            /**
             * 获取高亮的评论
             * @param file 当前文件
             * @param highlight 高亮对象
             * @param fullMatch 是否需要完整匹配（包括处理文本变化）
             * @returns 评论列表
             */
            private getCommentsForHighlight(file: TFile, highlight: HiNote, fullMatch: boolean = true): CommentItem[] {
                let comments: CommentItem[] = [];
                
                if (highlight.blockId) {
                    const blockComments = commentStore.getCommentsByBlockId(file, highlight.blockId);
                    if (blockComments && blockComments.length > 0) {
                        const matchingHighlight = this.findExactMatchingHighlight(highlight, blockComments);
                        if (matchingHighlight) {
                            comments = matchingHighlight.comments || [];
                        } else if (fullMatch) {
                            const bestMatch = findMatchingHighlightMethod(file, highlight, blockComments);
                            if (bestMatch) {
                                this.handleTextChanges(file, bestMatch, highlight);
                                comments = bestMatch.comments || [];
                            } else {
                                comments = blockComments[0].comments || [];
                            }
                        } else {
                            comments = blockComments[0].comments || [];
                        }
                    }
                } else {
                    const storedHighlight = commentStore.getHiNotes(highlight);
                    if (storedHighlight && storedHighlight.length > 0) {
                        const matchingHighlight = this.findExactMatchingHighlight(highlight, storedHighlight);
                        if (matchingHighlight) {
                            comments = matchingHighlight.comments || [];
                        } else if (fullMatch) {
                            const bestMatch = findMatchingHighlightMethod(file, highlight, storedHighlight);
                            if (bestMatch) {
                                this.handleTextChanges(file, bestMatch, highlight);
                                comments = bestMatch.comments || [];
                            } else {
                                comments = storedHighlight[0].comments || [];
                            }
                        } else {
                            comments = storedHighlight[0].comments || [];
                        }
                    }
                }
                
                return comments;
            }

            /**
             * 计算高亮文本的结束位置和是否为HTML标签
             * @param text 文档文本
             * @param highlight 高亮对象
             * @returns 包含结束位置和是否为HTML标签的对象
             */
            private calculateHighlightPosition(text: string, highlight: any): { highlightEndPos: number, isHtmlTag: boolean, originalText: string, originalLength: number } {
                const originalLength = highlight.originalLength ?? highlight.text.length + 4;
                const originalText = text.slice(highlight.position, highlight.position + originalLength);
                const isHtmlTag = originalText.startsWith('<');
                let highlightEndPos;
                
                if (isHtmlTag) {
                    // 对于 HTML 标签，找到内容的结束位置
                    const startTagMatch = /<[^>]+>/.exec(originalText);
                    const endTagMatch = /<\/[^>]+>/.exec(originalText);
                    
                    highlightEndPos = highlight.position + originalLength;
                } else {
                    // 对于 Markdown 语法的高亮
                    highlightEndPos = highlight.position + highlight.text.length + 4; // +4 for == ==
                }

                return { highlightEndPos, isHtmlTag, originalText, originalLength };
            }

            /**
             * 使用多种策略匹配高亮和评论
             * @param file 当前文件
             * @param commentHighlight 高亮对象
             * @param storedHighlights 存储的高亮列表
             * @returns 匹配到的高亮对象，如果没有匹配到则返回 null
             */
            private findMatchingHighlight(file: TFile, commentHighlight: HiNote, storedHighlights: HiNote[]): HiNote | null {
                if (!storedHighlights || storedHighlights.length === 0) return null;
                
                // 1. 首先尝试精确匹配文本和位置
                let matchingHighlight = storedHighlights.find(h => 
                    h.text === commentHighlight.text && 
                    (typeof h.position !== 'number' || 
                     typeof commentHighlight.position !== 'number' || 
                     Math.abs(h.position - commentHighlight.position) < 10)
                ) || null;
                
                // 2. 如果精确匹配失败，尝试只匹配位置（允许文本有变化）
                if (!matchingHighlight && typeof commentHighlight.position === 'number') {
                    matchingHighlight = storedHighlights.find(h => 
                        typeof h.position === 'number' && 
                        Math.abs(h.position - commentHighlight.position) < 30
                    ) || null;
                }
                
                // 3. 如果位置匹配也失败，尝试使用模糊文本匹配
                if (!matchingHighlight) {
                    // 对每个存储的高亮计算与当前高亮文本的相似度
                    let bestMatch = null;
                    let highestSimilarity = 0;
                    
                    for (const h of storedHighlights) {
                        // 跳过没有评论的高亮
                        if (!h.comments || h.comments.length === 0) continue;
                        
                        const similarity = this.textSimilarityService.calculateSimilarity(
                            h.text, 
                            commentHighlight.text
                        );
                        
                        if (similarity > highestSimilarity && similarity > 0.6) { // 设置一个相似度阈值
                            highestSimilarity = similarity;
                            bestMatch = h;
                        }
                    }
                    
                    if (bestMatch) {
                        matchingHighlight = bestMatch;
                    }
                }
                
                return matchingHighlight;
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
                const highlights = this.highlightService.extractHighlights(text, activeView.file);
            
                // 处理每个高亮
                for (const highlight of highlights) {
                    if (highlight.position === undefined) continue;
            
                    // 转换为 HiNote 类型
                    const commentHighlight = this.createHiNoteFromHighlight(highlight);
            
                    // 获取评论数据
                    if (activeView.file) {
                        const comments = this.getCommentsForHighlight(activeView.file, commentHighlight, true);
                        commentHighlight.comments = comments;
                    }
            
                    // 计算高亮文本的位置信息
                    const { highlightEndPos, isHtmlTag, originalText, originalLength } = this.calculateHighlightPosition(text, highlight);
            
                    // 检查文本是否在段落末尾
                    const isAtParagraphEnd = this.isAtParagraphEnd(text, highlightEndPos);
            
                    // 创建并添加 CommentWidget
                    const widget = this.createCommentWidget(commentHighlight, [commentHighlight]);
                    decorations.push(widget.range(highlightEndPos));
            
                    // 添加背景色高亮
                    if (isHtmlTag) {
                        // 对于 HTML 标签，找到内容的实际位置
                        const startTagMatch = /<[^>]+>/.exec(originalText);
                        const endTagMatch = /<\/[^>]+>/.exec(originalText);
                        
                        if (startTagMatch && endTagMatch) {
                            const contentStart = highlight.position + startTagMatch[0].length;
                            const contentEnd = highlight.position + originalLength - endTagMatch[0].length;
            
                            // 获取评论 - 使用简化版获取评论函数，不需要处理文本变化
                            const commentsForTooltip = activeView.file ? 
                                this.getCommentsForHighlight(activeView.file, commentHighlight, false) : [];
                            const firstComment = commentsForTooltip.length > 0 ? commentsForTooltip[0]?.content : '';
            
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
            
                        // 获取评论 - 使用简化版获取评论函数，不需要处理文本变化
                        const commentsForTooltip = activeView.file ? 
                            this.getCommentsForHighlight(activeView.file, commentHighlight, false) : [];
                        const firstComment = commentsForTooltip.length > 0 ? commentsForTooltip[0]?.content : '';
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
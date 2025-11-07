import { EditorView, ViewPlugin, DecorationSet, Decoration } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { Plugin, MarkdownView, TFile } from "obsidian";
import { CommentStore, HiNote, CommentItem } from "./CommentStore";
import { CommentWidget } from "./components/comment/CommentWidget";
import { HighlightService } from './services/HighlightService';
import { HighlightMatcher } from './utils/HighlightMatcher';

export class HighlightDecorator {
    private plugin: Plugin;
    private commentStore: CommentStore;
    private highlightPlugin: any;
    private highlightService: HighlightService;
    private currentViewPlugin: any; // 保存当前的 ViewPlugin 实例

    constructor(plugin: Plugin, commentStore: CommentStore) {
        this.plugin = plugin;
        this.commentStore = commentStore;
        // 使用插件提供的共享服务实例
        this.highlightService = (plugin as any).highlightService;
    }

    /**
     * 强制刷新装饰器
     * 当评论数据发生变化时调用此方法来更新 CommentWidget 的显示
     */
    public refreshDecorations() {
        const view = this.getActiveMarkdownView();
        if (!view?.editor) return;
        
        // 获取 CodeMirror 编辑器视图
        const editorView = (view.editor as any).cm;
        if (!editorView) return;
        
        // 通过触发一个空的文档更新来强制重新构建装饰器
        // 这会导致 ViewPlugin 的 update 方法被调用，进而重新构建装饰器
        editorView.dispatch({
            changes: [],
            effects: []
        });
    }


    

    private getActiveMarkdownView() {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    enable() {
        const plugin = this.plugin;
        const commentStore = this.commentStore;
        const highlightService = this.highlightService;

        // 监听评论相关事件，当评论增删时刷新装饰器
        this.plugin.registerEvent(
            (this.plugin as any).eventManager.on('comment:update', () => {
                this.refreshDecorations();
            })
        );
        
        this.plugin.registerEvent(
            (this.plugin as any).eventManager.on('comment:delete', () => {
                this.refreshDecorations();
            })
        );
        
        this.plugin.registerEvent(
            (this.plugin as any).eventManager.on('highlight:update', () => {
                this.refreshDecorations();
            })
        );
        
        this.plugin.registerEvent(
            (this.plugin as any).eventManager.on('highlight:delete', () => {
                this.refreshDecorations();
            })
        );

        const highlightPlugin = ViewPlugin.fromClass(class {
            decorations: DecorationSet;
            plugin: Plugin;
            commentStore: CommentStore;
            highlightService: HighlightService;

            constructor(view: EditorView) {
                this.plugin = plugin;
                this.commentStore = commentStore;
                // 使用外部传入的共享实例，避免重复创建
                this.highlightService = highlightService;
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
                        // 使用 HighlightMatcher 进行匹配（支持精确匹配和位置匹配）
                        const bestMatch = HighlightMatcher.findMatch(highlight, blockComments);
                        if (bestMatch) {
                            comments = bestMatch.comments || [];
                            // 如果文本发生变化，更新存储
                            if (fullMatch && bestMatch.text !== highlight.text) {
                                this.handleTextChanges(file, bestMatch, highlight);
                            }
                        }
                    }
                } else {
                    // getHiNotes 已经包含了精确匹配和位置匹配逻辑
                    const storedHighlights = commentStore.getHiNotes(highlight);
                    if (storedHighlights && storedHighlights.length > 0) {
                        // 取第一个匹配的高亮（getHiNotes 已经做了匹配）
                        const matched = storedHighlights[0];
                        comments = matched.comments || [];
                        // 如果文本发生变化，更新存储
                        if (fullMatch && matched.text !== highlight.text) {
                            this.handleTextChanges(file, matched, highlight);
                        }
                    }
                }
                
                return comments;
            }



            update(update: any) {
                // 当文档变化、视口变化或接收到刷新信号时重新构建装饰器
                if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
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
            
                    // 计算高亮结束位置
                    const highlightEndPos = highlight.position + (highlight.originalLength ?? highlight.text.length + 4);

                    // 只有在设置允许显示widget时才创建CommentWidget
                    if ((this.plugin as any).settings.showCommentWidget !== false) {
                        const widget = this.createCommentWidget(commentHighlight, [commentHighlight]);
                        decorations.push(widget.range(highlightEndPos));
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
                        // 只阻止特定事件，允许点击事件通过
                        // 阻止 mousedown 和 mouseup 以防止文本选择干扰
                        if (event.type === 'mousedown' || event.type === 'mouseup') {
                            return true;
                        }
                        return false;
                    }
                });
            }

            private async openCommentPanel(highlight: HiNote) {
                const workspace = this.plugin.app.workspace;
                const existing = workspace.getLeavesOfType("comment-view");

                if (existing.length) {
                    workspace.revealLeaf(existing[0]);
                    // 侧边栏已存在，等待一小段时间确保视图激活
                    await new Promise(resolve => setTimeout(resolve, 50));
                } else {
                    const leaf = workspace.getRightLeaf(false);
                    if (leaf) {
                        await leaf.setViewState({
                            type: "comment-view",
                            active: true
                        });
                        // 等待视图完全渲染
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
                
                // 触发评论输入事件
                const event = new CustomEvent("open-comment-input", {
                    detail: {
                        highlightId: highlight.id,
                        text: highlight.text
                    }
                });
                window.dispatchEvent(event);
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
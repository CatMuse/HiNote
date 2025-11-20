import { TFile, App, Notice } from 'obsidian';
import { HighlightInfo, CommentItem } from '../../types';
import { HiNote, CommentStore } from '../../CommentStore';
import { IdGenerator } from '../../utils/IdGenerator';
import CommentPlugin from '../../../main';
import { t } from '../../i18n';

/**
 * 评论操作管理器
 * 负责评论的添加、更新、删除等操作
 */
export class CommentOperationManager {
    private app: App;
    private plugin: CommentPlugin;
    private commentStore: CommentStore;
    
    // 回调函数
    private onRefreshView: (() => Promise<void>) | null = null;
    private onHighlightsUpdate: ((highlights: HighlightInfo[]) => void) | null = null;
    private onCardUpdate: ((highlight: HighlightInfo) => void) | null = null;
    
    // 当前状态
    private currentFile: TFile | null = null;
    private highlights: HighlightInfo[] = [];
    
    constructor(
        app: App,
        plugin: CommentPlugin,
        commentStore: CommentStore
    ) {
        this.app = app;
        this.plugin = plugin;
        this.commentStore = commentStore;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onRefreshView?: () => Promise<void>;
        onHighlightsUpdate?: (highlights: HighlightInfo[]) => void;
        onCardUpdate?: (highlight: HighlightInfo) => void;
    }) {
        if (callbacks.onRefreshView) {
            this.onRefreshView = callbacks.onRefreshView;
        }
        if (callbacks.onHighlightsUpdate) {
            this.onHighlightsUpdate = callbacks.onHighlightsUpdate;
        }
        if (callbacks.onCardUpdate) {
            this.onCardUpdate = callbacks.onCardUpdate;
        }
    }
    
    /**
     * 更新状态
     */
    updateState(state: {
        currentFile?: TFile | null;
        highlights?: HighlightInfo[];
    }) {
        if (state.currentFile !== undefined) {
            this.currentFile = state.currentFile;
        }
        if (state.highlights !== undefined) {
            this.highlights = state.highlights;
        }
    }
    
    /**
     * 添加评论
     */
    async addComment(highlight: HighlightInfo, content: string): Promise<void> {
        const file = await this.getFileForHighlight(highlight);
        if (!file) {
            new Notice(t("No corresponding file found."));
            return;
        }

        // 确保高亮有 ID
        if (!highlight.id) {
            highlight.id = IdGenerator.generateHighlightId(
                this.currentFile?.path || '', 
                highlight.position || 0, 
                highlight.text
            );
        }

        if (!highlight.comments) {
            highlight.comments = [];
        }

        const newComment: CommentItem = {
            id: IdGenerator.generateCommentId(),
            content,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        highlight.comments.push(newComment);
        highlight.updatedAt = Date.now();

        await this.commentStore.addComment(file, highlight as HiNote);

        // 触发更新评论按钮
        this.dispatchCommentUpdateEvent(highlight);

        // 只更新单个卡片，而不是刷新整个视图
        if (this.onCardUpdate) {
            this.onCardUpdate(highlight);
        } else if (this.onRefreshView) {
            // 降级方案：如果没有 onCardUpdate，则刷新整个视图
            await this.onRefreshView();
        }
    }
    
    /**
     * 更新评论
     */
    async updateComment(highlight: HighlightInfo, commentId: string, content: string): Promise<void> {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        const comment = highlight.comments.find(c => c.id === commentId);
        if (comment) {
            const oldContent = comment.content;
            
            comment.content = content;
            comment.updatedAt = Date.now();
            highlight.updatedAt = Date.now();
            await this.commentStore.addComment(file, highlight as HiNote);

            // 触发更新评论按钮
            this.dispatchCommentUpdateEvent(highlight);
            
            // 通过 EventManager 触发批注更新事件，用于闪卡同步
            if (highlight.id) {
                this.plugin.eventManager.emitCommentUpdate(file.path, oldContent, content, highlight.id);
            }

            // 只更新单个卡片，而不是刷新整个视图
            if (this.onCardUpdate) {
                this.onCardUpdate(highlight);
            } else if (this.onRefreshView) {
                // 降级方案：如果没有 onCardUpdate，则刷新整个视图
                await this.onRefreshView();
            }
        }
    }
    
    /**
     * 删除评论
     */
    async deleteComment(highlight: HighlightInfo, commentId: string): Promise<void> {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        // 过滤掉要删除的批注
        highlight.comments = highlight.comments.filter(c => c.id !== commentId);
        highlight.updatedAt = Date.now();

        // 检查高亮是否没有评论了
        if (highlight.comments.length === 0) {
            // 检查高亮是否关联了闪卡
            const hasFlashcard = highlight.id ? this.checkHasFlashcard(highlight.id) : false;
            
            // 如果是虚拟高亮或者没有关联闪卡，则删除整个高亮
            if (highlight.isVirtual || !hasFlashcard) {
                // 从 CommentStore 中删除高亮
                await this.commentStore.removeComment(file, highlight as HiNote);
                
                // 从当前高亮列表中移除
                this.highlights = this.highlights.filter(h => h.id !== highlight.id);
                
                // 通知外部更新高亮列表
                if (this.onHighlightsUpdate) {
                    this.onHighlightsUpdate(this.highlights);
                }
            } else {
                // 有关联闪卡，只更新评论
                await this.commentStore.addComment(file, highlight as HiNote);
            }
        } else {
            // 还有其他评论，只更新评论
            await this.commentStore.addComment(file, highlight as HiNote);
        }

        // 触发更新评论按钮
        this.dispatchCommentUpdateEvent(highlight);

        // 只更新单个卡片，而不是刷新整个视图
        if (this.onCardUpdate) {
            this.onCardUpdate(highlight);
        } else if (this.onRefreshView) {
            // 降级方案：如果没有 onCardUpdate，则刷新整个视图
            await this.onRefreshView();
        }
    }
    
    /**
     * 删除虚拟高亮（当取消添加评论时）
     */
    async deleteVirtualHighlight(highlight: HighlightInfo): Promise<void> {
        if (!highlight.isVirtual || (highlight.comments && highlight.comments.length > 0)) {
            return;
        }
        
        const file = await this.getFileForHighlight(highlight);
        if (file) {
            await this.commentStore.removeComment(file, highlight as HiNote);
            this.highlights = this.highlights.filter(h => h.id !== highlight.id);
            
            // 通知外部更新高亮列表
            if (this.onHighlightsUpdate) {
                this.onHighlightsUpdate(this.highlights);
            }
            
            // 刷新视图
            if (this.onRefreshView) {
                await this.onRefreshView();
            }
        }
    }
    
    /**
     * 获取高亮对应的文件
     */
    private async getFileForHighlight(highlight: HighlightInfo): Promise<TFile | null> {
        // 如果有当前文件，使用当前文件
        if (this.currentFile) {
            return this.currentFile;
        }
        // 如果是全部高亮视图，使用 highlight.filePath 获取文件
        if (highlight.filePath) {
            const file = this.app.vault.getAbstractFileByPath(highlight.filePath);
            if (file instanceof TFile) {
                return file;
            }
        }
        // 如果通过 filePath 找不到，尝试通过 fileName
        if (highlight.fileName) {
            const files = this.app.vault.getFiles();
            const file = files.find(f => f.basename === highlight.fileName || f.name === highlight.fileName);
            if (file) {
                return file;
            }
        }
        return null;
    }
    
    /**
     * 检查高亮是否已经创建了闪卡
     */
    private checkHasFlashcard(highlightId: string): boolean {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager || !highlightId) {
            return false;
        }
        
        const cards = fsrsManager.findCardsBySourceId(highlightId, 'highlight');
        return cards && cards.length > 0;
    }
    
    /**
     * 触发评论更新事件
     */
    private dispatchCommentUpdateEvent(highlight: HighlightInfo) {
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));
    }
}

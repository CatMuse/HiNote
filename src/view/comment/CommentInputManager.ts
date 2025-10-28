import { HighlightInfo, CommentItem } from '../../types';
import { CommentInput } from '../../components/comment/CommentInput';
import CommentPlugin from '../../../main';

/**
 * 评论输入管理器
 * 负责管理评论输入框的显示和交互
 */
export class CommentInputManager {
    private plugin: CommentPlugin;
    
    // 回调函数
    private onCommentSave: ((highlight: HighlightInfo, content: string, existingComment?: CommentItem) => Promise<void>) | null = null;
    private onCommentDelete: ((highlight: HighlightInfo, commentId: string) => Promise<void>) | null = null;
    private onCommentCancel: ((highlight: HighlightInfo) => Promise<void>) | null = null;
    private onViewUpdate: (() => Promise<void>) | null = null;
    
    // 当前编辑状态
    private currentEditingHighlightId: string | undefined;
    
    constructor(plugin: CommentPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onCommentSave?: (highlight: HighlightInfo, content: string, existingComment?: CommentItem) => Promise<void>;
        onCommentDelete?: (highlight: HighlightInfo, commentId: string) => Promise<void>;
        onCommentCancel?: (highlight: HighlightInfo) => Promise<void>;
        onViewUpdate?: () => Promise<void>;
    }) {
        if (callbacks.onCommentSave) {
            this.onCommentSave = callbacks.onCommentSave;
        }
        if (callbacks.onCommentDelete) {
            this.onCommentDelete = callbacks.onCommentDelete;
        }
        if (callbacks.onCommentCancel) {
            this.onCommentCancel = callbacks.onCommentCancel;
        }
        if (callbacks.onViewUpdate) {
            this.onViewUpdate = callbacks.onViewUpdate;
        }
    }
    
    /**
     * 显示评论输入框
     */
    showCommentInput(
        card: HTMLElement, 
        highlight: HighlightInfo, 
        existingComment?: CommentItem
    ): void {
        this.currentEditingHighlightId = highlight.id;
        
        new CommentInput(card, highlight, existingComment, this.plugin, {
            onSave: async (content: string) => {
                if (this.onCommentSave) {
                    await this.onCommentSave(highlight, content, existingComment);
                }
                if (this.onViewUpdate) {
                    await this.onViewUpdate();
                }
            },
            onDelete: existingComment ? async () => {
                if (this.onCommentDelete) {
                    await this.onCommentDelete(highlight, existingComment.id);
                }
            } : undefined,
            onCancel: async () => {
                if (this.onCommentCancel) {
                    await this.onCommentCancel(highlight);
                }
            }
        }).show();
    }
    
    /**
     * 获取当前编辑的高亮 ID
     */
    getCurrentEditingHighlightId(): string | undefined {
        return this.currentEditingHighlightId;
    }
    
    /**
     * 清除当前编辑状态
     */
    clearEditingState(): void {
        this.currentEditingHighlightId = undefined;
    }
}

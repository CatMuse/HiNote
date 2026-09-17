import { HighlightInfo, CommentItem } from '../../../types/highlight';
import { CommentInput } from '../../../components/comment';
import { defaultHighlightCardRegistry } from '../../../components/highlight';
import CommentPlugin from '../../../../main';

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
    
    // 当前编辑状态
    private currentEditingHighlightId: string | undefined;
    private inputs = new Map<string, CommentInput>();
    
    constructor(plugin: CommentPlugin, private drafts: Map<string, string> = new Map()) {
        this.plugin = plugin;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onCommentSave?: (highlight: HighlightInfo, content: string, existingComment?: CommentItem) => Promise<void>;
        onCommentDelete?: (highlight: HighlightInfo, commentId: string) => Promise<void>;
        onCommentCancel?: (highlight: HighlightInfo) => Promise<void>;
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
    }
    
    /**
     * 显示评论输入框
     */
    showCommentInput(
        card: HTMLElement, 
        highlight: HighlightInfo, 
        existingComment?: CommentItem
    ): void {
        this.suspendAll();
        this.currentEditingHighlightId = highlight.id;
        const key = JSON.stringify([highlight.filePath, highlight.recordId || highlight.id, existingComment?.id || 'new']);
        
        const input = new CommentInput(card, highlight, existingComment, this.plugin, {
            initialContent: this.drafts.get(key),
            onSave: async (content: string) => {
                const draftAtSave = this.drafts.get(key);
                if (this.onCommentSave) {
                    await this.onCommentSave(highlight, content, existingComment);
                    if (this.drafts.get(key) === draftAtSave || this.drafts.get(key)?.trim() === content.trim()) this.drafts.delete(key);
                }
            },
            onDelete: existingComment ? async () => {
                if (this.onCommentDelete) {
                    await this.onCommentDelete(highlight, existingComment.id);
                    this.drafts.delete(key);
                }
            } : undefined,
            onCancel: () => {
                this.drafts.delete(key);
                if (this.onCommentCancel) {
                    void this.onCommentCancel(highlight);
                }
            },
            onShown: () => {
                defaultHighlightCardRegistry.findByElement(card)?.handleInputShown();
            },
            onClosed: () => {
                if (this.inputs.get(key) === input) this.inputs.delete(key);
                defaultHighlightCardRegistry.findByElement(card)?.handleInputClosed();
            }
        });
        this.inputs.set(key, input);
        input.show();
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
    suspendAll(): void {
        for (const [key, input] of [...this.inputs]) {
            const draft = input.getDraft();
            if (draft) this.drafts.set(key, draft); else this.drafts.delete(key);
            input.suspend();
        }
        this.inputs.clear();
    }

    clearEditingState(): void {
        this.suspendAll();
        this.currentEditingHighlightId = undefined;
    }
}

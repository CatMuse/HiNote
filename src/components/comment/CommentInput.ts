import { CommentItem, HighlightInfo } from "../../types/highlight";
import type CommentPlugin from "../../../main";
import { InlineAICommentHandler } from "./InlineAICommentHandler";
import { CommentInputSaveController } from "./CommentInputSaveController";
import {
    CommentInputEditContext,
    renderCreateCommentInput,
    renderEditCommentInput
} from "./CommentInputView";
import {
    removeCommentInputElements,
    restoreOrRemoveCommentInput
} from "./CommentInputCleanup";
import {
    autoResizeCommentTextarea,
    setupCommentInputKeyboard
} from "./CommentInputKeyboard";

export class CommentInput {
    private textarea: HTMLTextAreaElement;
    private actionHint: HTMLElement;
    private cancelEdit: () => void = () => {};
    private inlineAI: InlineAICommentHandler;
    private saveController: CommentInputSaveController;
    private boundHandleOutsideClick: (e: MouseEvent) => void;
    private commentEl: Element | null = null; // 保存批注元素引用，用于移除 editing 类
    private isOpen = false;

    constructor(
        private card: HTMLElement,
        private highlight: HighlightInfo,
        private existingComment: CommentItem | undefined,
        private plugin: CommentPlugin,
        private options: {
            onSave: (content: string) => Promise<void>;
            onDelete?: () => Promise<void>;
            onCancel: () => void;
            onShown?: () => void;
            onClosed?: () => void;
        }
    ) {
        this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
        this.inlineAI = new InlineAICommentHandler({
            plugin: this.plugin,
            highlight: this.highlight,
            existingComment: this.existingComment,
            getTextarea: () => this.textarea,
            getActionHint: () => this.actionHint,
            resizeTextarea: () => this.autoResizeTextarea()
        });
        this.saveController = new CommentInputSaveController({
            getTextarea: () => this.textarea,
            onSave: this.options.onSave,
            onSaved: () => this.destroy()
        });
    }

    public show() {
        const didShow = this.existingComment
            ? this.showEditMode()
            : this.showCreateMode();

        if (didShow) {
            this.isOpen = true;
            activeDocument.addEventListener('click', this.boundHandleOutsideClick);
            this.options.onShown?.();
        }
    }

    private showEditMode(): boolean {
        const renderedInput = renderEditCommentInput(this.card, this.existingComment!, {
            onInput: () => this.autoResizeTextarea(),
            onSave: async () => await this.handleSave(),
            onDelete: this.options.onDelete ? async () => await this.handleDelete() : undefined
        });

        if (!renderedInput) return false;

        this.textarea = renderedInput.textarea;
        this.actionHint = renderedInput.actionHint;
        this.commentEl = renderedInput.commentEl || null;
        this.setupKeyboardEvents(renderedInput.editContext);

        // 延迟一下再聚焦，确保DOM已经完全渲染
        window.setTimeout(() => {
            this.textarea.focus();
            this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
        }, 50);

        return true;
    }

    private showCreateMode(): boolean {
        const renderedInput = renderCreateCommentInput(this.card, {
            onInput: () => this.autoResizeTextarea(),
            onSave: async () => await this.handleSave()
        });

        this.textarea = renderedInput.textarea;
        this.actionHint = renderedInput.actionHint;
        this.setupKeyboardEvents(renderedInput.editContext);
        
        // 延迟一下再聚焦，确保DOM已经完全渲染
        window.setTimeout(() => {
            this.textarea.focus();
        }, 50);

        return true;
    }

    private setupKeyboardEvents(editContext?: CommentInputEditContext | null) {
        this.cancelEdit = () => {
            this.cancel(editContext);
        };

        setupCommentInputKeyboard(this.textarea, {
            onInlineAI: async () => await this.inlineAI.generate(),
            onSave: async () => {
                await this.handleSave();
            }
        });
    }

    // 自动调整文本框高度以适应内容
    private autoResizeTextarea() {
        autoResizeCommentTextarea(this.textarea);
    }


    private handleOutsideClick(e: MouseEvent) {
        if (!this.textarea || this.saveController.isProcessing()) return;
        
        const clickedElement = e.target as HTMLElement;
        const isOutside = !this.textarea.contains(clickedElement) && 
                         !clickedElement.closest('.hi-note-actions-hint');
        
        if (isOutside) {
            // 立即阻止事件传播，避免触发卡片点击
            e.preventDefault();
            e.stopPropagation();
            
            const content = this.textarea.value.trim();
            
            if (content) {
                // 有内容时保存
                void this.saveController.saveCurrentContent();
            } else {
                // 没有内容时取消
                this.cancel();
            }
        }
    }

    /**
     * 取消输入（不保存）
     * @param editContext 编辑模式的上下文信息，用于恢复原始内容
     */
    private cancel(editContext?: { contentEl?: HTMLElement, footer?: Element } | null) {
        // 立即通知 HighlightCard 输入框已关闭，确保状态同步
        this.notifyClosed();
        restoreOrRemoveCommentInput(this.getElements(), this.existingComment, editContext);
        
        // 清理事件监听器
        activeDocument.removeEventListener('click', this.boundHandleOutsideClick);
        this.saveController.reset();
        
        // 调用取消回调
        this.options.onCancel();
    }
    
    /**
     * 销毁输入框（保存后调用）
     */
    public destroy() {
        // 立即通知 HighlightCard 输入框已关闭
        this.notifyClosed();
        
        // 清理事件监听器
        activeDocument.removeEventListener('click', this.boundHandleOutsideClick);
        this.saveController.reset();
        
        removeCommentInputElements(this.getElements());
        this.commentEl = null;
    }
    
    /**
     * 安全销毁输入框（用于删除评论后调用）
     * 检查 DOM 元素是否仍然存在，避免操作已删除的元素
     */
    public destroySafe() {
        try {
            // 立即通知 HighlightCard 输入框已关闭
            this.notifyClosed();
            
            // 清理事件监听器
            activeDocument.removeEventListener('click', this.boundHandleOutsideClick);
            this.saveController.reset();
            
            removeCommentInputElements(this.getElements(), true);
            this.commentEl = null;
        } catch (error) {
            // 捕获任何错误，避免应用冻结
            console.error('[CommentInput] 安全销毁时出错:', error);
        }
    }
    
    /**
     * 处理保存逻辑
     */
    private async handleSave() {
        const saved = await this.saveController.saveCurrentContent();

        // Empty comments are not persisted. Close the empty editor and restore
        // the existing comment (or remove a new-comment input) instead of
        // leaving an empty textarea that looks like a saved comment.
        if (!saved && !this.textarea.value.trim()) {
            this.cancelEdit();
        }
    }

    private async handleDelete(): Promise<void> {
        if (!this.saveController.startProcessing()) return;

        activeDocument.removeEventListener('click', this.boundHandleOutsideClick);

        try {
            await this.options.onDelete?.();

            window.setTimeout(() => {
                this.destroySafe();
            }, 0);
        } catch (error) {
            console.error('删除评论失败:', error);
            activeDocument.addEventListener('click', this.boundHandleOutsideClick);
            this.saveController.reset();
        }
    }

    private notifyClosed(): void {
        if (!this.isOpen) {
            return;
        }

        this.isOpen = false;
        this.options.onClosed?.();
    }

    private getElements() {
        return {
            card: this.card,
            textarea: this.textarea,
            actionHint: this.actionHint,
            commentEl: this.commentEl
        };
    }
}

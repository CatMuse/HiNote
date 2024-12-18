import { CommentItem, HighlightInfo } from "../../types";

export class CommentInput {
    private textarea: HTMLTextAreaElement;
    private actionHint: HTMLElement;
    private cancelEdit: () => void = () => {};
    private isProcessing = false;
    private boundHandleOutsideClick: (e: MouseEvent) => void;

    constructor(
        private card: HTMLElement,
        private highlight: HighlightInfo,
        private existingComment: CommentItem | undefined,
        private options: {
            onSave: (content: string) => Promise<void>;
            onDelete?: () => Promise<void>;
            onCancel: () => void;
        }
    ) {
        this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
        document.addEventListener('click', this.boundHandleOutsideClick);
    }

    public show() {
        if (this.existingComment) {
            this.showEditMode();
        } else {
            this.showCreateMode();
        }
    }

    private showEditMode() {
        const commentEl = this.card.querySelector(`[data-comment-id="${this.existingComment!.id}"]`);
        if (!commentEl) return;

        const contentEl = commentEl.querySelector('.highlight-comment-content') as HTMLElement;
        if (!contentEl) return;

        const originalContent = contentEl.textContent || '';

        // 创建编辑框
        this.textarea = document.createElement('textarea');
        this.textarea.value = originalContent;
        this.textarea.className = 'highlight-comment-input';
        this.textarea.style.minHeight = `${contentEl.offsetHeight}px`;

        // 替换内容为编辑框
        contentEl.replaceWith(this.textarea);

        // 自动聚焦并将光标移到文本末尾
        this.textarea.focus();
        this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);

        // 隐藏底部的时间和按钮
        const footer = commentEl.querySelector('.highlight-comment-footer');
        if (footer) {
            footer.addClass('hidden');
        }

        // 添加快捷键提示和删除按钮
        this.actionHint = commentEl.createEl('div', {
            cls: 'highlight-comment-actions-hint'
        });

        // 快捷键提示
        this.actionHint.createEl('span', {
            cls: 'highlight-comment-hint',
            text: 'Shift + Enter 换行'
        });

        // 删除按钮
        if (this.options.onDelete) {
            const deleteLink = this.actionHint.createEl('button', {
                cls: 'highlight-comment-delete-link',
                text: '删除评论'
            });

            deleteLink.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.options.onDelete?.();
            });
        }

        this.setupKeyboardEvents(contentEl, footer || undefined);
    }

    private showCreateMode() {
        const inputSection = document.createElement('div');
        inputSection.className = 'highlight-comment-input';

        // 创建文本框
        this.textarea = inputSection.createEl("textarea");

        // 自动聚焦输入框
        this.textarea.focus();

        // 添加快捷键提示
        inputSection.createEl('div', {
            cls: 'highlight-comment-hint',
            text: 'Shift + Enter 换行'
        });

        // 添加到评论区域
        let commentsSection = this.card.querySelector('.highlight-comments-section');
        if (!commentsSection) {
            commentsSection = this.card.createEl('div', {
                cls: 'highlight-comments-section'
            });
            
            commentsSection.createEl('div', {
                cls: 'highlight-comments-list'
            });
        }

        const commentsList = commentsSection.querySelector('.highlight-comments-list');
        if (commentsList) {
            commentsList.insertBefore(inputSection, commentsList.firstChild);
        }

        this.setupKeyboardEvents();
    }

    private setupKeyboardEvents(contentEl?: HTMLElement, footer?: Element) {
        this.cancelEdit = () => {
            if (this.existingComment) {
                if (contentEl && footer) {
                    requestAnimationFrame(() => {
                        this.textarea.replaceWith(contentEl);
                        this.actionHint.remove();
                        footer.removeClass('hidden');
                        document.removeEventListener('click', this.boundHandleOutsideClick);
                    });
                }
            } else {
                requestAnimationFrame(() => {
                    this.textarea.closest('.highlight-comment-input')?.remove();
                    if (!this.card.querySelector('.highlight-comment')) {
                        this.card.querySelector('.highlight-comments-section')?.remove();
                    }
                    document.removeEventListener('click', this.boundHandleOutsideClick);
                });
            }
            this.options.onCancel();
        };

        this.textarea.onkeydown = async (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    return; // 保持 Shift+Enter 换行功能
                }
                e.preventDefault();
                
                if (this.isProcessing) return;
                
                const content = this.textarea.value.trim();
                if (!content) return;

                this.isProcessing = true;
                this.textarea.disabled = true;

                try {
                    await this.options.onSave(content);
                    // 保存成功后清理
                    requestAnimationFrame(() => {
                        document.removeEventListener('click', this.boundHandleOutsideClick);
                        this.isProcessing = false;
                        this.textarea.disabled = false;
                    });
                } catch (error) {
                    this.textarea.disabled = false;
                    this.isProcessing = false;
                }
            }
        };
    }

    private handleOutsideClick(e: MouseEvent) {
        if (!this.textarea || this.isProcessing) return;
        
        const clickedElement = e.target as HTMLElement;
        const isOutside = !this.textarea.contains(clickedElement) && 
                         !clickedElement.closest('.highlight-comment-actions-hint');
        
        if (isOutside) {
            e.preventDefault();
            e.stopPropagation();
            
            this.isProcessing = true;
            const content = this.textarea.value.trim();
            
            if (content) {
                // 先保存内容的引用
                const currentContent = content;
                // 保持输入框状态直到保存完成
                this.textarea.disabled = true;
                
                this.options.onSave(currentContent)
                    .then(() => {
                        // 确保所有状态更新在一起完成
                        requestAnimationFrame(() => {
                            document.removeEventListener('click', this.boundHandleOutsideClick);
                            this.isProcessing = false;
                            this.textarea.disabled = false;
                        });
                    })
                    .catch(() => {
                        this.textarea.disabled = false;
                        this.isProcessing = false;
                    });
            } else {
                // 使用 requestAnimationFrame 确保状态更新的时机
                requestAnimationFrame(() => {
                    this.cancelEdit();
                    this.isProcessing = false;
                });
            }
        }
    }

    public destroy() {
        document.removeEventListener('click', this.boundHandleOutsideClick);
        this.isProcessing = false;
    }
} 
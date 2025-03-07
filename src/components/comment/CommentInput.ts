import { CommentItem, HighlightInfo } from "../../types";
import { t } from "../../i18n";

// 标签格式的正则表达式
const TAG_REGEX = /#[\w\u4e00-\u9fa5]+/g;
const PURE_TAGS_FORMAT = /^\s*(#[\w\u4e00-\u9fa5]+(\s+#[\w\u4e00-\u9fa5]+)*\s*)$/;

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

        const contentEl = commentEl.querySelector('.hi-note-content') as HTMLElement;
        if (!contentEl) return;

        const originalContent = contentEl.textContent || '';

        // 创建编辑框
        this.textarea = document.createElement('textarea');
        this.textarea.value = originalContent;
        this.textarea.className = 'hi-note-input';
        this.textarea.style.minHeight = `${contentEl.offsetHeight}px`;

        // 添加输入事件监听器
        this.textarea.addEventListener('input', () => {
            this.processTagsInInput();
            this.autoResizeTextarea();
        });

        // 替换内容为编辑框
        contentEl.replaceWith(this.textarea);

        // 隐藏底部的时间和按钮
        const footer = commentEl.querySelector('.hi-note-footer');
        if (footer) {
            footer.addClass('hi-note-hidden');
        }

        // 添加快捷键提示和删除按钮
        this.actionHint = commentEl.createEl('div', {
            cls: 'hi-note-actions-hint'
        });

        // 快捷键提示
        this.actionHint.createEl('span', {
            cls: 'hi-note-hint',
            text: t('Shift + Enter Wrap, Enter Save')
        });

        // 删除按钮
        if (this.options.onDelete) {
            const deleteLink = this.actionHint.createEl('div', {
                cls: 'hi-note-delete-link',
                text: t('Delete comment')
            });

            deleteLink.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.options.onDelete?.();
            });
        }

        this.setupKeyboardEvents(contentEl, footer || undefined);

        // 延迟一下再聚焦，确保DOM已经完全渲染
        setTimeout(() => {
            this.textarea.focus();
            this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
        }, 50);
    }

    private showCreateMode() {
        const inputSection = document.createElement('div');
        inputSection.className = 'hi-note-input';

        // 创建文本框
        this.textarea = inputSection.createEl("textarea");
        
        // 添加输入事件监听器
        this.textarea.addEventListener('input', () => {
            this.processTagsInInput();
            this.autoResizeTextarea();
        });

        // 添加快捷键提示
        inputSection.createEl('div', {
            cls: 'hi-note-hint',
            text: t('Shift + Enter Wrap, Enter Save')
        });

        // 添加到评论区域
        let commentsSection = this.card.querySelector('.hi-notes-section');
        if (!commentsSection) {
            commentsSection = this.card.createEl('div', {
                cls: 'hi-notes-section'
            });
            
            commentsSection.createEl('div', {
                cls: 'hi-notes-list'
            });
        }

        const commentsList = commentsSection.querySelector('.hi-notes-list');
        if (commentsList) {
            commentsList.insertBefore(inputSection, commentsList.firstChild);
        }

        this.setupKeyboardEvents();
        
        // 延迟一下再聚焦，确保DOM已经完全渲染
        setTimeout(() => {
            this.textarea.focus();
        }, 50);
    }

    private setupKeyboardEvents(contentEl?: HTMLElement, footer?: Element) {
        this.cancelEdit = () => {
            if (this.existingComment) {
                if (contentEl && footer) {
                    requestAnimationFrame(() => {
                        this.textarea.replaceWith(contentEl);
                        this.actionHint.remove();
                        footer.removeClass('hi-note-hidden');
                        document.removeEventListener('click', this.boundHandleOutsideClick);
                    });
                }
            } else {
                requestAnimationFrame(() => {
                    this.textarea.closest('.hi-note-input')?.remove();
                    if (!this.card.querySelector('.hi-note')) {
                        this.card.querySelector('.hi-notes-section')?.remove();
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

    /**
     * 自动调整文本框高度以适应内容
     */
    private autoResizeTextarea() {
        // 保存当前滚动位置
        const scrollTop = window.scrollY;
        
        // 重置高度，以便能够准确计算内容高度
        this.textarea.style.height = 'auto';
        
        // 设置新高度 (内容高度 + 边距)
        const newHeight = this.textarea.scrollHeight;
        this.textarea.style.height = `${newHeight}px`;
        
        // 恢复滚动位置，避免页面跳动
        window.scrollTo(0, scrollTop);
    }

    private processTagsInInput() {
        const text = this.textarea.value;
        
        // 检查是否是纯标签格式
        if (PURE_TAGS_FORMAT.test(text)) {
            const tags = text.match(TAG_REGEX) || [];
            
            // 如果找到标签，在textarea上方显示标签预览
            if (tags.length > 0) {
                let tagsPreview = this.textarea.parentElement?.querySelector('.highlight-tags-preview');
                if (!tagsPreview) {
                    tagsPreview = document.createElement('div');
                    tagsPreview.className = 'highlight-tags-preview';
                    this.textarea.parentElement?.insertBefore(tagsPreview, this.textarea);
                }
                if (tagsPreview) {
                    // Clear the tags preview using DOM API
                    while (tagsPreview.firstChild) {
                        tagsPreview.removeChild(tagsPreview.firstChild);
                    }
                    
                    const previewEl = tagsPreview; // 创建一个确定非空的引用
                    tags.forEach(tag => {
                        const tagEl = document.createElement('span');
                        tagEl.className = 'highlight-tag';
                        tagEl.textContent = tag;
                        previewEl.appendChild(tagEl);
                    });
                }
            }
        } else {
            // 如果不是纯标签格式，移除预览区域
            this.textarea.parentElement?.querySelector('.highlight-tags-preview')?.remove();
        }
    }

    private handleOutsideClick(e: MouseEvent) {
        if (!this.textarea || this.isProcessing) return;
        
        const clickedElement = e.target as HTMLElement;
        const isOutside = !this.textarea.contains(clickedElement) && 
                         !clickedElement.closest('.hi-note-actions-hint');
        
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
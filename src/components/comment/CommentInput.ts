import { CommentItem, HighlightInfo } from "../../types";
import { t } from "../../i18n";
import { Platform } from "obsidian";

// 标签格式的正则表达式
const TAG_REGEX = /#[\w\u4e00-\u9fa5]+/g;
const PURE_TAGS_FORMAT = /^\s*(#[\w\u4e00-\u9fa5]+(\s+#[\w\u4e00-\u9fa5]+)*\s*)$/;

export class CommentInput {
    private textarea: HTMLTextAreaElement;
    private actionHint: HTMLElement;
    private cancelEdit: () => void = () => {};
    private isProcessing = false;
    private boundHandleOutsideClick: (e: MouseEvent) => void;
    
    // 查找对应的 HighlightCard 实例
    private findHighlightCardInstance(): any {
        // 这里使用 any 类型，因为我们没有直接引入 HighlightCard 类型
        // 在实际代码中可能需要调整导入和类型
        try {
            // 尝试使用全局方法查找卡片实例
            // @ts-ignore - 忽略类型检查
            return window.HighlightCard?.findCardInstanceByHighlightId?.(this.highlight.id);
        } catch (e) {
            return null;
        }
    }

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
        
        // 设置标记，通知 HighlightCard 当前正在显示真正的输入框
        const cardInstance = this.findHighlightCardInstance();
        if (cardInstance) {
            // 使用自定义事件通知 HighlightCard 实例
            const event = new CustomEvent('comment-input-shown', {
                detail: { highlightId: this.highlight.id }
            });
            document.dispatchEvent(event);
        }
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

        // 使用原始评论内容而不是渲染后的文本内容，这样可以保留 Markdown 符号
        const originalContent = this.existingComment?.content || '';

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
        
        // 阻止文本框的点击事件冒泡
        this.textarea.addEventListener('click', (e) => {
            e.stopPropagation();
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
        
        // 阻止操作提示区域的点击事件冒泡
        this.actionHint.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 快捷键提示 - 只在非移动端显示
        if (!Platform.isMobile) {
            this.actionHint.createEl('span', {
                cls: 'hi-note-hint',
                text: t('Shift + Enter Wrap, Enter Save')
            });
        } 
        // 移动端上显示保存按钮
        else {
            const saveButton = this.actionHint.createEl('button', {
                cls: 'hi-note-save-button',
                text: t('Submit')
            });
            
            saveButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (this.isProcessing) return;
                
                const content = this.textarea.value.trim();
                if (!content) return;
                
                this.isProcessing = true;
                this.textarea.disabled = true;
                saveButton.disabled = true;
                
                try {
                    await this.options.onSave(content);
                    // 保存成功后清理
                    requestAnimationFrame(() => {
                        document.removeEventListener('click', this.boundHandleOutsideClick);
                        this.isProcessing = false;
                        this.textarea.disabled = false;
                    });
                } catch (error) {
                    this.isProcessing = false;
                    this.textarea.disabled = false;
                    saveButton.disabled = false;
                }
            });
        }

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
        
        // 阻止点击事件冒泡，防止触发高亮卡片的点击事件
        inputSection.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // 阻止文本框的点击事件冒泡
        this.textarea.addEventListener('click', (e) => {
            e.stopPropagation();
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
            // 移动端上 Enter 键为换行，非移动端上 Enter 键为保存
            if (e.key === 'Enter') {
                if (Platform.isMobile) {
                    // 移动端上不拦截 Enter 键，允许正常换行
                    return;
                } else if (e.shiftKey) {
                    // 非移动端上保持 Shift+Enter 换行功能
                    return;
                }
                
                // 非移动端上 Enter 键为保存
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
        
        // 通知 HighlightCard 输入框已关闭
        const event = new CustomEvent('comment-input-closed', {
            detail: { highlightId: this.highlight.id }
        });
        document.dispatchEvent(event);
    }
} 
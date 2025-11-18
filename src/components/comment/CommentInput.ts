import { CommentItem, HighlightInfo } from "../../types";
import { t } from "../../i18n";
import { Platform, Notice, setIcon } from "obsidian";
import { AIServiceManager } from "../../services/ai";
import type CommentPlugin from "../../../main";

export class CommentInput {
    private textarea: HTMLTextAreaElement;
    private actionHint: HTMLElement;
    private cancelEdit: () => void = () => {};
    private isProcessing = false;
    private isAIProcessing = false;
    private originalContent = '';
    private boundHandleOutsideClick: (e: MouseEvent) => void;
    private commentEl: Element | null = null; // 保存批注元素引用，用于移除 editing 类

    constructor(
        private card: HTMLElement,
        private highlight: HighlightInfo,
        private existingComment: CommentItem | undefined,
        private plugin: CommentPlugin,
        private options: {
            onSave: (content: string) => Promise<void>;
            onDelete?: () => Promise<void>;
            onCancel: () => void;
        }
    ) {
        this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
        document.addEventListener('click', this.boundHandleOutsideClick);
        
        // 通知 HighlightCard 当前正在显示输入框
        this.notifyInputShown();
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

        // 保存引用，用于在 destroy 时移除 editing 类
        this.commentEl = commentEl;

        // 添加编辑状态类，用于隐藏展开/收起按钮
        commentEl.addClass('editing');

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

        // 设置快捷键提示或保存按钮
        this.setupActionHint();

        // 删除按钮
        if (this.options.onDelete) {
            const deleteLink = this.actionHint.createEl('div', {
                cls: 'hi-note-delete-link',
                text: t('Delete comment')
            });

            deleteLink.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (this.isProcessing) return;
                this.isProcessing = true;
                
                await this.options.onDelete?.();
                
                // 删除成功后销毁输入框
                this.destroy();
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
            this.autoResizeTextarea();
        });
        
        // 阻止点击事件冒泡，防止触发高亮卡片的点击事件
        inputSection.addEventListener('click', (e) => {
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

        // 添加快捷键提示和操作区域
        this.actionHint = inputSection.createEl('div', {
            cls: 'hi-note-actions-hint'
        });
        
        // 阻止操作提示区域的点击事件冒泡
        this.actionHint.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 设置快捷键提示或保存按钮
        this.setupActionHint();

        this.setupKeyboardEvents();
        
        // 延迟一下再聚焦，确保DOM已经完全渲染
        setTimeout(() => {
            this.textarea.focus();
        }, 50);
    }

    private setupKeyboardEvents(contentEl?: HTMLElement, footer?: Element) {
        // 保存编辑模式的上下文，用于取消时恢复
        const editContext = this.existingComment ? { contentEl, footer } : null;
        
        this.cancelEdit = () => {
            this.cancel(editContext);
        };

        this.textarea.onkeydown = async (e: KeyboardEvent) => {
            // Tab键触发AI内联生成
            if (e.key === 'Tab') {
                e.preventDefault();
                await this.handleInlineAI();
                return;
            }
            
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
                    // 保存成功后销毁
                    this.destroy();
                } catch (error) {
                    this.textarea.disabled = false;
                    this.isProcessing = false;
                }
            }
        };
    }

    // 自动调整文本框高度以适应内容
    private autoResizeTextarea() {
        if (!this.textarea) return;
        
        // 使用 requestAnimationFrame 批处理 DOM 操作，减少强制重排
        requestAnimationFrame(() => {
            if (!this.textarea) return;
            
            // 保存当前滚动位置
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // 重置高度，以便能够准确计算内容高度
            this.textarea.style.height = 'auto';
            
            // 设置新高度 (内容高度 + 边距)
            const newHeight = this.textarea.scrollHeight;
            this.textarea.style.height = `${newHeight}px`;
            
            // 恢复滚动位置，避免页面跳动
            window.scrollTo(0, scrollTop);
        });
    }


    private handleOutsideClick(e: MouseEvent) {
        if (!this.textarea || this.isProcessing) return;
        
        const clickedElement = e.target as HTMLElement;
        const isOutside = !this.textarea.contains(clickedElement) && 
                         !clickedElement.closest('.hi-note-actions-hint');
        
        if (isOutside) {
            // 立即阻止事件传播，避免触发卡片点击
            e.preventDefault();
            e.stopPropagation();
            
            this.isProcessing = true;
            const content = this.textarea.value.trim();
            
            if (content) {
                // 有内容时保存
                this.textarea.disabled = true;
                
                this.options.onSave(content)
                    .then(() => {
                        this.destroy();
                    })
                    .catch(() => {
                        this.textarea.disabled = false;
                        this.isProcessing = false;
                    });
            } else {
                // 没有内容时取消
                this.cancel();
            }
        }
    }

    /**
     * 处理AI内联生成功能
     */
    private async handleInlineAI() {
        const userPrompt = this.textarea.value.trim();
        if (!userPrompt) {
            new Notice(t('Please enter AI instruction'));
            return;
        }

        // 如果已经在处理AI请求，则忽略
        if (this.isAIProcessing) {
            return;
        }

        // 保存原始内容，以便出错时恢复
        this.originalContent = userPrompt;
        
        try {
            this.setAILoading(true);
            
            // 获取高亮文本
            const highlightText = this.highlight.text || '';
            
            // 构建完整的Prompt，将用户输入作为指令，高亮文本作为上下文
            const fullPrompt = `${userPrompt}\n\n高亮文本：${highlightText}`;
            
            // 调用AI服务
            const aiService = new AIServiceManager(this.plugin.settings.ai);
            const response = await aiService.generateResponse(
                fullPrompt,
                highlightText,
                this.existingComment?.content || ''
            );
            
            // 替换输入框内容为AI响应
            this.textarea.value = response;
            this.autoResizeTextarea();
            
            // 显示成功提示
            new Notice(t('AI response generated'));
            
        } catch (error) {
            console.error('AI内联生成失败:', error);
            
            // 恢复原始内容
            this.textarea.value = this.originalContent;
            
            // 显示错误提示
            new Notice(t(`AI generation failed: ${error.message}`));
            
        } finally {
            this.setAILoading(false);
        }
    }

    /**
     * 设置AI加载状态
     */
    private setAILoading(loading: boolean) {
        this.isAIProcessing = loading;
        
        if (loading) {
            // 禁用输入框并显示加载状态
            this.textarea.disabled = true;
            this.textarea.style.opacity = '0.6';
            
            // 更新操作提示，只显示加载图标
            if (this.actionHint) {
                const loadingHint = this.actionHint.querySelector('.ai-loading-hint');
                if (!loadingHint) {
                    const hint = this.actionHint.createEl('span', {
                        cls: 'ai-loading-hint'
                    });
                    
                    // 添加加载图标
                    const loadingIcon = hint.createEl('span', {
                        cls: 'ai-loading-icon'
                    });
                    setIcon(loadingIcon, 'loader');
                }
            }
        } else {
            // 恢复输入框状态
            this.textarea.disabled = false;
            this.textarea.style.opacity = '1';
            
            // 移除加载提示
            if (this.actionHint) {
                const loadingHint = this.actionHint.querySelector('.ai-loading-hint');
                if (loadingHint) {
                    loadingHint.remove();
                }
            }
        }
    }

    /**
     * 取消输入（不保存）
     * @param editContext 编辑模式的上下文信息，用于恢复原始内容
     */
    private cancel(editContext?: { contentEl?: HTMLElement, footer?: Element } | null) {
        // 立即通知 HighlightCard 输入框已关闭，确保状态同步
        this.notifyInputClosed();
        
        if (this.existingComment && editContext?.contentEl && editContext?.footer) {
            // 编辑模式：恢复原始内容
            this.textarea.replaceWith(editContext.contentEl);
            this.actionHint.remove();
            editContext.footer.removeClass('hi-note-hidden');
        } else {
            // 创建模式：移除整个输入框容器
            const inputContainer = this.textarea.closest('.hi-note-input');
            if (inputContainer) {
                inputContainer.remove();
            }
            
            // 如果没有其他评论，移除评论区域
            if (!this.card.querySelector('.hi-note')) {
                this.card.querySelector('.hi-notes-section')?.remove();
            }
        }
        
        // 清理事件监听器
        document.removeEventListener('click', this.boundHandleOutsideClick);
        this.isProcessing = false;
        
        // 调用取消回调
        this.options.onCancel();
    }
    
    /**
     * 销毁输入框（保存后调用）
     */
    public destroy() {
        // 立即通知 HighlightCard 输入框已关闭
        this.notifyInputClosed();
        
        // 清理事件监听器
        document.removeEventListener('click', this.boundHandleOutsideClick);
        this.isProcessing = false;
        
        // 移除 textarea
        if (this.textarea && this.textarea.parentElement) {
            this.textarea.remove();
        }
        
        // 移除 actionHint
        if (this.actionHint && this.actionHint.parentElement) {
            this.actionHint.remove();
        }
        
        // 移除编辑状态类，恢复展开/收起按钮
        if (this.commentEl) {
            this.commentEl.removeClass('editing');
            this.commentEl = null;
        }
    }
    
    /**
     * 设置操作提示区域（快捷键提示或保存按钮）
     */
    private setupActionHint() {
        if (!Platform.isMobile) {
            // 非移动端显示快捷键提示
            this.actionHint.createEl('span', {
                cls: 'hi-note-hint',
                text: t('Tab AI, Shift + Enter Wrap, Enter Save')
            });
        } else {
            // 移动端显示保存按钮
            const saveButton = this.actionHint.createEl('button', {
                cls: 'hi-note-save-button',
                text: t('Submit')
            });
            
            saveButton.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.handleSave();
            });
        }
    }
    
    /**
     * 处理保存逻辑
     */
    private async handleSave() {
        if (this.isProcessing) return;
        
        const content = this.textarea.value.trim();
        if (!content) return;
        
        this.isProcessing = true;
        this.textarea.disabled = true;
        
        try {
            await this.options.onSave(content);
            this.destroy();
        } catch (error) {
            this.isProcessing = false;
            this.textarea.disabled = false;
        }
    }
    
    /**
     * 通知 HighlightCard 输入框已显示
     */
    private notifyInputShown() {
        const event = new CustomEvent('comment-input-shown', {
            detail: { highlightId: this.highlight.id }
        });
        document.dispatchEvent(event);
    }
    
    /**
     * 通知 HighlightCard 输入框已关闭
     */
    private notifyInputClosed() {
        const event = new CustomEvent('comment-input-closed', {
            detail: { highlightId: this.highlight.id }
        });
        document.dispatchEvent(event);
    }
} 

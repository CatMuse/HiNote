import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from './CommentStore';
import { Modal } from 'obsidian';
import { ExportPreviewModal } from './ExportModal';
import { HighlightInfo } from './types';
import CommentPlugin from '../main';
import { AIService } from './services/AIService';

export const VIEW_TYPE_COMMENT = "comment-view";

export class CommentView extends ItemView {
    private highlightContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private currentFile: TFile | null = null;
    private highlights: HighlightInfo[] = [];
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;
    private plugin: CommentPlugin;

    constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
        super(leaf);
        this.commentStore = commentStore;
        this.plugin = (this.app as any).plugins.plugins['obsidian-comment'] as CommentPlugin;
        
        // 监听文档切换
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (file) {
                    this.currentFile = file;
                    this.updateHighlights();
                }
            })
        );

        // 监听文档修改
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file === this.currentFile) {
                    this.updateHighlights();
                }
            })
        );
    }

    getViewType(): string {
        return VIEW_TYPE_COMMENT;
    }

    getDisplayText(): string {
        return "文档高亮";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        
        // 创建搜索区域
        this.searchContainer = container.createDiv({
            cls: "highlight-search-container"
        });

        // 创建搜索输入框
        this.searchInput = this.searchContainer.createEl("input", {
            cls: "highlight-search-input",
            attr: {
                type: "text",
                placeholder: "搜索高亮内容或评论...",
            }
        });

        // 添加搜索事件监听
        this.searchInput.addEventListener("input", this.debounce(() => {
            this.updateHighlightsList();
        }, 300));

        // 创建高亮列表容器
        this.highlightContainer = container.createDiv({
            cls: "highlight-container"
        });

        // 初始化当前文件
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.currentFile = activeFile;
            await this.updateHighlights();
        }
    }

    private debounce(func: Function, wait: number) {
        let timeout: NodeJS.Timeout;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private async updateHighlights() {
        if (!this.currentFile) {
            this.renderHighlights([]);
            return;
        }

        const content = await this.app.vault.read(this.currentFile);
        const highlights = this.extractHighlights(content);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(this.currentFile);
        
        // 合并高亮和评论数据
        this.highlights = highlights.map(highlight => {
            const storedComment = storedComments.find(
                (c: HighlightComment) => c.text === highlight.text && c.position === highlight.position
            );
            return storedComment || {
                id: this.generateHighlightId(highlight),
                ...highlight,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        });

        // 使用搜索过滤后的结果进行渲染
        await this.updateHighlightsList();
    }

    private async updateHighlightsList() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const filteredHighlights = this.highlights.filter(highlight => {
            // 搜索高亮文本
            if (highlight.text.toLowerCase().includes(searchTerm)) {
                return true;
            }
            // 搜索评论内容
            if (highlight.comments?.some(comment => 
                comment.content.toLowerCase().includes(searchTerm)
            )) {
                return true;
            }
            return false;
        });

        // 更新显示
        this.renderHighlights(filteredHighlights);
    }

    private renderHighlights(highlightsToRender: HighlightInfo[]) {
        this.highlightContainer.empty();

        if (!this.currentFile) {
            this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: "请打开一个 Markdown 文件"
            });
            return;
        }

        if (highlightsToRender.length === 0) {
            this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: this.searchInput.value.trim() 
                    ? "没有找到匹配的内容" 
                    : "当前文档没有高亮内容"
            });
            return;
        }

        const highlightList = this.highlightContainer.createEl("div", {
            cls: "highlight-list"
        });

        highlightsToRender.forEach((highlight, index) => {
            const card = highlightList.createEl("div", {
                cls: "highlight-card"
            });

            // 高亮内容区域
            const contentEl = card.createEl("div", {
                cls: "highlight-content"
            });

            // 高亮文本容器
            const textContainer = contentEl.createEl("div", {
                cls: "highlight-text-container"
            });

            // 添加竖线装饰
            textContainer.createEl("div", {
                cls: "highlight-text-decorator"
            });

            // 高亮文本区域
            const textEl = textContainer.createEl("div", {
                cls: "highlight-text",
                attr: { 'aria-label': '点击定位到文档位置' }
            });

            // 创建文本内容元素
            const textContent = textEl.createEl("div", {
                text: highlight.text,
                cls: "highlight-text-content"
            });

            // 将点击事件监听器移到文本内容元素上
            textContent.addEventListener("mousedown", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.jumpToHighlight(highlight);
            });

            // 操作按钮组
            const actionButtons = contentEl.createEl("div", {
                cls: "highlight-action-buttons"
            });

            // 左侧按钮组
            const leftButtons = actionButtons.createEl("div", {
                cls: "highlight-action-buttons-left"
            });

            // AI 按钮和下拉菜单
            const aiContainer = leftButtons.createEl("div", {
                cls: "highlight-ai-container"
            });

            const aiButton = aiContainer.createEl("button", {
                cls: "highlight-action-btn highlight-ai-btn",
                attr: { 'aria-label': '使用 AI 分析' }
            });

            // 创建一个包含正常图标和加载图标的容器
            const aiButtonContent = aiButton.createEl("div", {
                cls: "highlight-ai-btn-content"
            });

            // 正常状态的图标
            const normalIcon = aiButtonContent.createEl("div", {
                cls: "highlight-ai-icon"
            });
            normalIcon.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 4V2"/>
                    <path d="M15 16v-2"/>
                    <path d="M8 9h2"/>
                    <path d="M20 9h2"/>
                    <path d="M17.8 11.8L19 13"/>
                    <path d="M15 9h0"/>
                    <path d="M17.8 6.2L19 5"/>
                    <path d="m3 21 9-9"/>
                    <path d="M12.2 6.2 11 5"/>
                </svg>
            `;

            // 加载状态的图标
            const loadingIcon = aiButtonContent.createEl("div", {
                cls: "highlight-ai-icon-loading hidden"
            });
            loadingIcon.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="2" x2="12" y2="6"/>
                    <line x1="12" y1="18" x2="12" y2="22"/>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
                    <line x1="2" y1="12" x2="6" y2="12"/>
                    <line x1="18" y1="12" x2="22" y2="12"/>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
                </svg>
            `;

            // 创建下拉菜单
            const aiDropdown = aiContainer.createEl("div", {
                cls: "highlight-ai-dropdown hidden"
            });

            // 获取所有可用的 prompts
            const prompts = Object.entries(this.plugin.settings.ai.prompts || {});
            if (prompts.length > 0) {
                prompts.forEach(([promptName, promptContent]) => {
                    const promptItem = aiDropdown.createEl("div", {
                        cls: "highlight-ai-dropdown-item",
                        text: promptName
                    });
                    promptItem.addEventListener("click", async () => {
                        aiDropdown.addClass("hidden");
                        await this.handleAIAnalysis(highlight, promptName);
                    });
                });
            } else {
                // 如果没有可用的 prompts，显示提示信息
                aiDropdown.createEl("div", {
                    cls: "highlight-ai-dropdown-item",
                    text: "请先在设置中添加 Prompt"
                });
            }

            // 添加点击事件
            aiButton.addEventListener("click", (e) => {
                e.stopPropagation();
                if (aiDropdown.hasClass("hidden")) {
                    aiDropdown.removeClass("hidden");
                } else {
                    aiDropdown.addClass("hidden");
                }
            });

            // 右侧按钮组
            const rightButtons = actionButtons.createEl("div", {
                cls: "highlight-action-buttons-right"
            });

            // 添加评论按钮
            const addCommentBtn = rightButtons.createEl("button", {
                cls: "highlight-action-btn highlight-add-btn",
                attr: { 'aria-label': '添加评论' }
            });
            addCommentBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                </svg>
            `;
            addCommentBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showCommentInput(card, highlight);
            });

            // 分享按钮
            const shareBtn = rightButtons.createEl("button", {
                cls: "highlight-action-btn highlight-share-btn",
                attr: { 'aria-label': '导出为图片' }
            });
            shareBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
            `;
            shareBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.exportHighlightAsImage(highlight);
            });

            // 评论列表区域 - 修复可能为 undefined 的问题
            const comments = highlight.comments || [];
            if (comments.length > 0) {  // 使用安全的数组长度检查
                const commentsSection = card.createEl("div", {
                    cls: "highlight-comments-section"
                });

                const commentsList = commentsSection.createEl("div", {
                    cls: "highlight-comments-list"
                });

                // 使用已经检查过的 comments 数组
                comments.forEach(comment => {
                    const commentEl = commentsList.createEl("div", {
                        cls: "highlight-comment",
                        attr: { 'data-comment-id': comment.id }
                    });

                    // 评论内容
                    commentEl.createEl("div", {
                        text: comment.content,
                        cls: "highlight-comment-content"
                    });

                    // 创建底部操作栏
                    const footer = commentEl.createEl("div", {
                        cls: "highlight-comment-footer"
                    });

                    // 评论时间
                    footer.createEl("div", {
                        text: new Date(comment.createdAt).toLocaleString(),
                        cls: "highlight-comment-time"
                    });

                    // 操作按钮容器
                    const actions = footer.createEl("div", {
                        cls: "highlight-comment-actions"
                    });

                    // 编辑按钮
                    const editBtn = actions.createEl("button", {
                        cls: "highlight-edit-btn",
                        attr: { 'aria-label': '编辑评论' }
                    });
                    editBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                        </svg>
                    `;
                    editBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.showCommentInput(card, highlight, comment);
                    });

                    // 删除按钮
                    const deleteBtn = actions.createEl("button", {
                        cls: "highlight-delete-btn",
                        attr: { 'aria-label': '删除评论' }
                    });
                    deleteBtn.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                    `;
                    deleteBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        await this.deleteComment(highlight, comment.id);
                    });
                });
            }
        });
    }

    private async showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) {
        if (existingComment) {
            // 编辑现有评论的逻辑
            const commentEl = card.querySelector(`[data-comment-id="${existingComment.id}"]`);
            if (!commentEl) return;

            // 找到评论内容元素
            const contentEl = commentEl.querySelector('.highlight-comment-content') as HTMLElement;
            if (!contentEl) return;

            // 保存原有内容
            const originalContent = contentEl.textContent || '';

            // 创建编辑框
            const textarea = document.createElement('textarea');
            textarea.value = originalContent;
            textarea.className = 'highlight-comment-input';
            textarea.style.minHeight = `${contentEl.offsetHeight}px`;

            // 替换内容为编辑框
            contentEl.replaceWith(textarea);

            // 隐藏底部的时间和按钮
            const footer = commentEl.querySelector('.highlight-comment-footer');
            if (footer) {
                footer.addClass('hidden');
            }

            // 创编辑操作按
            const editActions = commentEl.createEl('div', {
                cls: 'highlight-comment-buttons'
            });

            // 取按钮
            const cancelBtn = editActions.createEl('button', {
                cls: 'highlight-btn',
                text: '取消'
            });

            // 保存按钮
            const saveBtn = editActions.createEl('button', {
                cls: 'highlight-btn highlight-btn-primary',
                text: '保存'
            });

            // 取消编辑
            const cancelEdit = () => {
                textarea.replaceWith(contentEl);
                editActions.remove();
                footer?.removeClass('hidden');
            };

            // 保存编辑
            const saveEdit = async () => {
                const newContent = textarea.value.trim();
                if (newContent && newContent !== originalContent) {
                    await this.updateComment(highlight, existingComment.id, newContent);
                    await this.updateHighlights();
                } else {
                    cancelEdit();
                }
            };

            cancelBtn.addEventListener('click', cancelEdit);
            saveBtn.addEventListener('click', saveEdit);

            // 支持按键操作
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    cancelEdit();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    saveEdit();
                }
            });

            // 聚焦到文本框并将光标移到末尾
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        } else {
            // 添加新评论的逻辑
            let commentsSection = card.querySelector('.highlight-comments-section');
            
            // 创建输入区域
            const inputSection = document.createElement('div');
            inputSection.className = 'highlight-comment-input';

            const textarea = inputSection.createEl("textarea", {
                attr: { placeholder: "输入评论..." }
            });

            const btnGroup = inputSection.createEl("div", {
                cls: "highlight-comment-buttons"
            });

            // 取消按钮
            btnGroup.createEl("button", {
                cls: "highlight-btn",
                text: "取消"
            }).addEventListener("click", () => {
                inputSection.remove();
                // 如果没有评论，移除评论区域
                if (!commentsSection?.querySelector('.highlight-comment')) {
                    commentsSection?.remove();
                }
            });

            // 保存按钮
            btnGroup.createEl("button", {
                cls: "highlight-btn highlight-btn-primary",
                text: "保存"
            }).addEventListener("click", async () => {
                const content = textarea.value.trim();
                if (content) {
                    await this.addComment(highlight, content);
                    await this.updateHighlights();
                } else {
                    inputSection.remove();
                    // 如果没有评论，移除评论区域
                    if (!commentsSection?.querySelector('.highlight-comment')) {
                        commentsSection?.remove();
                    }
                }
            });

            // 如果还没有评论区域，创建一个
            if (!commentsSection) {
                commentsSection = card.createEl('div', {
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

            textarea.focus();
        }
    }

    private extractHighlights(content: string): HighlightInfo[] {
        const highlightRegex = /==(.*?)==|<mark>(.*?)<\/mark>/g;
        const highlights: HighlightInfo[] = [];
        
        let match;
        while ((match = highlightRegex.exec(content)) !== null) {
            const text = match[1] || match[2];
            if (text.trim()) {
                highlights.push({
                    text: text.trim(),
                    position: match.index
                });
            }
        }

        return highlights;
    }

    private async addComment(highlight: HighlightInfo, content: string) {
        if (!this.currentFile) return;

        const newComment: CommentItem = {
            id: `comment-${Date.now()}`,
            content,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        if (!highlight.comments) {
            highlight.comments = [];
        }
        highlight.comments.push(newComment);
        highlight.updatedAt = Date.now();

        await this.commentStore.addComment(this.currentFile, highlight as HighlightComment);
    }

    private async updateComment(highlight: HighlightInfo, commentId: string, content: string) {
        if (!this.currentFile || !highlight.comments) return;

        const comment = highlight.comments.find(c => c.id === commentId);
        if (comment) {
            comment.content = content;
            comment.updatedAt = Date.now();
            highlight.updatedAt = Date.now();
            await this.commentStore.addComment(this.currentFile, highlight as HighlightComment);
        }
    }

    private async deleteComment(highlight: HighlightInfo, commentId: string) {
        if (!this.currentFile || !highlight.comments) return;

        highlight.comments = highlight.comments.filter(c => c.id !== commentId);
        highlight.updatedAt = Date.now();
        await this.commentStore.addComment(this.currentFile, highlight as HighlightComment);
        await this.updateHighlights();
    }

    private generateHighlightId(highlight: HighlightInfo): string {
        return `highlight-${highlight.position}-${Date.now()}`;
    }

    private async jumpToHighlight(highlight: HighlightInfo) {
        if (!this.currentFile) {
            new Notice("未找到当前文件");
            return;
        }

        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        
        if (markdownLeaves.length === 0) {
            new Notice("未找到文档视图");
            return;
        }

        // 找到当前文件对应的编辑器视图
        const targetLeaf = markdownLeaves.find(leaf => {
            const view = leaf.view as MarkdownView;
            return view.file?.path === this.currentFile?.path;
        });

        if (!targetLeaf) {
            new Notice("未找到对应的编辑器视图");
            return;
        }

        const markdownView = targetLeaf.view as MarkdownView;

        try {
            // 先激活编辑器视图
            await this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });

            // 等待编辑器准备就绪
            await new Promise(resolve => setTimeout(resolve, 100));

            const editor = markdownView.editor;
            
            // 使用编辑器的搜索功能定位到高亮文本
            const searchText = `==${highlight.text}==`;  // 搜高亮语法
            const content = editor.getValue();
            const position = content.indexOf(searchText);
            
            if (position !== -1) {
                const pos = editor.offsetToPos(position);
                
                // 找到段落的末（下一个空行或文档末尾）
                let nextLineNumber = pos.line;
                const totalLines = editor.lineCount();
                
                // 向下查找直到找到空行或文件末尾
                while (nextLineNumber < totalLines - 1) {
                    const currentLine = editor.getLine(nextLineNumber);
                    const nextLine = editor.getLine(nextLineNumber + 1);
                    
                    // 如果当前行不为空但下一行为空，说明找到了段落末尾
                    if (currentLine.trim() !== '' && nextLine.trim() === '') {
                        break;
                    }
                    nextLineNumber++;
                }
                
                // 计算滚动位置，使高亮内容在视图的上方
                const linesAbove = 3;  // 上方预留3
                const startLine = Math.max(0, pos.line - linesAbove);
                
                // 先滚动到目标位置
                editor.scrollIntoView({
                    from: { line: startLine, ch: 0 },
                    to: { line: pos.line, ch: 0 }
                });

                // 等待滚动完成后设置光标位置到段落的下一行
                await new Promise(resolve => setTimeout(resolve, 50));
                editor.setCursor({
                    line: nextLineNumber + 1,  // 定位到段落末尾的下一行
                    ch: 0
                });
            } else {
                new Notice("未找到高亮内容");
            }
        } catch (error) {
            console.error("定位失败:", error);
            new Notice("定位失败，请重试");
        }
    }

    // 修改导出图片功能的方法签名
    private async exportHighlightAsImage(highlight: HighlightInfo & { comments?: CommentItem[] }) {
        try {
            // 动态导入 html2canvas
            const html2canvas = (await import('html2canvas')).default;
            new ExportPreviewModal(this.app, highlight, html2canvas).open();
        } catch (error) {
            console.error("Failed to load html2canvas:", error);
            new Notice("导出失败：无法加载必要的组件");
        }
    }

    private async handleAIAnalysis(highlight: HighlightInfo, promptName: string) {
        try {
            const aiService = new AIService(this.plugin.settings.ai);
            const prompt = this.plugin.settings.ai.prompts[promptName];
            
            if (!prompt) {
                throw new Error(`未找到名为 "${promptName}" 的 Prompt`);
            }

            // 修改查找高亮卡片的方式
            const highlightCard = Array.from(this.highlightContainer.querySelectorAll('.highlight-card'))
                .find(card => {
                    const textContent = card.querySelector('.highlight-text-content')?.textContent;
                    return textContent === highlight.text;
                });

            if (!highlightCard) {
                throw new Error('未找到对应的高亮卡片');
            }

            // 显示加载状态
            const aiButton = highlightCard.querySelector('.highlight-ai-btn');
            const normalIcon = aiButton?.querySelector('.highlight-ai-icon');
            const loadingIcon = aiButton?.querySelector('.highlight-ai-icon-loading');
            
            if (normalIcon && loadingIcon) {
                normalIcon.addClass('hidden');
                loadingIcon.removeClass('hidden');
            }
            
            // 生成回复，传递高亮文本
            const response = await aiService.generateResponse(prompt, highlight.text);
            
            // 添加为评论
            await this.addComment(highlight, response);
            
            // 更新视图
            await this.updateHighlights();
            
            new Notice('AI 分析完成');
        } catch (error) {
            console.error('AI 分析失败:', error);
            new Notice(`AI 分析失败: ${error.message}`);
        } finally {
            // 恢复正常状态
            const highlightCard = Array.from(this.highlightContainer.querySelectorAll('.highlight-card'))
                .find(card => {
                    const textContent = card.querySelector('.highlight-text-content')?.textContent;
                    return textContent === highlight.text;
                });
            
            if (highlightCard) {
                const aiButton = highlightCard.querySelector('.highlight-ai-btn');
                const normalIcon = aiButton?.querySelector('.highlight-ai-icon');
                const loadingIcon = aiButton?.querySelector('.highlight-ai-icon-loading');
                
                if (normalIcon && loadingIcon) {
                    normalIcon.removeClass('hidden');
                    loadingIcon.addClass('hidden');
                }
            }
        }
    }
} 
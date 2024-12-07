import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, setIcon } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from './CommentStore';
import { ExportPreviewModal } from './ExportModal';
import { HighlightInfo, CommentUpdateEvent } from './types';
import CommentPlugin from '../main';
import { AIService } from './services/AIService';
import { AIButton } from './components/AIButton';
import { LocationService } from './services/LocationService';

export const VIEW_TYPE_COMMENT = "comment-view";

export class CommentView extends ItemView {
    private highlightContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private currentFile: TFile | null = null;
    private highlights: HighlightInfo[] = [];
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;
    private plugin: CommentPlugin;
    private locationService: LocationService;

    constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
        super(leaf);
        this.commentStore = commentStore;
        this.plugin = (this.app as any).plugins.plugins['highlight-comment'] as CommentPlugin;
        this.locationService = new LocationService(this.app);
        
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

        // 监听评论输入事件
        const handleCommentInput = (e: CustomEvent) => {
            const { highlightId, text } = e.detail;
            
            // 等待一下确保视图已经更新
            setTimeout(() => {
                // 找到对应的高亮卡片
                const highlightCard = Array.from(this.highlightContainer.querySelectorAll('.highlight-card'))
                    .find(card => {
                        const textContent = card.querySelector('.highlight-text-content')?.textContent;
                        return textContent === text;
                    });

                if (highlightCard) {
                    // 找到并点击添加评论按钮
                    const addButton = highlightCard.querySelector('.highlight-add-comment-btn') as HTMLElement;
                    if (addButton) {
                        addButton.click();
                    }
                    // 滚动到评论区域
                    highlightCard.scrollIntoView({ behavior: "smooth" });
                }
            }, 100);
        };

        window.addEventListener("open-comment-input", handleCommentInput as EventListener);
        this.register(() => window.removeEventListener("open-comment-input", handleCommentInput as EventListener));
    }

    getViewType(): string {
        return VIEW_TYPE_COMMENT;
    }

    getDisplayText(): string {
        return "ObsidianComment";
    }

    getIcon(): string {
        return "message-square-quote";  // 使用与左侧功能区相同的图标
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        
        // 创建搜索区域
        this.searchContainer = container.createEl("div", {
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

        // 创高亮列表容器
        this.highlightContainer = container.createEl("div", {
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
            // 查找匹配的评论，优先使用文本匹配
            const storedComment = storedComments.find(c => {
                // 首先检查文本是否匹配
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.paragraphText) {
                    // 如果文本匹配，查是否在同一段落范围内
                    return Math.abs(c.position - highlight.position) < highlight.paragraphText.length;
                }
                return false;
            });

            if (storedComment) {
                return {
                    ...storedComment,
                    position: highlight.position, // 更新位置以匹配当前文档
                    paragraphOffset: highlight.paragraphOffset
                };
            }

            return {
                id: this.generateHighlightId(highlight),
                ...highlight,
                comments: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        });

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
                cls: "highlight-card",
                attr: {
                    'data-highlight': JSON.stringify(highlight)
                }
            }) as HTMLElement;

            // 高亮内容区域
            const contentEl = card.createEl("div", {
                cls: "highlight-content"
            });

            // 高亮文本容器
            const textContainer = contentEl.createEl("div", {
                cls: "highlight-text-container"
            });

            // 添加线装饰
            const decorator = textContainer.createEl("div", {
                cls: "highlight-text-decorator"
            });

            // 如果有背景色，应用到装饰器
            if (highlight.backgroundColor) {
                decorator.style.backgroundColor = highlight.backgroundColor;
            }

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

            // 初始化 AI 按钮
            this.initAIButton(leftButtons, highlight);

            // 右侧按钮组
            const rightButtons = actionButtons.createEl("div", {
                cls: "highlight-action-buttons-right"
            });

            // 添加评论按钮
            const addCommentBtn = rightButtons.createEl("button", {
                cls: "highlight-action-btn highlight-add-comment-btn",
                attr: { 'aria-label': '添加评论' }
            });
            setIcon(addCommentBtn, "square-plus");
            addCommentBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showCommentInput(card, highlight);
            });

            // 分享按钮
            const shareBtn = rightButtons.createEl("button", {
                cls: "highlight-action-btn highlight-share-btn",
                attr: { 'aria-label': '导出为图片' }
            });
            setIcon(shareBtn, "image-down");
            shareBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.exportHighlightAsImage(highlight);
            });

            // 评论表区域 - 修复可能为 undefined 的问题
            const comments = highlight.comments || [];
            if (comments.length > 0) {  // 用安全的数组长度检查
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

                    // 评论内容 - 添加双击事件
                    const contentEl = commentEl.createEl("div", {
                        text: comment.content,
                        cls: "highlight-comment-content"
                    });

                    // 添加双击事件监听
                    contentEl.addEventListener("dblclick", (e) => {
                        e.stopPropagation();
                        this.showCommentInput(card, highlight, comment);
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

                });
            }
        });
    }

    // 初始化 AI 按钮及其功能
    private initAIButton(container: HTMLElement, highlight: HighlightInfo): HTMLElement {
        const aiContainer = container.createEl("div", {
            cls: "highlight-ai-container"
        });

        new AIButton(
            aiContainer, 
            highlight, 
            this.plugin,
            async (content: string) => {
                await this.addComment(highlight, content);
                await this.updateHighlights();
            }
        );

        return aiContainer;
    }

    // 更新所有 AI 下拉菜单
    updateAIDropdowns() {
        const cards = this.containerEl.querySelectorAll('.highlight-card');
        cards.forEach((card) => {
            const highlight = (card as HTMLElement).dataset.highlight;
            if (!highlight) return;

            const oldContainer = card.querySelector('.highlight-ai-container');
            if (oldContainer) {
                const leftButtons = oldContainer.parentElement;
                if (leftButtons) {
                    const newContainer = this.initAIButton(leftButtons, JSON.parse(highlight));
                    leftButtons.replaceChild(newContainer, oldContainer);
                }
            }
        });

        // 添加全局点击事件来关闭所有下拉菜单
        document.addEventListener("click", () => {
            this.containerEl.querySelectorAll('.highlight-ai-dropdown').forEach((dropdown) => {
                if (!dropdown.hasClass("hidden")) {
                    dropdown.addClass("hidden");
                }
            });
        });
    }

    private extractHighlights(content: string): HighlightInfo[] {
        const highlightRegex = /==\s*(.*?)\s*==|<mark>\s*(.*?)\s*<\/mark>|<span style="background:(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,6})">\s*(.*?)\s*<\/span>/g;
        const highlights: HighlightInfo[] = [];
        const paragraphs = content.split(/\n\n+/);
        let offset = 0;

        paragraphs.forEach(paragraph => {
            let match;
            while ((match = highlightRegex.exec(paragraph)) !== null) {
                const text = (match[1] || match[2] || match[4])?.trim(); // 更新索引以匹配新的捕获组
                const backgroundColor = match[3]; // 获取颜色值（rgba 或 16进制）
                if (text) {
                    const highlight: HighlightInfo = {
                        text: text,
                        position: offset + match.index,
                        paragraphOffset: offset,
                        paragraphText: paragraph,
                        backgroundColor: backgroundColor // 存储颜色信息
                    };
                    highlights.push(highlight);
                }
            }
            offset += paragraph.length + 2;
        });

        return highlights;
    }

    private async addComment(highlight: HighlightInfo, content: string) {
        if (!this.currentFile || !highlight.id) return;

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

        // 触发更新评论按钮
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));
    }

    private async updateComment(highlight: HighlightInfo, commentId: string, content: string) {
        if (!this.currentFile || !highlight.comments) return;

        const comment = highlight.comments.find(c => c.id === commentId);
        if (comment) {
            comment.content = content;
            comment.updatedAt = Date.now();
            highlight.updatedAt = Date.now();
            await this.commentStore.addComment(this.currentFile, highlight as HighlightComment);

            // 触发更新评论按钮
            window.dispatchEvent(new CustomEvent("comment-updated", {
                detail: {
                    text: highlight.text,
                    comments: highlight.comments
                }
            }));
        }
    }

    private async deleteComment(highlight: HighlightInfo, commentId: string) {
        if (!this.currentFile || !highlight.comments) return;

        highlight.comments = highlight.comments.filter(c => c.id !== commentId);
        highlight.updatedAt = Date.now();
        await this.commentStore.addComment(this.currentFile, highlight as HighlightComment);

        // 触发更新评论按钮
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));

        // 重新渲染高亮列表
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
        await this.locationService.jumpToHighlight(highlight, this.currentFile.path);
    }

    // 修改导出图片功能的方法签名
    private async exportHighlightAsImage(highlight: HighlightInfo & { comments?: CommentItem[] }) {
        try {
            // 动态导入 html2canvas
            const html2canvas = (await import('html2canvas')).default;
            new ExportPreviewModal(this.app, highlight, html2canvas).open();
        } catch (error) {
            console.error("Failed to load html2canvas:", error);
            new Notice("导出失败：无法加载必要的件");
        }
    }

    private async showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) {
        if (existingComment) {
            // 编辑现有评论的逻辑
            const commentEl = card.querySelector(`[data-comment-id="${existingComment.id}"]`);
            if (!commentEl) return;

            const contentEl = commentEl.querySelector('.highlight-comment-content') as HTMLElement;
            if (!contentEl) return;

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

            // 添加快捷键提示和删除按钮
            const actionHint = commentEl.createEl('div', {
                cls: 'highlight-comment-actions-hint'
            });

            // 快捷键提示
            actionHint.createEl('span', {
                cls: 'highlight-comment-hint',
                text: 'Enter 保存，Shift + Enter 换行，Esc 取消'
            });

            // 删除按钮
            const deleteLink = actionHint.createEl('button', {
                cls: 'highlight-comment-delete-link',
                text: '删除评论'
            });

            deleteLink.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteComment(highlight, existingComment.id);
            });

            // 取消编辑
            const cancelEdit = () => {
                textarea.replaceWith(contentEl);
                actionHint.remove();
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

            // 支持快捷键操作
            textarea.onkeydown = async (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelEdit();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    await saveEdit();
                }
            };

            // 聚焦到文本框
            textarea.focus();
        } else {
            // 添加新评论的逻辑
            let commentsSection = card.querySelector('.highlight-comments-section');
            
            // 创建输入区域
            const inputSection = document.createElement('div');
            inputSection.className = 'highlight-comment-input';

            // 创建文本框
            const textarea = inputSection.createEl("textarea");

            // 添加快捷键提示
            inputSection.createEl('div', {
                cls: 'highlight-comment-hint',
                text: 'Enter 保存，Shift + Enter 换行，Esc 取消'
            });

            // 取消操作
            const cancelAdd = () => {
                inputSection.remove();
                if (!commentsSection?.querySelector('.highlight-comment')) {
                    commentsSection?.remove();
                }
            };

            // 保存操作
            const saveAdd = async () => {
                const content = textarea.value.trim();
                if (content) {
                    await this.addComment(highlight, content);
                    await this.updateHighlights();
                } else {
                    cancelAdd();
                }
            };

            // 支持快捷键操作
            textarea.onkeydown = async (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelAdd();
                } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    await saveAdd();
                }
            };

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

            // 聚焦到文本框
            textarea.focus();
        }
    }

    async onload() {
        // ... 其他代码保持不变 ...
    }
}

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from './CommentStore';

interface HighlightInfo extends Partial<HighlightComment> {
    text: string;
    position: number;
    comments?: CommentItem[];
}

export const VIEW_TYPE_COMMENT = "comment-view";

export class CommentView extends ItemView {
    private highlightContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private currentFile: TFile | null = null;
    private highlights: HighlightInfo[] = [];
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;

    constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
        super(leaf);
        this.commentStore = commentStore;
        
        // 监听文档切换
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.handleFileChange();
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

        await this.handleFileChange();
    }

    private debounce(func: Function, wait: number) {
        let timeout: NodeJS.Timeout;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private async handleFileChange() {
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        
        if (markdownLeaves.length > 0) {
            const markdownView = markdownLeaves[0].view as MarkdownView;
            this.currentFile = markdownView.file;
        } else {
            this.currentFile = null;
        }
        
        await this.updateHighlights();
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
                cls: "highlight-content",
                attr: { 'aria-label': '点击定位到文档位置' }
            });

            // 添加定位图标
            const locationIcon = contentEl.createEl("div", {
                cls: "highlight-location-icon",
            });
            locationIcon.innerHTML = `<svg viewBox="0 0 100 100" width="12" height="12">
                <path fill="currentColor" d="M50,0C35.8,0,24.2,11.6,24.2,25.8C24.2,45,50,75,50,75s25.8-30,25.8-49.2C75.8,11.6,64.2,0,50,0z M50,35.8
                c-5.5,0-10-4.5-10-10s4.5-10,10-10s10,4.5,10,10S55.5,35.8,50,35.8z"/>
            </svg>`;

            // 使用简单的单击事件
            contentEl.addEventListener("click", () => {
                this.jumpToHighlight(highlight);
            });

            // 高亮文本
            contentEl.createEl("div", {
                text: highlight.text,
                cls: "highlight-text"
            });

            // 序号标签
            contentEl.createEl("div", {
                text: `#${index + 1}`,
                cls: "highlight-index"
            });

            // 评论列表区域
            const commentsSection = card.createEl("div", {
                cls: "highlight-comments-section"
            });

            // 初始化评论数组（如果不存在）
            if (!highlight.comments) {
                highlight.comments = [];
            }

            // 显示现有评论
            if (highlight.comments.length > 0) {  // 现在 comments 一定存在
                const commentsList = commentsSection.createEl("div", {
                    cls: "highlight-comments-list"
                });

                highlight.comments.forEach((comment, commentIndex) => {
                    const commentEl = commentsList.createEl("div", {
                        cls: "highlight-comment"
                    });

                    // 评论内容
                    commentEl.createEl("div", {
                        text: comment.content,
                        cls: "highlight-comment-content"
                    });

                    // 评论时间
                    commentEl.createEl("div", {
                        text: new Date(comment.createdAt).toLocaleString(),
                        cls: "highlight-comment-time"
                    });

                    // 编辑按钮
                    const editBtn = commentEl.createEl("button", {
                        cls: "highlight-edit-btn",
                        attr: { 'aria-label': '编辑评论' }
                    });
                    editBtn.innerHTML = `<svg viewBox="0 0 100 100" width="8" height="8"><path fill="currentColor" d="M7.7,84.3l8.1,8.1c2.3,2.3,6.1,2.3,8.5,0l66-66c2.3-2.3,2.3-6.1,0-8.5l-8.1-8.1c-2.3-2.3-6.1-2.3-8.5,0l-66,66C5.3,78.2,5.3,82,7.7,84.3z"/></svg>`;
                    editBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this.showCommentInput(card, highlight, comment);
                    });

                    // 删除按钮
                    const deleteBtn = commentEl.createEl("button", {
                        cls: "highlight-delete-btn",
                        attr: { 'aria-label': '删除评论' }
                    });
                    deleteBtn.innerHTML = `<svg viewBox="0 0 100 100" width="8" height="8"><path fill="currentColor" d="M6.19,25h87.62v8.75H6.19V25z M39.38,93.75V39.38h8.75v54.37H39.38z M51.88,93.75V39.38h8.75v54.37H51.88z"/></svg>`;
                    deleteBtn.addEventListener("click", async (e) => {
                        e.stopPropagation();
                        await this.deleteComment(highlight, comment.id);
                    });
                });
            }

            // 添加评论按钮
            const addBtn = commentsSection.createEl("button", {
                cls: "highlight-add-comment",
                text: "添加评论"
            });
            addBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.showCommentInput(card, highlight);
            });
        });
    }

    private async showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) {
        // 移除现有的评论输入区域（如果有）
        card.querySelector('.highlight-comment-input')?.remove();

        const inputSection = card.createEl("div", {
            cls: "highlight-comment-input"
        });

        const textarea = inputSection.createEl("textarea", {
            value: existingComment?.content || "",
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
        });

        // 保存按钮
        btnGroup.createEl("button", {
            cls: "highlight-btn highlight-btn-primary",
            text: "保存"
        }).addEventListener("click", async () => {
            const content = textarea.value.trim();
            if (content) {
                if (existingComment) {
                    // 更新现有评论
                    await this.updateComment(highlight, existingComment.id, content);
                } else {
                    // 添加新评论
                    await this.addComment(highlight, content);
                }
                await this.updateHighlights();
            }
            inputSection.remove();
        });

        textarea.focus();
    }

    private async jumpToHighlight(highlight: HighlightInfo) {
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        
        if (markdownLeaves.length === 0) {
            new Notice("未找到文档视图");
            return;
        }

        const markdownView = markdownLeaves[0].view as MarkdownView;
        this.app.workspace.setActiveLeaf(markdownLeaves[0]);

        const editor = markdownView.editor;
        const pos = editor.offsetToPos(highlight.position);
        
        // 设置光标位置
        editor.setCursor(pos);
        
        // 使用简单的滚动方式，确保高亮内容在视图的上方
        editor.scrollIntoView({
            from: { 
                line: Math.max(0, pos.line - 10), // 在高亮内容上方预留10行
                ch: 0 
            },
            to: { 
                line: pos.line + 2, // 在高亮内容下方预留2行
                ch: 0 
            }
        });

        // 添加临时高亮效果
        const lineElement = markdownView.containerEl.querySelector(
            `.cm-line:nth-child(${pos.line + 1})`
        );
        
        if (lineElement) {
            // 添加高亮效果
            lineElement.addClass('highlight-active-line');
            
            // 2秒后移除高亮效果
            setTimeout(() => {
                lineElement.removeClass('highlight-active-line');
            }, 2000);
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
} 
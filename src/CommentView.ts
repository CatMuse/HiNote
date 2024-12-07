import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, setIcon } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from './CommentStore';
import { ExportPreviewModal } from './ExportModal';
import { HighlightInfo, CommentUpdateEvent } from './types';
import CommentPlugin from '../main';
import { AIService } from './services/AIService';
import { AIButton } from './components/AIButton';
import { LocationService } from './services/LocationService';
import { HighlightCard } from './components/highlight/HighlightCard';
import { CommentInput } from './components/comment/CommentInput';

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
                    // 更新按钮选择器以匹配新的 DOM 结构
                    const addButton = highlightCard.querySelector('.highlight-action-buttons .highlight-action-buttons-right .highlight-add-comment-btn') as HTMLElement;
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

        highlightsToRender.forEach((highlight) => {
            const highlightCard = new HighlightCard(
                highlightList,
                highlight,
                this.plugin,
                {
                    onHighlightClick: async (h) => await this.jumpToHighlight(h),
                    onCommentAdd: (h) => this.showCommentInput(highlightCard.getElement(), h),
                    onExport: (h) => this.exportHighlightAsImage(h),
                    onCommentEdit: (h, c) => this.showCommentInput(highlightCard.getElement(), h, c),
                    onAIResponse: async (content) => {
                        await this.addComment(highlight, content);
                        await this.updateHighlights();
                    }
                }
            );
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
        new CommentInput(card, highlight, existingComment, {
            onSave: async (content: string) => {
                if (existingComment) {
                    await this.updateComment(highlight, existingComment.id, content);
                } else {
                    await this.addComment(highlight, content);
                }
                await this.updateHighlights();
            },
            onDelete: existingComment ? async () => {
                await this.deleteComment(highlight, existingComment.id);
            } : undefined,
            onCancel: () => {
                // 取消时不需要特殊处理
            }
        }).show();
    }

    async onload() {
        // ... 其他代码保持不变 ...
    }
}

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
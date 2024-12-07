import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, setIcon, getIcon } from "obsidian";
import { CommentStore, HighlightComment, CommentItem } from './CommentStore';
import { ExportPreviewModal } from './ExportModal';
import { HighlightInfo, CommentUpdateEvent } from './types';
import CommentPlugin from '../main';
import { AIService } from './services/AIService';
import { AIButton } from './components/AIButton';
import { LocationService } from './services/LocationService';
import { HighlightCard } from './components/highlight/HighlightCard';
import { CommentInput } from './components/comment/CommentInput';
import { ChatModal } from './components/ChatModal';
import { ChatView } from './components/ChatView';

export const VIEW_TYPE_COMMENT = "comment-view";

export class CommentView extends ItemView {
    private highlightContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private fileListContainer: HTMLElement;
    private mainContentContainer: HTMLElement;
    private currentFile: TFile | null = null;
    private highlights: HighlightInfo[] = [];
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;
    private plugin: CommentPlugin;
    private locationService: LocationService;
    private isDraggedToMainView: boolean = false;
    private currentBatch: number = 0;
    private isLoading: boolean = false;
    private loadingIndicator: HTMLElement;
    private BATCH_SIZE = 20;
    private floatingButton: HTMLElement | null = null;

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

        // 添加视图位置变化的监听
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.checkViewPosition();
            })
        );

        // 创建加载指示器
        this.loadingIndicator = createEl("div", {
            cls: "highlight-loading-indicator",
            text: "加载中..."
        });
        this.loadingIndicator.style.display = "none";
    }

    getViewType(): string {
        return VIEW_TYPE_COMMENT;
    }

    getDisplayText(): string {
        return "HighlightComment";
    }

    getIcon(): string {
        return "message-square-quote";  // 使用与左侧功能区相同的图标
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        
        // 创建主容器
        const mainContainer = container.createEl("div", {
            cls: "highlight-main-container"
        });

        // 创建文件列表区域（只在主视图中显示）
        this.fileListContainer = mainContainer.createEl("div", {
            cls: "highlight-file-list-container"
        });

        // 创建右侧内容区域
        this.mainContentContainer = mainContainer.createEl("div", {
            cls: "highlight-content-container"
        });
        
        // 创建搜索区域
        this.searchContainer = this.mainContentContainer.createEl("div", {
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
        this.highlightContainer = this.mainContentContainer.createEl("div", {
            cls: "highlight-container"
        });

        // 初始化当前文件
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.currentFile = activeFile;
            await this.updateHighlights();
        }

        // 更新视图布局
        this.updateViewLayout();
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
                // 查找文本是否匹配
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.paragraphText) {
                    // 如果文本匹配，查否在同一���落围内
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
            // 在全部视图中也��索文件名
            if (this.currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
                return true;
            }
            return false;
        });

        // 更新显示
        this.renderHighlights(filteredHighlights);
    }

    private renderHighlights(highlightsToRender: HighlightInfo[], append = false) {
        if (!append) {
            this.highlightContainer.empty();
        }

        if (highlightsToRender.length === 0 && !append) {
            this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: this.searchInput.value.trim() 
                    ? "没有找到匹配的内容" 
                    : "当前文档没有高亮内容"
            });
            return;
        }

        let highlightList = this.highlightContainer.querySelector('.highlight-list') as HTMLElement;
        if (!highlightList) {
            highlightList = this.highlightContainer.createEl("div", {
                cls: "highlight-list"
            });
        }

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
                },
                this.isDraggedToMainView,
                // 当显示全部高亮时（currentFile 为 null），使用高亮的 fileName，否则使用当前文件名
                this.currentFile === null ? highlight.fileName : this.currentFile.basename
            );

            // 根据位置更新样式
            const cardElement = highlightCard.getElement();
            if (this.isDraggedToMainView) {
                cardElement.classList.add('in-main-view');
                // 找到文本内容元素并移除点击提示
                const textContent = cardElement.querySelector('.highlight-text-content');
                if (textContent) {
                    textContent.removeAttribute('title');
                }
            } else {
                cardElement.classList.remove('in-main-view');
                // 添加点击提示
                const textContent = cardElement.querySelector('.highlight-text-content');
                if (textContent) {
                    textContent.setAttribute('title', '点击定位到文档位置');
                }
            }
        });
    }

    private extractHighlights(content: string): HighlightInfo[] {
        const highlightRegex = /==\s*(.*?)\s*==|<mark>\s*(.*?)\s*<\/mark>|<span style="background:(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,6})">\s*(.*?)\s*<\/span>/g;
        const highlights: HighlightInfo[] = [];
        const paragraphs = content.split(/\n\n+/);
        let offset = 0;

        paragraphs.forEach((paragraph, index) => {
            let match;
            while ((match = highlightRegex.exec(paragraph)) !== null) {
                const text = (match[1] || match[2] || match[4])?.trim();
                const backgroundColor = match[3];
                if (text) {
                    const highlight: HighlightInfo = {
                        text: text,
                        position: offset + match.index,
                        paragraphOffset: offset,
                        paragraphText: paragraph,
                        paragraphId: `p-${index}-${Date.now()}`,
                        backgroundColor: backgroundColor
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
        if (this.isDraggedToMainView) {
            // 如果在视图中，则不执行跳转
            return;
        }

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
                // 消时不需要特殊处理
            }
        }).show();
    }

    async onload() {
        // ... 其他代码保持不变 ...
    }

    // 添加新方法来检查视图位置
    private checkViewPosition() {
        const root = this.app.workspace.rootSplit;
        const isInMainView = this.isViewInMainArea(this.leaf, root);
        
        if (this.isDraggedToMainView !== isInMainView) {
            this.isDraggedToMainView = isInMainView;
            this.updateViewLayout();  // 更新视图布局
            this.updateHighlightsList();
        }
    }

    // 添加新方法来递归检查视图是否在主区域
    private isViewInMainArea(leaf: WorkspaceLeaf, parent: any): boolean {
        if (!parent) return false;
        if (parent.children) {
            return parent.children.some((child: any) => {
                if (child === leaf) {
                    return true;
                }
                return this.isViewInMainArea(leaf, child);
            });
        }
        return false;
    }

    // 添加新方法来更新视图布局
    private async updateViewLayout() {
        if (this.isDraggedToMainView) {
            this.fileListContainer.style.display = "block";
            await this.updateFileList();
            this.createFloatingButton();
        } else {
            this.fileListContainer.style.display = "none";
            this.removeFloatingButton();
        }
    }

    // 修改 updateFileList 方法
    private async updateFileList() {
        // 如果文件列表已经存在，只更新选中状态
        if (this.fileListContainer.children.length > 0) {
            this.updateFileListSelection();
            return;
        }

        // 首次创建文件列表
        this.fileListContainer.empty();
        
        // 创建文件列表标题
        const titleContainer = this.fileListContainer.createEl("div", {
            cls: "highlight-file-list-header"
        });

        titleContainer.createEl("div", {
            text: "HighlightComment",
            cls: "highlight-file-list-title"
        });

        // 创建文件列表
        const fileList = this.fileListContainer.createEl("div", {
            cls: "highlight-file-list"
        });

        // 添加"全部"选项
        const allFilesItem = fileList.createEl("div", {
            cls: `highlight-file-item highlight-file-item-all ${this.currentFile === null ? 'is-active' : ''}`
        });

        // 创建左侧内容容器
        const allFilesLeft = allFilesItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 创建"全部"图标
        const allIcon = allFilesLeft.createEl("span", {
            cls: "highlight-file-item-icon"
        });
        setIcon(allIcon, 'documents');

        // 创建"全部"文本
        allFilesLeft.createEl("span", {
            text: "全部高亮",
            cls: "highlight-file-item-name"
        });

        // 获取所有文件的高亮总数
        const totalHighlights = await this.getTotalHighlightsCount();
        
        // 创建高亮数量标签
        allFilesItem.createEl("span", {
            text: `${totalHighlights}`,
            cls: "highlight-file-item-count"
        });

        // 添加分隔线
        fileList.createEl("div", {
            cls: "highlight-file-list-separator"
        });

        // 修改点击事件
        allFilesItem.addEventListener("click", async () => {
            this.currentFile = null;
            this.updateFileListSelection();  // 先更新选中状态
            await this.updateAllHighlights();  // 再加载内容
        });

        // 获取所有包含高亮的文件
        const files = await this.getFilesWithHighlights();
        
        // 渲染文件列表
        for (const file of files) {
            const fileItem = fileList.createEl("div", {
                cls: `highlight-file-item ${this.currentFile?.path === file.path ? 'is-active' : ''}`,
                attr: {
                    'data-path': file.path
                }
            });

            // 创建左侧内容容器
            const fileItemLeft = fileItem.createEl("div", {
                cls: "highlight-file-item-left"
            });

            // 创建文件图标
            const fileIcon = fileItemLeft.createEl("span", {
                cls: "highlight-file-item-icon"
            });
            setIcon(fileIcon, 'file-text');

            // 创建文件名
            fileItemLeft.createEl("span", {
                text: file.basename,
                cls: "highlight-file-item-name"
            });

            // 获取该文件的高亮数量
            const highlightCount = await this.getFileHighlightsCount(file);
            
            // 创建高亮数量标签
            fileItem.createEl("span", {
                text: `${highlightCount}`,
                cls: "highlight-file-item-count"
            });

            // 修改点击事件
            fileItem.addEventListener("click", async () => {
                // 先更新选中状态，再加载内容
                this.currentFile = file;
                this.updateFileListSelection();
                await this.updateHighlights();
            });
        }
    }

    // 添加新方法：只更新文件列表的选中状态
    private updateFileListSelection() {
        // 更新"全部"选项的选中状态
        const allFilesItem = this.fileListContainer.querySelector('.highlight-file-item-all');
        if (allFilesItem) {
            allFilesItem.classList.toggle('is-active', this.currentFile === null);
        }

        // 更新文件项的选中状态
        const fileItems = this.fileListContainer.querySelectorAll('.highlight-file-item:not(.highlight-file-item-all)');
        fileItems.forEach((item: HTMLElement) => {
            const isActive = this.currentFile?.path === item.getAttribute('data-path');
            item.classList.toggle('is-active', isActive);
        });
    }

    // 添��新方法来获取所有包含高亮的文件
    private async updateAllHighlights() {
        // 重置批次计数
        this.currentBatch = 0;
        this.highlights = [];
        
        // 清空容器并添加加载指示器
        this.highlightContainer.empty();
        this.highlightContainer.appendChild(this.loadingIndicator);
        
        // 初始加载
        await this.loadMoreHighlights();

        // 添加滚动监听
        const handleScroll = this.debounce(async (e: Event) => {
            const container = e.target as HTMLElement;
            const { scrollTop, scrollHeight, clientHeight } = container;
            
            // 当滚动到底部附近时加载更多
            if (scrollHeight - scrollTop - clientHeight < 300) {
                await this.loadMoreHighlights();
            }
        }, 100);

        // 注册和清理滚动监听
        this.highlightContainer.addEventListener('scroll', handleScroll);
        this.register(() => this.highlightContainer.removeEventListener('scroll', handleScroll));
    }

    // 添加新方法：加载更多高亮
    private async loadMoreHighlights() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.loadingIndicator.style.display = "block";

        try {
            const files = await this.getFilesWithHighlights();
            const start = this.currentBatch * this.BATCH_SIZE;
            const batch = files.slice(start, start + this.BATCH_SIZE);
            
            if (batch.length === 0) {
                this.loadingIndicator.remove();
                return;
            }

            // 处理这一批文件的高亮
            const batchHighlights: HighlightInfo[] = [];
            for (const file of batch) {
                const content = await this.app.vault.read(file);
                const highlights = this.extractHighlights(content);
                const storedComments = this.commentStore.getFileComments(file);
                
                // 处理每个高亮
                const fileHighlights = highlights.map(highlight => {
                    const storedComment = storedComments.find(c => {
                        const textMatch = c.text === highlight.text;
                        if (textMatch && highlight.paragraphText) {
                            return Math.abs(c.position - highlight.position) < highlight.paragraphText.length;
                        }
                        return false;
                    });

                    if (storedComment) {
                        return {
                            ...storedComment,
                            position: highlight.position,
                            paragraphOffset: highlight.paragraphOffset,
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text'
                        };
                    }

                    return {
                        id: this.generateHighlightId(highlight),
                        ...highlight,
                        comments: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        fileName: file.basename,
                        filePath: file.path,
                        fileIcon: 'file-text'
                    };
                });

                batchHighlights.push(...fileHighlights);
            }

            // 添加到现有高亮中
            this.highlights.push(...batchHighlights);
            
            // 渲染新的高亮
            await this.renderHighlights(batchHighlights, true);
            this.currentBatch++;
            
        } catch (error) {
            console.error('Error loading highlights:', error);
            new Notice('加载高亮内容时出错');
        } finally {
            this.isLoading = false;
            this.loadingIndicator.style.display = "none";
        }
    }

    // 添加新方法来获取所有包含高亮的文件
    private async getFilesWithHighlights(): Promise<TFile[]> {
        const files = this.app.vault.getMarkdownFiles();
        const filesWithHighlights: TFile[] = [];

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const hasHighlight = /==.*?==|<mark>.*?<\/mark>|<span style="background:.*?">.*?<\/span>/g.test(content);
            if (hasHighlight) {
                filesWithHighlights.push(file);
            }
        }

        return filesWithHighlights;
    }

    // 添加新方法：获取文件的高亮数量
    private async getFileHighlightsCount(file: TFile): Promise<number> {
        const content = await this.app.vault.read(file);
        const highlights = this.extractHighlights(content);
        return highlights.length;
    }

    // 添加新方法：获取所有文件的高亮总数
    private async getTotalHighlightsCount(): Promise<number> {
        const files = await this.getFilesWithHighlights();
        let total = 0;
        for (const file of files) {
            total += await this.getFileHighlightsCount(file);
        }
        return total;
    }

    // 添加创建浮动按钮的方法
    private createFloatingButton() {
        if (this.floatingButton) return;
        
        this.floatingButton = document.createElement('div');
        this.floatingButton.className = 'highlight-floating-button';
        
        const icon = document.createElement('span');
        setIcon(icon, 'message-circle');
        this.floatingButton.appendChild(icon);
        
        // 修改点击事件，打开聊天窗口
        this.floatingButton.addEventListener('click', () => {
            new ChatView(this.app, this.plugin).show();
        });
        
        document.body.appendChild(this.floatingButton);
    }

    // 添加移除浮动按钮的方法
    private removeFloatingButton() {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
    }

    // 在 onunload 方法中确保清理
    onunload() {
        this.removeFloatingButton();
    }
}

function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
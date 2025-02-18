import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, setIcon, getIcon } from "obsidian";
import { FlashcardComponent } from './components/flashcard/FlashcardComponent';
import { CommentStore, HiNote, CommentItem, FileComment } from './CommentStore';
import { ExportPreviewModal } from './ExportModal';
import { HighlightInfo, CommentUpdateEvent } from './types';
import { HighlightCard } from './components/highlight/HighlightCard';
import CommentPlugin from '../main';
import { AIService } from './services/AIService';
import { HighlightService } from './services/HighlightService';
import { AIButton } from './components/AIButton';
import { LocationService } from './services/LocationService';
import { ExportService } from './services/ExportService';
import { CommentInput } from './components/comment/CommentInput';
import { ChatView } from './components/ChatView';
import {t} from "./i18n";

export const VIEW_TYPE_COMMENT = "comment-view";

export class CommentView extends ItemView {
    private highlightContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private fileListContainer: HTMLElement;
    private mainContentContainer: HTMLElement;
    private currentFile: TFile | null = null;
    private isFlashcardMode: boolean = false;
    private highlights: HighlightInfo[] = [];
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;
    private plugin: CommentPlugin;
    private locationService: LocationService;
    private exportService: ExportService;
    private highlightService: HighlightService;
    private isDraggedToMainView: boolean = false;
    private currentBatch: number = 0;
    private isLoading: boolean = false;
    private loadingIndicator: HTMLElement;
    private BATCH_SIZE = 20;
    private floatingButton: HTMLElement | null = null;
    private aiButtons: AIButton[] = []; // 添加一个数组来跟踪所有的 AIButton 实例
    private currentEditingHighlightId: string | null | undefined = null;
    private flashcardComponent: FlashcardComponent | null = null;

    constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
        super(leaf);
        this.commentStore = commentStore;
        this.plugin = (this.app as any).plugins.plugins['hi-note'] as CommentPlugin;
        this.locationService = new LocationService(this.app);
        this.exportService = new ExportService(this.app, this.commentStore);
        this.highlightService = new HighlightService(this.app);
        
        // 监听文档切换
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                // 只在非主视图时同步文件
                if (file && !this.isDraggedToMainView) {
                    this.currentFile = file;
                    this.updateHighlights();
                }
            })
        );

        // 监听文档修改
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 只在非主视图时同步文件
                if (file === this.currentFile && !this.isDraggedToMainView) {
                    this.updateHighlights();
                }
            })
        );

        // 监听评论输入事件
        const handleCommentInput = (e: CustomEvent) => {
            const { highlightId, text } = e.detail;
            
            // 等待一下��视图已经更新
            setTimeout(() => {
                // 移除所有卡片的选中状态
                this.highlightContainer.querySelectorAll('.highlight-card').forEach(card => {
                    card.removeClass('selected');
                });

                // 找到对应的高亮卡片
                const highlightCard = Array.from(this.highlightContainer.querySelectorAll('.highlight-card'))
                    .find(card => {
                        const textContent = card.querySelector('.highlight-text-content')?.textContent;
                        return textContent === text;
                    });

                if (highlightCard) {
                    // 添加选中状态
                    highlightCard.addClass('selected');
                    
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
            text: t("Loading...")
        });
        this.loadingIndicator.style.display = "none";
    }

    getViewType(): string {
        return VIEW_TYPE_COMMENT;
    }

    getDisplayText(): string {
        return "HiNote";
    }

    getIcon(): string {
        return "highlighter";  // 使用与左侧功能区相同的图标
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
                placeholder: t("Search..."),
            }
        });

        // 创建图标按钮容器
        const iconButtonsContainer = this.searchContainer.createEl("div", {
            cls: "highlight-search-icons"
        });

        // 添加 message-square-plus 图标按钮
        const addCommentButton = iconButtonsContainer.createEl("button", {
            cls: "highlight-icon-button"
        });
        setIcon(addCommentButton, "message-square-plus");
        addCommentButton.setAttribute("aria-label", t("Add File Comment"));

        // 添加文件评论按钮点击事件
        addCommentButton.addEventListener("click", async () => {
            if (!this.currentFile) {
                new Notice(t("Please open a file first."));
                return;
            }

            // 生成唯一标识符
            const timestamp = Date.now();
            const uniqueId = `file-comment-${timestamp}`;
            
            // 创建虚拟高亮信息，在文档的最顶部创建了一个不可见的高亮内容
            const virtualHighlight: HiNote = {
                id: uniqueId,
                text: `__virtual_highlight_${timestamp}__`,  // 这个文本不会显示给用户
                filePath: this.currentFile.path,
                fileType: this.currentFile.extension,
                displayText: t("File Comment"),  // 这是显示给用户看的文本
                isVirtual: true,  // 标记这是一个虚拟高亮
                position: 0,  // 给一个默认位置
                paragraphOffset: 0,  // 给一个默认偏移量
                paragraphId: `${this.currentFile.path}#^virtual-${timestamp}`,  // 生成一个虚拟段落ID
                createdAt: timestamp,
                updatedAt: timestamp,
                comments: []  // 初始化空的评论数组
            };

            // 先保存到 CommentStore
            await this.commentStore.addComment(this.currentFile, virtualHighlight);

            // 将虚拟高亮添加到高亮列表的最前面
            this.highlights.unshift(virtualHighlight);
            
            // 重新渲染高亮列表
            this.renderHighlights(this.highlights);

            // 找到新创建的高亮卡片
            setTimeout(() => {
                const highlightCard = this.highlightContainer.querySelector('.highlight-card') as HTMLElement;
                if (highlightCard) {
                    // 自动打开评论输入框
                    this.showCommentInput(highlightCard, virtualHighlight);
                    // 滚动到顶部
                    this.highlightContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 100);
        });

        // 添加 square-arrow-out-up-right 图标按钮
        const exportButton = iconButtonsContainer.createEl("button", {
            cls: "highlight-icon-button"
        });
        setIcon(exportButton, "file-symlink");
        exportButton.setAttribute("aria-label", t("Export as notes"));

        // 添加导出按钮点击事件
        exportButton.addEventListener("click", async () => {
            if (!this.currentFile) {
                new Notice(t("Please open a file first."));
                return;
            }

            try {
                const newFile = await this.exportService.exportHighlightsToNote(this.currentFile);
                new Notice(t("Successfully exported highlights to: ") + newFile.path);
                
                // 打开新创建的文件
                const leaf = this.app.workspace.getLeaf();
                await leaf.openFile(newFile);
            } catch (error) {
                new Notice(t("Failed to export highlights: ") + error.message);
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
        // 如果在全部高亮视图，使用 updateAllHighlights
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
            return;
        }

        // 以下是单文件视图的逻辑
        if (!this.currentFile) {
            this.renderHighlights([]);
            return;
        }

        // 检查文件是否应该被排除
        if (!this.highlightService.shouldProcessFile(this.currentFile)) {
            this.renderHighlights([]);
            return;
        }

        const content = await this.app.vault.read(this.currentFile);
        const highlights = this.highlightService.extractHighlights(content);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(this.currentFile);
        
        // 合并高亮和评论数据
        this.highlights = highlights.map(highlight => {
            const storedComment = storedComments.find(c => {
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return textMatch; // 如果没有位置信息，只比较文本
            });

            if (storedComment) {
                return {
                    ...highlight,
                    id: storedComment.id,
                    comments: storedComment.comments,
                    createdAt: storedComment.createdAt,
                    updatedAt: storedComment.updatedAt
                };
            }

            return highlight;
        });

        // 添加虚拟高亮到列表最前面
        const virtualHighlights = storedComments
            .filter(c => c.isVirtual && c.comments && c.comments.length > 0); // 只保留有评论的虚拟高亮
        this.highlights.unshift(...virtualHighlights);

        // 渲染高亮列表
        this.renderHighlights(this.highlights);
    }

    private async updateHighlightsList() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        
        // 清空容器
        this.highlightContainer.empty();

        // 过滤并显示高亮评论
        const filteredHighlights = this.highlights.filter(highlight => {
            // 搜索高亮文本
            if (highlight.text.toLowerCase().includes(searchTerm)) {
                return true;
            }
            // 搜索评论内
            if (highlight.comments?.some(comment => 
                comment.content.toLowerCase().includes(searchTerm)
            )) {
                return true;
            }
            // 在全部视图中也索文件名
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
                    ? t("No matching content found.") 
                    : t("The current document has no highlighted content.")
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
            let highlightCard: HighlightCard;
            // 在具体文件视图下，确保高亮有 filePath
            if (this.currentFile && !highlight.filePath) {
                highlight.filePath = this.currentFile.path;
            }

            highlightCard = new HighlightCard(
                highlightList,
                highlight,
                this.plugin,
                {
                    onHighlightClick: async (h: HighlightInfo) => await this.jumpToHighlight(h),
                    onCommentAdd: (h: HighlightInfo) => this.showCommentInput(highlightCard.getElement(), h),
                    onExport: (h: HighlightInfo) => this.exportHighlightAsImage(h),
                    onCommentEdit: (h: HighlightInfo, c: CommentItem) => this.showCommentInput(highlightCard.getElement(), h, c),
                    onAIResponse: async (content: string) => {
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
                    textContent.setAttribute('aria-label', 'Click to jump to the document position');
                }
            }
        });
    }

    private async addComment(highlight: HighlightInfo, content: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file) {
            new Notice(t("No corresponding file found."));
            return;
        }

        // 确保高亮有 ID
        if (!highlight.id) {
            highlight.id = this.generateHighlightId(highlight);
        }

        if (!highlight.comments) {
            highlight.comments = [];
        }

        const newComment: CommentItem = {
            id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        highlight.comments.push(newComment);
        highlight.updatedAt = Date.now();

        await this.commentStore.addComment(file, highlight as HiNote);

        // 触发更新评论按钮
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));

        // 使用新的刷新方法
        await this.refreshView();
    }

    private async updateComment(highlight: HighlightInfo, commentId: string, content: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        const comment = highlight.comments.find(c => c.id === commentId);
        if (comment) {
            comment.content = content;
            comment.updatedAt = Date.now();
            highlight.updatedAt = Date.now();
            await this.commentStore.addComment(file, highlight as HiNote);

            // 触发更新评论按钮
            window.dispatchEvent(new CustomEvent("comment-updated", {
                detail: {
                    text: highlight.text,
                    comments: highlight.comments
                }
            }));

            // 使用新的刷新方法
            await this.refreshView();
        }
    }

    private async deleteComment(highlight: HighlightInfo, commentId: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        highlight.comments = highlight.comments.filter(c => c.id !== commentId);
        highlight.updatedAt = Date.now();

        // 如果是虚拟高亮且没有评论了，则删除整个高亮
        if (highlight.isVirtual && highlight.comments.length === 0) {
            // 从 CommentStore 中删除高亮
            await this.commentStore.removeComment(file, highlight as HiNote);
            
            // 从当前高亮列表中移除
            this.highlights = this.highlights.filter(h => h.id !== highlight.id);
        } else {
            // 否则只更新评论
            await this.commentStore.addComment(file, highlight as HiNote);
        }

        // 触发更新评论按钮
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));

        // 使用新的刷新方法
        await this.refreshView();
    }

    private async getFileForHighlight(highlight: HighlightInfo): Promise<TFile | null> {
        // 如果有当前文件，使用当前文件
        if (this.currentFile) {
            return this.currentFile;
        }
        // 如果是全部高亮视图，使用 highlight.filePath 获取文件
        if (highlight.filePath) {
            const file = this.app.vault.getAbstractFileByPath(highlight.filePath);
            if (file instanceof TFile) {
                return file;
            }
        }
        // 如果通过 filePath 找不到，尝试通过 fileName
        if (highlight.fileName) {
            const files = this.app.vault.getFiles();
            const file = files.find(f => f.basename === highlight.fileName || f.name === highlight.fileName);
            if (file) {
                return file;
            }
        }
        return null;
    }

    private generateHighlightId(highlight: HighlightInfo): string {
        return `highlight-${highlight.position}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private async jumpToHighlight(highlight: HighlightInfo) {
        if (this.isDraggedToMainView) {
            // 如果在视图中，则不执行转
            return;
        }

        if (!this.currentFile) {
            new Notice(t("No corresponding file found."));
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
            new Notice(t("Export failed: Failed to load necessary components."));
        }
    }

    private async showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) {
        this.currentEditingHighlightId = highlight.id;
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
            onCancel: async () => {
                const currentHighlight = this.highlights.find(h => h.id === this.currentEditingHighlightId);
                if (currentHighlight?.isVirtual && (!currentHighlight.comments || currentHighlight.comments.length === 0)) {
                    // 如果是虚拟高亮且没有评论，删除它
                    const file = await this.getFileForHighlight(currentHighlight);
                    if (file) {
                        await this.commentStore.removeComment(file, currentHighlight as HiNote);
                        this.highlights = this.highlights.filter(h => h.id !== currentHighlight.id);
                        await this.refreshView();
                    }
                }
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
            
            // 如果从主视图切换到侧边栏，重新同步当前文件
            if (!isInMainView) {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.currentFile = activeFile;
                    this.updateHighlights();
                }
            }
            
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
            text: "HiNote",
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

        allFilesItem.addEventListener("click", () => {
            this.currentFile = null;
            this.updateHighlights();
            this.updateFileListSelection();
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
            text: t("All Highlight"),
            cls: "highlight-file-item-name"
        });

        // 创建闪卡按钮的容器
        const flashcardItem = fileList.createEl("div", {
            cls: "highlight-file-item highlight-file-item-flashcard"
        });

        flashcardItem.addEventListener("click", async () => {
            // 更新文件列表选中状态
            this.currentFile = null;
            this.isFlashcardMode = true;
            this.updateFileListSelection();

            // 获取所有文件
            const files = await this.getFilesWithHighlights();
            
            // 获取所有高亮和评论数据
            const allHighlights: HiNote[] = [];
            for (const file of files) {
                const fileHighlights = this.commentStore.getFileComments(file);
                allHighlights.push(...fileHighlights);
            }

            // 清空当前容器
            this.highlightContainer.empty();
            
            // 创建或更新闪卡组件
            if (!this.flashcardComponent) {
                this.flashcardComponent = new FlashcardComponent(this.highlightContainer);
            }
            
            // 设置闪卡数据
            this.flashcardComponent.setCards(allHighlights);
        });

        const flashcardLeft = flashcardItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 添加图标
        const flashcardIcon = flashcardLeft.createEl("span", {
            cls: "highlight-file-item-icon"
        });
        setIcon(flashcardIcon, 'book-heart');

        flashcardLeft.createEl("span", {
            text: t("Flashcards"),
            cls: "highlight-file-item-name"
        });

        flashcardLeft.addEventListener("click", async () => {
            // 获取所有文件
            const files = await this.getFilesWithHighlights();
            
            // 获取所有高亮和评论数据
            const allHighlights: HiNote[] = [];
            for (const file of files) {
                const fileHighlights = this.commentStore.getFileComments(file);
                allHighlights.push(...fileHighlights);
            }

            // 清空当前容器
            this.highlightContainer.empty();
            
            // 创建或更新闪卡组件
            if (!this.flashcardComponent) {
                this.flashcardComponent = new FlashcardComponent(this.highlightContainer);
            }
            
            // 设置闪卡数据
            this.flashcardComponent.setCards(allHighlights);

            // 更新文件列表选中状态
            this.updateFileListSelection();
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
            this.isFlashcardMode = false;
            if (this.flashcardComponent) {
                this.flashcardComponent.cleanup();
                this.flashcardComponent = null;
            }
            this.updateFileListSelection();
            await this.updateAllHighlights();
        });

        // 获取所有包含高亮的文件
        const files = await this.getFilesWithHighlights();
        
        // 为每个文件创建一个列表项
        for (const file of files) {
            const fileItem = fileList.createEl("div", {
                cls: `highlight-file-item ${this.currentFile?.path === file.path ? 'is-active' : ''}`
            });
            fileItem.setAttribute('data-path', file.path);

            // 创建左侧内容容器
            const fileItemLeft = fileItem.createEl("div", {
                cls: "highlight-file-item-left"
            });

            // 创建文件图标
            const fileIcon = fileItemLeft.createEl("span", {
                cls: "highlight-file-item-icon",
                attr: {
                    'aria-label': t('Open (DoubleClick)'),
                }
            });
            setIcon(fileIcon, 'file-text');

            // 为文件图标添加双击事件
            fileIcon.addEventListener("dblclick", async (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                const leaf = this.getPreferredLeaf();
                await leaf.openFile(file);
            });

            // 创建文件名
            const fileNameEl = fileItemLeft.createEl("span", {
                text: file.basename,
                cls: "highlight-file-item-name"
            });

            // 添加页面预览功能
            this.addPagePreview(fileNameEl, file);

            // 获取文件的高亮数量
            const highlightCount = await this.getFileHighlightsCount(file);
            
            // 创建高亮数量标签
            fileItem.createEl("span", {
                text: `${highlightCount}`,
                cls: "highlight-file-item-count"
            });

            // 添加点击事件
            fileItem.addEventListener("click", async () => {
                this.currentFile = file;
                this.isFlashcardMode = false;
                if (this.flashcardComponent) {
                    this.flashcardComponent.cleanup();
                    this.flashcardComponent = null;
                }
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
            allFilesItem.classList.toggle('is-active', this.currentFile === null && !this.isFlashcardMode);
        }

        // 更新闪卡选项的选中状态
        const flashcardItem = this.fileListContainer.querySelector('.highlight-file-item-flashcard');
        if (flashcardItem) {
            flashcardItem.classList.toggle('is-active', this.isFlashcardMode);
        }

        // 更新文件项的选中状态
        const fileItems = this.fileListContainer.querySelectorAll('.highlight-file-item:not(.highlight-file-item-all):not(.highlight-file-item-flashcard)');
        fileItems.forEach((item: HTMLElement) => {
            const isActive = this.currentFile?.path === item.getAttribute('data-path');
            item.classList.toggle('is-active', isActive);
        });
    }

    // 添加新方法来获取所有包含高亮的文件
    async getFilesWithHighlights(): Promise<TFile[]> {
        const allFiles = await this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(file => this.highlightService.shouldProcessFile(file));
        const filesWithHighlights: TFile[] = [];
        
        for (const file of files) {
            const content = await this.app.vault.read(file);
            if (this.highlightService.extractHighlights(content).length > 0) {
                filesWithHighlights.push(file);
            }
        }
        
        return filesWithHighlights;
    }

    // 添加新方法来更新全部高亮
    private async updateAllHighlights() {
        // 重置批次计数
        this.currentBatch = 0;
        this.highlights = [];
        
        // 清空容器并添加加载指示
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
                const highlights = this.highlightService.extractHighlights(content);
                const storedComments = this.commentStore.getFileComments(file);
                
                // 处理每个高亮
                const fileHighlights = highlights.map((highlight: HighlightInfo) => {
                    const storedComment = storedComments.find(c => {
                        const textMatch = c.text === highlight.text;
                        if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                            // 如果文本匹配且都有位置信息，检查是否在同一段落内
                            return Math.abs(c.position - highlight.position) < 1000; // 使用一个合理的范围值
                        }
                        return textMatch; // 如果没有位置信息，只比较文本
                    });

                    if (storedComment) {
                        // 对评论按时间倒序排序
                        const sortedComments = [...storedComment.comments].sort((a, b) => b.updatedAt - a.updatedAt);
                        return {
                            ...storedComment,
                            comments: sortedComments,
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
            console.error("Error loading highlights:", error);
            new Notice("加载高亮内容时出错");
        } finally {
            this.isLoading = false;
            this.loadingIndicator.style.display = "none";
        }
    }

    // 添加新方法来获取文件的高亮数量
    private async getFileHighlightsCount(file: TFile): Promise<number> {
        const content = await this.app.vault.read(file);
        return this.highlightService.extractHighlights(content).length;
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
        
        // 使用 getInstance 方法
        this.floatingButton.addEventListener('click', () => {
            try {
                const chatView = ChatView.getInstance(this.app, this.plugin);
                chatView.show();
            } catch (error) {
                console.error('Failed to open chat view:', error);
            }
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

    // Update AI-related dropdowns
    updateAIDropdowns(): void {
        // 更新所有 AIButton 实例的下拉菜单
        this.aiButtons.forEach(button => {
            button.updateDropdownContent();
        });
        // 触发事件以便其他组件也能更新
        this.app.workspace.trigger('comment-view:update-ai-dropdowns');
    }

    // 注册 AIButton 实例
    registerAIButton(button: AIButton): void {
        this.aiButtons.push(button);
    }

    // 注销 AIButton 实例
    unregisterAIButton(button: AIButton): void {
        const index = this.aiButtons.indexOf(button);
        if (index !== -1) {
            this.aiButtons.splice(index, 1);
        }
    }

    // 添加新方法来判断是否在全部高亮视图
    private isInAllHighlightsView(): boolean {
        return this.currentFile === null;
    }

    // 修改更新视图的方法
    private async refreshView() {
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
        } else {
            await this.updateHighlights();
        }
    }

    // 添加页面预览功能
    private addPagePreview(element: HTMLElement, file: TFile) {
        let hoverTimeout: NodeJS.Timeout;

        // 添加悬停事件
        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = setTimeout(async () => {
                const target = event.target as HTMLElement;
                
                // 触发 Obsidian 的页面预览事件
                this.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300); // 300ms 的延迟显示
        });

        // 添加鼠标离开事件
        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });
    }

    // 添加一个辅助方法来获取或创建拆分视图
    private getPreferredLeaf(): WorkspaceLeaf {
        // 获取所有叶子
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        
        // 如果当前叶子在主视图区域
        if (this.isDraggedToMainView) {
            // 找到一个不是当前叶子的其他叶子
            const otherLeaf = leaves.find(leaf => leaf !== this.leaf);
            if (otherLeaf) {
                // 如果找到其他叶子，使用它
                return otherLeaf;
            }
        }
        
        // 如果没有其他叶子，或者当前不在主视图，创建一个新的拆分视图
        return this.app.workspace.getLeaf('split', 'vertical');
    }
}
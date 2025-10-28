import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, Menu, setIcon, getIcon, debounce } from "obsidian";
import { CanvasService } from './services/CanvasService';
import { FlashcardComponent } from './flashcard/components/FlashcardComponent';
import { FlashcardState } from './flashcard/types/FSRSTypes';
import { CommentStore, HiNote, CommentItem } from './CommentStore';
import { ExportPreviewModal } from './templates/ExportModal';
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
import { LicenseManager } from './services/LicenseManager';
import { IdGenerator } from './utils/IdGenerator';
import { SearchManager } from './view/search/SearchManager';
import { SelectionManager } from './view/selection/SelectionManager';
import { BatchOperationsHandler } from './view/selection/BatchOperationsHandler';
import { FileListManager } from './view/filelist/FileListManager';

export const VIEW_TYPE_COMMENT = "comment-view";

export class CommentView extends ItemView {
    // 搜索管理器
    private searchManager: SearchManager | null = null;
    // 多选管理器
    private selectionManager: SelectionManager | null = null;
    // 批量操作处理器
    private batchOperationsHandler: BatchOperationsHandler | null = null;
    // 文件列表管理器
    private fileListManager: FileListManager | null = null;
    // 添加活动视图变化的事件处理器
    private activeLeafChangeHandler: (() => void) | undefined;
    private highlightContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private fileListContainer: HTMLElement;
    private mainContentContainer: HTMLElement;
    private currentFile: TFile | null = null;
    private isFlashcardMode: boolean = false;
    private highlights: HighlightInfo[] = [];
    private highlightsWithFlashcards: Set<string> = new Set<string>();
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;
    private searchLoadingIndicator: HTMLElement;
    private plugin: CommentPlugin;
    private locationService: LocationService;
    private exportService: ExportService;
    private highlightService: HighlightService;
    private licenseManager: LicenseManager;
    private isDraggedToMainView: boolean = false;
    private isMobileView: boolean = false;
    private isSmallScreen: boolean = false; // 是否为小屏幕设备
    private isShowingFileList: boolean = true; // 在移动端主视图中是否显示文件列表
    private currentBatch: number = 0;
    private isLoading: boolean = false;
    private loadingIndicator: HTMLElement;
    private BATCH_SIZE = 20;
    private floatingButton: HTMLElement | null = null;
    private aiButtons: AIButton[] = []; // 添加一个数组来跟踪所有的 AIButton 实例
    private currentEditingHighlightId: string | null | undefined = null;
    private flashcardComponent: FlashcardComponent | null = null;
    private canvasService: CanvasService;

    constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
        super(leaf);
        this.commentStore = commentStore;
        // 使用类型安全的方式获取插件实例
        // 通过类型断言访问内部属性
        const plugins = (this.app as any).plugins;
        if (plugins && plugins.plugins && plugins.plugins['hi-note']) {
            this.plugin = plugins.plugins['hi-note'] as CommentPlugin;
        } else {
            throw new Error('Hi-Note plugin not found');
        }
        this.locationService = new LocationService(this.app);
        this.exportService = new ExportService(this.app, this.commentStore);
        this.highlightService = new HighlightService(this.app);
        this.licenseManager = new LicenseManager(this.plugin);
        this.canvasService = new CanvasService(this.app.vault);
        
        // 监听文档切换
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                // 只在非主视图时同步文件
                if (file && !this.isDraggedToMainView) {
                    this.currentFile = file;
                    
                    // 检查是否是在 Canvas 中选中的文件节点
                    const activeLeaf = this.app.workspace.activeLeaf;
                    const isInCanvas = activeLeaf?.getViewState()?.state?.file !== file.path && 
                                      activeLeaf?.view?.getViewType() === 'canvas';
                    
                    // 更新高亮，并传递额外信息
                    this.updateHighlights(isInCanvas);
                }
            })
        );

        // 监听文档修改
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 只在非主视图时同步文件
                if (file === this.currentFile && !this.isDraggedToMainView) {
                    // 检查是否是在 Canvas 中选中的文件节点
                    const activeLeaf = this.app.workspace.activeLeaf;
                    const isInCanvas = activeLeaf?.getViewState()?.state?.file !== file.path && 
                                      activeLeaf?.view?.getViewType() === 'canvas';
                    
                    this.updateHighlights(isInCanvas);
                }
            })
        );

        // 监听评论输入事件
        const handleCommentInput = (e: CustomEvent) => {
            const { highlightId, text } = e.detail;
            
            // 等待一下确保视图已经更新
            setTimeout(() => {
                // 移除所有卡片的选中状态
                this.highlightContainer.querySelectorAll('.highlight-card').forEach(card => {
                    card.removeClass('selected');
                });

                // 首先尝试直接通过高亮 ID 查找卡片实例
                let cardInstance = HighlightCard.findCardInstanceByHighlightId(highlightId);
                
                // 如果没找到，尝试通过文本内容查找
                if (!cardInstance) {
                    // 找到对应的高亮卡片
                    const highlightCard = Array.from(this.highlightContainer.querySelectorAll('.highlight-card'))
                        .find(card => {
                            const textContent = card.querySelector('.highlight-text-content')?.textContent;
                            return textContent === text;
                        });

                    if (highlightCard) {
                        // 添加选中状态
                        highlightCard.addClass('selected');
                        
                        // 查找 HighlightCard 实例
                        cardInstance = HighlightCard.findCardInstanceByElement(highlightCard as HTMLElement);
                        
                        // 滚动到评论区域
                        highlightCard.scrollIntoView({ behavior: "smooth" });
                    }
                }
                
                // 如果找到了卡片实例，显示评论输入框
                if (cardInstance) {
                    // 调用 showCommentInput 方法直接触发评论输入框显示
                    cardInstance.showCommentInput();
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
        this.loadingIndicator.addClass('highlight-display-none');
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
        container.addClass("comment-view-container");
        
        // 监听多选事件
        container.addEventListener('highlight-multi-select', (e: CustomEvent) => {
            if (this.selectionManager) {
                this.selectionManager.updateSelectedHighlights();
            }
        });

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
        
        // 创建返回按钮（仅在移动端显示）
        const backButtonContainer = this.mainContentContainer.createEl("div", {
            cls: "highlight-back-button-container"
        });
        
        const backButton = backButtonContainer.createEl("div", {
            cls: "highlight-back-button"
        });
        setIcon(backButton, "arrow-left");
        backButton.createEl("span", {
            text: t("BACK"),
            cls: "highlight-back-button-text"
        });
        
        // 添加返回按钮点击事件
        backButton.addEventListener("click", () => {
            if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                // 如果在闪卡模式下，实现逐级返回
                if (this.isFlashcardMode && this.flashcardComponent) {
                    // 检查闪卡渲染器的状态
                    const renderer = this.flashcardComponent.getRenderer();
                    if (renderer) {
                        // 如果在卡片内容页面，先返回到分组列表
                        if (!renderer.isShowingSidebar()) {
                            renderer.showSidebar();
                            return;
                        }
                        // 如果已经在分组列表页面，才返回到文件列表
                    }
                }
                
                // 如果不是闪卡模式或者已经在闪卡分组列表页面，返回到文件列表
                this.isShowingFileList = true;
                this.updateViewLayout();
            }
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

        // 添加焦点和失焦事件
        this.searchInput.addEventListener('focus', () => {
            this.searchContainer.addClass('focused');
        });

        this.searchInput.addEventListener('blur', (e) => {
            this.searchContainer.removeClass('focused');
        });

        // 创建搜索加载指示器
        this.searchLoadingIndicator = this.searchContainer.createEl("div", {
            cls: "highlight-search-loading"
        });
        this.searchLoadingIndicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="loading-spinner"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`;
        this.searchLoadingIndicator.style.display = "none";
        
        // 创建图标按钮容器
        const iconButtonsContainer = this.searchContainer.createEl("div", {
            cls: "highlight-search-icons"
        });

        // 添加 message-square-plus 图标按钮
        const addCommentButton = iconButtonsContainer.createEl("div", {
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
        const exportButton = iconButtonsContainer.createEl("div", {
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

        // 初始化搜索管理器
        this.searchManager = new SearchManager(
            this.plugin,
            this.searchInput,
            this.searchLoadingIndicator,
            this.searchContainer
        );
        
        // 设置搜索管理器的回调函数
        this.searchManager.setCallbacks(
            async (searchTerm: string, searchType: string) => {
                await this.handleSearch(searchTerm, searchType);
            },
            () => this.highlights,
            () => this.currentFile
        );
        
        // 初始化搜索功能
        this.searchManager.initialize();

        // 创建高亮容器
        this.highlightContainer = this.mainContentContainer.createEl("div", {
            cls: "highlight-container"
        });
        
        // 初始化多选管理器
        this.selectionManager = new SelectionManager(this.highlightContainer);
        this.selectionManager.setOnSelectionChange((selectedCount) => {
            if (this.batchOperationsHandler) {
                this.batchOperationsHandler.showMultiSelectActions(selectedCount);
            }
        });
        this.selectionManager.initialize();
        
        // 添加全局点击事件监听器（在 selectionManager 初始化后）
        this.registerDomEvent(document, 'click', (e: MouseEvent) => {
            if (this.selectionManager && !this.selectionManager.isInSelectionMode()) {
                const selectedCount = this.selectionManager.getSelectedCount();
                if (selectedCount <= 1) return;
                
                const target = e.target as HTMLElement;
                if (!target.closest('.multi-select-actions') && 
                    !target.closest('.highlight-card.selected') &&
                    !target.closest('.highlight-container')) {
                    this.selectionManager.clearSelection();
                }
            }
        });

        // 初始化批量操作处理器
        this.batchOperationsHandler = new BatchOperationsHandler(
            this.plugin,
            this.exportService,
            this.licenseManager,
            this.containerEl
        );

        this.batchOperationsHandler.setCallbacks(
            () => this.selectionManager!.getSelectedHighlights(),
            () => this.selectionManager!.clearSelection(),
            async () => {
                await this.refreshView();
            }
        );
        
        // 初始化文件列表管理器
        this.fileListManager = new FileListManager(
            this.fileListContainer,
            this.plugin,
            this.highlightService,
            this.licenseManager
        );
        
        // 设置文件列表管理器的回调函数
        this.fileListManager.setCallbacks({
            onFileSelect: async (file: TFile | null) => {
                this.currentFile = file;
                this.isFlashcardMode = false;
                if (this.flashcardComponent) {
                    this.flashcardComponent.deactivate();
                    this.flashcardComponent = null;
                }
                this.fileListManager!.updateFileListSelection();
                this.searchContainer.removeClass('highlight-display-none');
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.removeClass('highlight-display-none');
                }
                if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                    this.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.updateHighlights();
            },
            onFlashcardModeToggle: async (enabled: boolean) => {
                this.currentFile = null;
                this.isFlashcardMode = enabled;
                this.fileListManager!.updateFileListSelection();
                this.searchContainer.addClass('highlight-display-none');
                this.highlightContainer.empty();
                if (!this.flashcardComponent) {
                    this.flashcardComponent = new FlashcardComponent(this.highlightContainer, this.plugin);
                    this.flashcardComponent.setLicenseManager(this.licenseManager);
                }
                if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                    this.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.flashcardComponent.activate();
            },
            onAllHighlightsSelect: async () => {
                this.currentFile = null;
                this.isFlashcardMode = false;
                if (this.flashcardComponent) {
                    this.flashcardComponent.deactivate();
                    this.flashcardComponent = null;
                }
                this.fileListManager!.updateFileListSelection();
                if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                    this.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.updateAllHighlights();
            }
        });
        
        // 添加键盘事件监听，支持按住 Shift 键进行多选
        this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                this.highlightContainer.addClass('multi-select-mode');
            }
        });
        
        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                this.highlightContainer.removeClass('multi-select-mode');
            }
        });

        // 初始化当前文件
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.currentFile = activeFile;
            await this.updateHighlights();
        }

        // 更新视图布局
        this.updateViewLayout();
        this.highlightContainer.empty();

        // 过滤并显示高亮评论
        const searchTerm = this.searchInput.value.toLowerCase().trim();
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
            // 在清空容器前清理静态实例集合
            if (typeof HighlightCard.clearAllInstances === 'function') {
                HighlightCard.clearAllInstances();
            } else {
                // 兼容性处理，如果 clearAllInstances 方法不存在
                HighlightCard.clearSelection();
            }
            
            this.highlightContainer.empty();
            this.currentBatch = 0;
            
            // 清除多选状态
            if (this.selectionManager) {
                this.selectionManager.clearSelection();
            }
        }

        if (highlightsToRender.length === 0) {
            // 检查是否有搜索内容
            const hasSearchTerm = this.searchInput && this.searchInput.value.trim() !== '';
            
            const emptyMessage = this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: hasSearchTerm 
                    ? t("No matching highlights found for your search.")
                    : t("The current document has no highlighted content.")
            });
            return;
        }
        
        // 初始化选择功能
        if (this.selectionManager && !append) {
            this.selectionManager.initialize();
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
            
            // 如果高亮已经创建了闪卡，立即更新UI状态
            if (highlight.id && this.highlightsWithFlashcards.has(highlight.id)) {
                // 使用静态方法更新UI，确保闪卡状态正确显示
                // 等待下一帧再更新，确保卡片已经渲染完成
                setTimeout(() => {
                    if (highlight.id) {
                        HighlightCard.updateCardUIByHighlightId(highlight.id);
                    }
                }, 0);
            }

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
                    textContent.setAttribute('aria-label', 'Jump to highlight');
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
            // 使用统一的ID生成策略
            highlight.id = IdGenerator.generateHighlightId(
                this.currentFile?.path || '', 
                highlight.position || 0, 
                highlight.text
            );
        }

        if (!highlight.comments) {
            highlight.comments = [];
        }

        const newComment: CommentItem = {
            id: IdGenerator.generateCommentId(),
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
            const oldContent = comment.content; // 保存旧内容
            
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
            
            // 通过 EventManager 触发批注更新事件，用于闪卡同步
            if (highlight.id) {
                this.plugin.eventManager.emitCommentUpdate(file.path, oldContent, content, highlight.id);
            }

            // 使用新的刷新方法
            await this.refreshView();
        }
    }

    /**
     * 检查高亮是否已经创建了闪卡
     * @param highlightId 高亮 ID
     * @returns 是否已创建闪卡
     */
    private checkHasFlashcard(highlightId: string): boolean {
        // 获取 fsrsManager
        const plugin = this.plugin;
        const fsrsManager = plugin.fsrsManager;
        if (!fsrsManager || !highlightId) {
            return false;
        }
        
        // 通过 sourceId 查找闪卡
        const cards = fsrsManager.findCardsBySourceId(highlightId, 'highlight');
        return cards && cards.length > 0;
    }

    private async deleteComment(highlight: HighlightInfo, commentId: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        highlight.comments = highlight.comments.filter(c => c.id !== commentId);
        highlight.updatedAt = Date.now();

        // 检查高亮是否没有评论了
        if (highlight.comments.length === 0) {
            // 检查高亮是否关联了闪卡
            const hasFlashcard = highlight.id ? this.checkHasFlashcard(highlight.id) : false;
            
            // 如果是虚拟高亮或者没有关联闪卡，则删除整个高亮
            if (highlight.isVirtual || !hasFlashcard) {
                // 从 CommentStore 中删除高亮
                await this.commentStore.removeComment(file, highlight as HiNote);
                
                // 从当前高亮列表中移除
                this.highlights = this.highlights.filter(h => h.id !== highlight.id);
            } else {
                // 有关联闪卡，只更新评论
                await this.commentStore.addComment(file, highlight as HiNote);
            }
        } else {
            // 还有其他评论，只更新评论
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
        // 使用统一的ID生成策略
        return IdGenerator.generateHighlightId(
            this.currentFile?.path || '', 
            highlight.position || 0, 
            highlight.text
        );
    }

    private async jumpToHighlight(highlight: HighlightInfo) {
        if (this.isDraggedToMainView) {
            // 如果在视图中，则不执行转
            return;
        }

        // 如果是全局搜索结果，静默禁止跳转
        if (highlight.isGlobalSearch) {
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

            new Notice(t("Export failed: Failed to load necessary components."));
        }
    }

    private async showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) {
        this.currentEditingHighlightId = highlight.id;
        new CommentInput(card, highlight, existingComment, this.plugin, {
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
    private async checkViewPosition() {
        // 获取根布局
        const root = this.app.workspace.rootSplit;
        if (!root) return;
        
        // 检查当前视图是否在主区域
        const isInMainView = this.isViewInMainArea(this.leaf, root);
        
        if (this.isDraggedToMainView !== isInMainView) {
            // 记录切换前的状态
            const wasInAllHighlightsView = this.isInAllHighlightsView();
            const previousHighlights = [...this.highlights]; // 保存当前高亮列表
            
            // 更新视图位置状态
            this.isDraggedToMainView = isInMainView;

            if (isInMainView) {
                // 在小屏幕移动端，拖拽到主视图时默认显示文件列表
                if (this.checkIfMobile() && this.checkIfSmallScreen()) {
                    this.isShowingFileList = true;
                }
                
                // 拖拽到主视图时，若有激活文档则显示该文档高亮，否则显示全部高亮
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.currentFile = activeFile;
                    await this.updateHighlights();
                } else {
                    this.currentFile = null;
                    await this.updateAllHighlights();
                }
                if (this.fileListManager) {
                    this.fileListManager.updateState({
                        currentFile: this.currentFile,
                        isFlashcardMode: this.isFlashcardMode
                    });
                    this.fileListManager.updateFileListSelection();
                }
            } else {
                // 如果从主视图切换到侧边栏
                // 如果当前处于 Flashcard 模式，自动清理
                if (this.isFlashcardMode) {
                    this.isFlashcardMode = false;
                    if (this.flashcardComponent) {
                        this.flashcardComponent.deactivate();
                        this.flashcardComponent = null;
                    }
                    if (this.fileListManager) {
                        this.fileListManager.updateState({
                            currentFile: this.currentFile,
                            isFlashcardMode: this.isFlashcardMode
                        });
                        this.fileListManager.updateFileListSelection();
                    }
                }

                // 重新同步当前文件
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    // 如果之前是全部高亮视图，需要切换到当前文件视图
                    if (wasInAllHighlightsView) {
                        // 先设置当前文件，避免触发全文件扫描
                        this.currentFile = activeFile;
                        
                        // 先显示加载指示器
                        this.highlightContainer.empty();
                        this.highlightContainer.appendChild(this.loadingIndicator);
                        
                        // 延迟加载当前文件的高亮，提高响应速度
                        setTimeout(() => {
                            this.updateHighlights();
                        }, 10);
                    } else {
                        // 如果之前已经是单文件视图，只需更新当前文件
                        this.currentFile = activeFile;
                        this.updateHighlights();
                    }
                } else {
                    // 没有激活文档，手动清空高亮，显示空提示
                    this.highlights = [];
                    this.renderHighlights([]);
                }
            }

            // 更新视图布局
            this.updateViewLayout();
            
            // 只有在搜索框有内容时才更新高亮列表
            if (this.searchInput && this.searchInput.value.trim() !== '' && this.searchManager) {
                // 触发搜索管理器重新搜索
                const searchValue = this.searchInput.value;
                const inputEvent = new Event('input', { bubbles: true });
                this.searchInput.dispatchEvent(inputEvent);
            }
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
    
    // 检测是否为移动设备
    private checkIfMobile(): boolean {
        return Platform.isMobile;
    }
    
    // 检测是否为小屏幕设备（宽度小于768px）
    private checkIfSmallScreen(): boolean {
        return window.innerWidth < 768;
    }

    // 添加新方法来更新视图布局
    private async updateViewLayout() {
        // 检测设备类型和屏幕大小
        this.isMobileView = this.checkIfMobile();
        this.isSmallScreen = this.checkIfSmallScreen();
        
        // 先清除所有显示相关的类
        this.fileListContainer.removeClass('highlight-display-block');
        this.fileListContainer.removeClass('highlight-display-none');
        this.mainContentContainer.removeClass('highlight-display-none');
        
        // 添加或移除主视图标记类
        const container = this.containerEl.children[1];
        if (this.isDraggedToMainView) {
            container.addClass('is-in-main-view');
        } else {
            container.removeClass('is-in-main-view');
        }
        
        // 添加或移除小屏幕标记类
        if (this.isSmallScreen) {
            container.addClass('is-small-screen');
        } else {
            container.removeClass('is-small-screen');
        }
        
        if (this.isDraggedToMainView) {
            // 更新文件列表
            if (this.fileListManager) {
                this.fileListManager.updateState({
                    currentFile: this.currentFile,
                    isFlashcardMode: this.isFlashcardMode,
                    isMobileView: this.isMobileView,
                    isSmallScreen: this.isSmallScreen,
                    isDraggedToMainView: this.isDraggedToMainView
                });
                await this.fileListManager.updateFileList();
            }
            this.createFloatingButton();
            
            if (this.isMobileView && this.isSmallScreen) {
                // 小屏幕移动设备主视图模式（手机）
                if (this.isShowingFileList) {
                    // 显示文件列表，隐藏内容区域
                    this.fileListContainer.addClass('highlight-display-block');
                    this.mainContentContainer.addClass('highlight-display-none');
                    // 添加全宽类，使文件列表占据全部宽度
                    this.fileListContainer.addClass('highlight-full-width');
                } else {
                    // 显示内容区域，隐藏文件列表
                    this.fileListContainer.addClass('highlight-display-none');
                    this.mainContentContainer.removeClass('highlight-display-none');
                    // 移除全宽类
                    this.fileListContainer.removeClass('highlight-full-width');
                }
            } else {
                // 大屏幕设备主视图模式（平板、桌面）- 同时显示文件列表和内容
                this.fileListContainer.addClass('highlight-display-block');
                this.mainContentContainer.removeClass('highlight-display-none');
                // 确保移除全宽类
                this.fileListContainer.removeClass('highlight-full-width');
            }
        } else {
            // 在侧边栏中隐藏文件列表
            this.fileListContainer.addClass('highlight-display-none');
            this.removeFloatingButton();
            
            // 在侧边栏中显示搜索容器（除非在闪卡模式）
            if (!this.isFlashcardMode) {
                this.searchContainer.removeClass('highlight-display-none');
                // 显示搜索图标按钮
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.removeClass('highlight-display-none');
                }
            }
        }
    }

    // 添加新方法来更新全部高亮
    private async updateAllHighlights(searchTerm: string = '', searchType: string = '') {
        // 重置批次计数
        this.currentBatch = 0;
        this.highlights = [];

        // 清空容器并添加加载指示
        this.highlightContainer.empty();
        this.highlightContainer.appendChild(this.loadingIndicator);

        try {
            // 如果是路径搜索，先获取所有高亮然后按路径过滤
            if (searchType === 'path') {
                // 获取所有高亮
                const allHighlights = await this.highlightService.getAllHighlights();
                
                // 创建所有文件的批注映射
                const fileCommentsMap = new Map<string, HiNote[]>();
                
                // 获取所有文件
                const allFiles = this.app.vault.getMarkdownFiles();
                
                // 预先加载所有文件的批注
                for (const file of allFiles) {
                    const fileComments = this.commentStore.getFileComments(file);
                    if (fileComments && fileComments.length > 0) {
                        fileCommentsMap.set(file.path, fileComments);
                    }
                }
                
                // 处理所有高亮
                this.highlights = [];
                
                for (const { file, highlights } of allHighlights) {
                    // 如果有搜索词，先检查文件路径是否匹配
                    if (searchTerm && !file.path.toLowerCase().includes(searchTerm.toLowerCase())) {
                        continue; // 跳过不匹配的文件
                    }
                    
                    // 获取当前文件的所有批注
                    const fileComments = fileCommentsMap.get(file.path) || [];
                    
                    // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
                    const usedCommentIds = new Set<string>();
                    
                    // 处理每个高亮
                    const processedHighlights = highlights.map(highlight => {
                        // 匹配批注的逻辑保持不变
                        let storedComment = fileComments.find(c => 
                            !usedCommentIds.has(c.id) && c.id === highlight.id
                        );
                        
                        if (!storedComment) {
                            storedComment = fileComments.find(c => {
                                if (usedCommentIds.has(c.id)) return false;
                                
                                const textMatch = c.text === highlight.text;
                                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                                    return Math.abs(c.position - highlight.position) < 1000;
                                }
                                return textMatch;
                            });
                        }
                        
                        if (!storedComment && highlight.position !== undefined) {
                            const highlightPos = highlight.position;
                            storedComment = fileComments.find(c => 
                                !usedCommentIds.has(c.id) && 
                                c.position !== undefined && 
                                Math.abs(c.position - highlightPos) < 50
                            );
                        }
                        
                        if (storedComment) {
                            usedCommentIds.add(storedComment.id);
                            
                            return {
                                ...highlight,
                                id: storedComment.id,
                                comments: storedComment.comments || [],
                                createdAt: storedComment.createdAt,
                                updatedAt: storedComment.updatedAt,
                                fileName: file.basename,
                                filePath: file.path,
                                fileIcon: 'file-text'
                            };
                        }
                        
                        return {
                            ...highlight,
                            comments: highlight.comments || [],
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text'
                        };
                    });
                    
                    this.highlights.push(...processedHighlights);
                    
                    // 添加虚拟高亮（只有批注的高亮）
                    const virtualHighlights = fileComments
                        .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
                    
                    virtualHighlights.forEach(vh => {
                        usedCommentIds.add(vh.id);
                        this.highlights.push({
                            ...vh,
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text',
                            position: vh.position || 0
                        });
                    });
                }
                
                // 初始加载
                await this.loadMoreHighlights();
                return;
            }
            
            // 如果有搜索词，使用文件级索引系统进行搜索
            if (searchTerm) {
                const startTime = Date.now();
                
                // 使用索引搜索高亮
                const searchResults = await this.highlightService.searchHighlightsFromIndex(searchTerm);
                
                // 处理搜索结果
                this.highlights = searchResults.map(highlight => ({
                    ...highlight,
                    comments: highlight.comments || [],
                    fileName: highlight.fileName || (highlight.filePath ? highlight.filePath.split('/').pop()?.replace('.md', '') : ''),
                    filePath: highlight.filePath || '',
                    fileIcon: 'file-text'
                }));
                
                // 初始加载
                await this.loadMoreHighlights();
                return;
            }
            
            // 如果没有搜索词，使用传统方法获取所有高亮
            const allHighlights = await this.highlightService.getAllHighlights();
            
            // 创建所有文件的批注映射
            const fileCommentsMap = new Map<string, HiNote[]>();
            
            // 获取所有文件
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // 预先加载所有文件的批注
            for (const file of allFiles) {
                const fileComments = this.commentStore.getFileComments(file);
                if (fileComments && fileComments.length > 0) {
                    fileCommentsMap.set(file.path, fileComments);
                }
            }
            
            // 处理所有高亮
            this.highlights = [];
            
            for (const { file, highlights } of allHighlights) {
                // 获取当前文件的所有批注
                const fileComments = fileCommentsMap.get(file.path) || [];
                
                // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
                const usedCommentIds = new Set<string>();
                
                // 处理每个高亮
                const processedHighlights = highlights.map(highlight => {
                    // 1. 先尝试精确匹配 ID
                    let storedComment = fileComments.find(c => 
                        !usedCommentIds.has(c.id) && c.id === highlight.id
                    );
                    
                    // 2. 如果没有精确匹配，尝试文本和位置匹配
                    if (!storedComment) {
                        storedComment = fileComments.find(c => {
                            if (usedCommentIds.has(c.id)) return false;
                            
                            const textMatch = c.text === highlight.text;
                            if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                                // 如果文本匹配且都有位置信息，检查是否在同一段落内
                                return Math.abs(c.position - highlight.position) < 1000;
                            }
                            return textMatch; // 如果没有位置信息，只比较文本
                        });
                    }
                    
                    // 3. 如果还是没有匹配，尝试仅使用位置匹配
                    if (!storedComment && highlight.position !== undefined) {
                        // 由于上面的条件已经确保 highlight.position 不为 undefined，
                        // 这里可以安全地使用它，但为了类型安全，我们使用一个临时变量
                        const highlightPos = highlight.position;
                        storedComment = fileComments.find(c => 
                            !usedCommentIds.has(c.id) && 
                            c.position !== undefined && 
                            Math.abs(c.position - highlightPos) < 50
                        );
                    }
                    
                    if (storedComment) {
                        // 标记这个批注ID已被使用
                        usedCommentIds.add(storedComment.id);
                        
                        // 返回合并后的高亮对象
                        return {
                            ...highlight,
                            id: storedComment.id, // 使用存储的批注ID
                            comments: storedComment.comments || [],
                            createdAt: storedComment.createdAt,
                            updatedAt: storedComment.updatedAt,
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text'
                        };
                    }
                    
                    // 如果没有匹配的批注，返回原始高亮并添加文件信息
                    return {
                        ...highlight,
                        comments: highlight.comments || [],
                        fileName: file.basename,
                        filePath: file.path,
                        fileIcon: 'file-text'
                    };
                });
                
                // 添加处理后的高亮到结果中
                this.highlights.push(...processedHighlights);
                
                // 添加虚拟高亮（只有批注的高亮）
                const virtualHighlights = fileComments
                    .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
                
                // 将这些虚拟高亮添加到列表并标记为已使用
                virtualHighlights.forEach(vh => {
                    usedCommentIds.add(vh.id);
                    this.highlights.push({
                        ...vh,
                        fileName: file.basename,
                        filePath: file.path,
                        fileIcon: 'file-text',
                        position: vh.position || 0 // 确保 position 不为 undefined
                    });
                });
            }
            
            // 初始加载
            await this.loadMoreHighlights();
            
            // 添加滚动监听
            const handleScroll = debounce(async (e: Event) => {
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
            
        } catch (error) {
            console.error('[CommentView] Error in updateAllHighlights:', error);
            new Notice(t("Error loading all highlights"));
            this.highlightContainer.empty();
            this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: t("Error loading highlights. Please try again.")
            });
        } finally {
            this.loadingIndicator.removeClass('highlight-display-block');
        }
    }


    // 添加新方法：加载更多高亮
    private async loadMoreHighlights() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.loadingIndicator.addClass('highlight-display-block');

    try {
        const start = this.currentBatch * this.BATCH_SIZE;
        const batch = this.highlights.slice(start, start + this.BATCH_SIZE);

        if (batch.length === 0) {
            this.loadingIndicator.remove();
            return;
        }

        // 渲染新的高亮
        await this.renderHighlights(batch, true);
        this.currentBatch++;
    } catch (error) {
        new Notice("加载高亮内容时出错");
    } finally {
        this.isLoading = false;
        this.loadingIndicator.addClass('highlight-display-none');
    }
}

    // 添加创建浮动按钮的方法
    private createFloatingButton() {
        if (this.floatingButton) return;
        
        this.floatingButton = document.createElement('div');
        this.floatingButton.className = 'highlight-floating-button';
        
        const icon = document.createElement('span');
        setIcon(icon, 'bot-message-square');
        this.floatingButton.appendChild(icon);
        
        // 使用 getInstance 方法
        this.floatingButton.addEventListener('click', (e) => {
            // 阻止事件冒泡和默认行为
            e.preventDefault();
            e.stopPropagation();
            
            try {
                const chatView = ChatView.getInstance(this.app, this.plugin);
                
                // 确保在下一个事件循环中显示对话框
                setTimeout(() => {
                    chatView.show();
                }, 0);
            } catch (error) {
                console.error('创建ChatView失败:', error);
            }
        });
        
        document.body.appendChild(this.floatingButton);
        
        // 注册活动叶子变化的事件处理器
        this.registerActiveLeafChangeHandler();
    }

    // 添加移除浮动按钮的方法
    private removeFloatingButton() {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
        
        // 移除活动叶子变化的事件处理器
        this.unregisterActiveLeafChangeHandler();
    }
    
    // 注册活动叶子变化的事件处理器
    private registerActiveLeafChangeHandler() {
        // 如果已经注册过，先移除
        this.unregisterActiveLeafChangeHandler();
        
        // 创建事件处理器
        this.activeLeafChangeHandler = () => {
            this.updateFloatingButtonVisibility();
            
            // 清理高亮卡片实例
            if (typeof HighlightCard.clearAllInstances === 'function') {
                HighlightCard.clearAllInstances();
            }
            
            // 重新加载高亮
            this.updateHighlights();
        };
        
        // 注册事件
        this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler);
        
        // 初始化按钮可见性
        this.updateFloatingButtonVisibility();
    }
    
    // 移除活动叶子变化的事件处理器
    private unregisterActiveLeafChangeHandler() {
        if (this.activeLeafChangeHandler) {
            this.app.workspace.off('active-leaf-change', this.activeLeafChangeHandler);
            this.activeLeafChangeHandler = undefined;
        }
    }
    
    // 更新浮动按钮的可见性
    private updateFloatingButtonVisibility() {
        if (!this.floatingButton) return;
        
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view && activeLeaf.view.getViewType() === VIEW_TYPE_COMMENT) {
            // 如果当前活动视图是 CommentView，显示浮动按钮
            this.floatingButton.style.display = 'flex';
        } else {
            // 否则隐藏浮动按钮
            this.floatingButton.style.display = 'none';
        }
    }

    // 在 onunload 方法中确保清理
    onunload() {
        this.removeFloatingButton();
        this.unregisterActiveLeafChangeHandler();
        
        // 清理搜索管理器
        if (this.searchManager) {
            this.searchManager.destroy();
            this.searchManager = null;
        }
        
        // 清理多选管理器
        if (this.selectionManager) {
            this.selectionManager.destroy();
            this.selectionManager = null;
        }
        
        // 清理批量操作处理器
        if (this.batchOperationsHandler) {
            this.batchOperationsHandler.destroy();
            this.batchOperationsHandler = null;
        }
        
        // 清理文件列表管理器
        if (this.fileListManager) {
            this.fileListManager.destroy();
            this.fileListManager = null;
        }
    }

    // Update AI-related dropdowns
    updateAIDropdowns(): void {
        // 更新所有 AIButton 实例的下拉菜单
        this.aiButtons.forEach(button => {

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
    
    // 添加方法来更新高亮列表显示（搜索筛选）

    
    /**
     * 处理搜索请求
     * 由 SearchManager 调用
     */
    private async handleSearch(searchTerm: string, searchType: string) {
        try {
            // 检查是否需要恢复到当前文件视图
            const wasGlobalSearch = this.highlights.some(h => h.isGlobalSearch);
            if (wasGlobalSearch && searchType !== 'all' && searchType !== 'path' && this.currentFile) {
                // 恢复到当前文件视图
                this.highlightContainer.empty();
                this.highlightContainer.appendChild(this.loadingIndicator);
                
                // 重新加载当前文件的高亮
                await this.updateHighlights();
                
                // 标记所有高亮为非全局搜索结果
                this.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                
                // 使用实际搜索词过滤
                const filteredHighlights = this.searchManager!.filterHighlightsByTerm(searchTerm, searchType);
                
                // 更新显示
                this.renderHighlights(filteredHighlights);
                return;
            }
            
            // 如果是全局搜索或路径搜索，且不在全局视图中
            if ((searchType === 'all' || searchType === 'path') && this.currentFile !== null) {
                // 显示加载指示器
                this.highlightContainer.empty();
                this.highlightContainer.appendChild(this.loadingIndicator);
                
                // 保存当前文件引用
                const originalFile = this.currentFile;
                
                try {
                    // 临时设置为 null 以启用全局搜索
                    this.currentFile = null;
                    
                    // 直接使用索引搜索
                    await this.updateAllHighlights(searchTerm, searchType);
                    
                    // 标记所有高亮为全局搜索结果
                    this.highlights.forEach(highlight => {
                        highlight.isGlobalSearch = true;
                    });
                    
                    // 直接渲染索引搜索结果
                    this.renderHighlights(this.highlights);
                } finally {
                    // 恢复原始文件引用
                    this.currentFile = originalFile;
                }
            } else {
                // 常规搜索逻辑
                this.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                
                const filteredHighlights = this.searchManager!.filterHighlightsByTerm(searchTerm, searchType);
                this.renderHighlights(filteredHighlights);
            }
        } catch (error) {
            console.error('[高亮搜索] 搜索过程中出错:', error);
        }
    }

    // 修改更新视图的方法
    private async refreshView() {
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
        } else {
            await this.updateHighlights();
        }
    }
    
    // 更新单个文件的高亮
    private async updateHighlights(isInCanvas: boolean = false) {
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
        
        // 检查是否是 Canvas 文件
        if (this.currentFile.extension === 'canvas') {
            // 如果是 Canvas 文件，使用专门的处理方法
            await this.handleCanvasFile(this.currentFile);
            return;
        }

        // 检查文件是否应该被排除
        if (!this.highlightService.shouldProcessFile(this.currentFile)) {
            this.renderHighlights([]);
            return;
        }

        const content = await this.app.vault.read(this.currentFile);
        const highlights = this.highlightService.extractHighlights(content, this.currentFile!);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(this.currentFile);
        
        // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
        const usedCommentIds = new Set<string>();
        
        // 合并高亮和评论数据
        this.highlights = highlights.map(highlight => {
            // 1. 首先尝试精确匹配
            let storedComment = storedComments.find(c => {
                // 如果这个批注ID已经被使用过，跳过它
                if (usedCommentIds.has(c.id)) return false;
                
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return textMatch; // 如果没有位置信息，只比较文本
            });
            
            // 2. 如果精确匹配失败，尝试使用位置匹配
            if (!storedComment && highlight.position !== undefined) {
                storedComment = storedComments.find(c => 
                    !usedCommentIds.has(c.id) && // 确保批注ID未被使用
                    c.position !== undefined && 
                    highlight.position !== undefined &&
                    Math.abs(c.position - highlight.position) < 50
                );
            }
            
            // 3. 如果位置匹配也失败，尝试使用模糊文本匹配
            if (!storedComment && this.plugin.highlightMatchingService) {
                // 将 highlight 转换为 HiNote 格式
                const hiNote: HiNote = {
                    id: highlight.id || IdGenerator.generateHighlightId(
                        this.currentFile?.path || '', 
                        highlight.position || 0, 
                        highlight.text
                    ),
                    text: highlight.text,
                    position: highlight.position || 0, // 确保 position 不为 undefined
                    comments: [],
                    createdAt: highlight.createdAt || Date.now(),
                    updatedAt: highlight.updatedAt || Date.now(),
                    blockId: highlight.blockId,
                    paragraphId: highlight.paragraphId,
                    paragraphOffset: highlight.paragraphOffset || 0,
                    isVirtual: false
                };
                
                // 使用 HighlightMatchingService 查找最匹配的高亮
                if (this.currentFile) {
                    const matchingHighlight = this.plugin.highlightMatchingService.findMatchingHighlight(
                        this.currentFile, 
                        hiNote
                    );
                    
                    // 确保找到的匹配高亮的ID未被使用过
                    if (matchingHighlight && !usedCommentIds.has(matchingHighlight.id)) {
                        storedComment = matchingHighlight;
                    }
                }
            }

            if (storedComment) {
                // 标记这个批注ID已被使用
                usedCommentIds.add(storedComment.id);
                
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

        // 添加虚拟高亮到列表最前面，但只添加那些还没有被使用过的
    const virtualHighlights = storedComments
        .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id)); // 只保留有评论且未被使用的虚拟高亮
    
    // 检查是否已经存在相同内容的虚拟高亮
    const uniqueVirtualHighlights = virtualHighlights.filter(vh => {
        // 检查是否已经存在相同文本的高亮
        return !this.highlights.some(h => h.text === vh.text);
    });
    
    // 将这些虚拟高亮添加到列表并标记为已使用
    uniqueVirtualHighlights.forEach(vh => usedCommentIds.add(vh.id));
    this.highlights.unshift(...uniqueVirtualHighlights);

        // 如果是在 Canvas 中选中的文件节点，添加必要的标记
if (isInCanvas && this.currentFile) {
    this.highlights.forEach(highlight => {
        highlight.isFromCanvas = true;
        highlight.isGlobalSearch = true; // 这会让卡片显示文件名
        highlight.fileName = this.currentFile?.name; // 确保设置文件名
    });
}

// 创建一个映射来记录哪些高亮已经创建了闪卡
        // 这避免了直接在 HighlightInfo 上添加属性
        this.highlightsWithFlashcards = new Set<string>();
        
    if (this.plugin && this.plugin.fsrsManager) {
            const fsrsManager = this.plugin.fsrsManager;
            // 遍历所有高亮，记录已创建闪卡的高亮 ID
            for (const highlight of this.highlights) {
                if (highlight.id) {
                    // 检查是否存在闪卡
                    const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                    // 如果存在闪卡，将高亮 ID 添加到集合中
                    if (existingCards && existingCards.length > 0) {
                        this.highlightsWithFlashcards.add(highlight.id);
                    }
                }
            }
        }
        
        // 检查搜索框是否有内容
        if (this.searchInput && this.searchInput.value.trim() !== '' && this.searchManager) {
            // 如果有搜索内容，使用搜索管理器过滤
            const searchValue = this.searchInput.value.toLowerCase().trim();
            const filteredHighlights = this.searchManager.filterHighlightsByTerm(searchValue, '');
            this.renderHighlights(filteredHighlights);
        } else {
            // 如果没有搜索内容，直接渲染所有高亮
            this.renderHighlights(this.highlights);
        }
    }

    // 处理 Canvas 文件的方法
    private async handleCanvasFile(file: TFile): Promise<void> {
        // 显示加载指示器
        this.highlightContainer.empty();
        if (this.loadingIndicator) {
            this.highlightContainer.appendChild(this.loadingIndicator);
            this.loadingIndicator.removeClass('highlight-display-none');
        }
        
        try {
            // 解析 Canvas 文件，获取所有文件路径
            const filePaths = await this.canvasService.parseCanvasFile(file);
            
            if (filePaths.length === 0) {
                // 如果没有文件节点，显示提示
                this.highlightContainer.empty();
                const emptyMessage = this.highlightContainer.createDiv({
                    cls: 'no-highlights-message',
                    text: 'There are no file nodes in the current Canvas.'
                });
                return;
            }
            
            // 使用现有的 path: 搜索前缀功能来显示所有相关文件的高亮
            // 先获取所有高亮
            await this.updateAllHighlights('', 'path');
            
            // 然后只保留在 Canvas 文件中引用的文件的高亮
            this.highlights = this.highlights.filter(highlight => {
                if (!highlight.filePath) return false;
                return filePaths.includes(highlight.filePath);
            });
            
            // 添加来源信息并标记为全局搜索结果，以便显示文件名
            this.highlights.forEach(highlight => {
                highlight.isFromCanvas = true;
                highlight.canvasSource = file.path;
                highlight.isGlobalSearch = true; // 标记为全局搜索结果，这样会显示文件名
            });
            
            // 渲染高亮
            this.renderHighlights(this.highlights);
            
        } catch (error) {
            console.error('处理 Canvas 文件失败:', error);
            this.highlightContainer.empty();
            const errorMessage = this.highlightContainer.createDiv({
                cls: 'error-message',
                text: '处理 Canvas 文件时出错'
            });
        } finally {
            // 隐藏加载指示器
            if (this.loadingIndicator) {
                this.loadingIndicator.addClass('highlight-display-none');
            }
        }
    }
    
}

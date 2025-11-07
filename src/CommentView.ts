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
import { HighlightRenderManager } from './view/highlight/HighlightRenderManager';
import { HighlightDataManager } from './view/highlight/HighlightDataManager';
import { CommentOperationManager } from './view/comment/CommentOperationManager';
import { CommentInputManager } from './view/comment/CommentInputManager';
import { LayoutManager } from './view/layout/LayoutManager';
import { ViewPositionDetector } from './view/layout/ViewPositionDetector';
import { CanvasHighlightProcessor } from './view/canvas/CanvasHighlightProcessor';
import { AllHighlightsManager } from './view/allhighlights/AllHighlightsManager';

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
    // 高亮渲染管理器
    private highlightRenderManager: HighlightRenderManager | null = null;
    // 高亮数据管理器
    private highlightDataManager: HighlightDataManager | null = null;
    // 评论操作管理器
    private commentOperationManager: CommentOperationManager | null = null;
    // 评论输入管理器
    private commentInputManager: CommentInputManager | null = null;
    // 布局管理器
    private layoutManager: LayoutManager | null = null;
    // 视图位置检测器
    private viewPositionDetector: ViewPositionDetector | null = null;
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
    // Canvas 高亮处理器
    private canvasProcessor: CanvasHighlightProcessor | null = null;
    // 全局高亮管理器
    private allHighlightsManager: AllHighlightsManager | null = null;

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
        // 使用共享的 TextSimilarityService
        this.locationService = new LocationService(this.app, this.plugin.textSimilarityService);
        this.exportService = new ExportService(this.app, this.commentStore);
        // 使用插件提供的共享服务实例，避免重复创建
        this.highlightService = this.plugin.highlightService;
        this.licenseManager = new LicenseManager(this.plugin);
        this.canvasService = this.plugin.canvasService;
        
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
                // 清除文件列表缓存(文件内容变化可能影响高亮)
                if (this.fileListManager) {
                    this.fileListManager.invalidateCache();
                }
                
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
        
        // 监听文件创建和删除,清除缓存
        this.registerEvent(
            this.app.vault.on('create', () => {
                if (this.fileListManager) {
                    this.fileListManager.invalidateCache();
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('delete', () => {
                if (this.fileListManager) {
                    this.fileListManager.invalidateCache();
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
            this.highlightService,
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
                this.fileListManager!.updateState({
                    currentFile: this.currentFile,
                    isFlashcardMode: this.isFlashcardMode
                });
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
                this.fileListManager!.updateState({
                    currentFile: this.currentFile,
                    isFlashcardMode: this.isFlashcardMode
                });
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
                this.fileListManager!.updateState({
                    currentFile: this.currentFile,
                    isFlashcardMode: this.isFlashcardMode
                });
                this.fileListManager!.updateFileListSelection();
                if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                    this.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.updateAllHighlights();
            }
        });
        
        // 初始化高亮渲染管理器
        this.highlightRenderManager = new HighlightRenderManager(
            this.highlightContainer,
            this.plugin,
            this.searchInput
        );
        
        this.highlightRenderManager.setCallbacks({
            onHighlightClick: async (h) => await this.jumpToHighlight(h),
            onCommentAdd: (el, h) => this.showCommentInput(el, h),
            onCommentEdit: (el, h, c) => this.showCommentInput(el, h, c),
            onExport: (h) => this.exportHighlightAsImage(h),
            onAIResponse: async (h, content) => {
                if (this.commentOperationManager) {
                    this.commentOperationManager.updateState({
                        currentFile: this.currentFile,
                        highlights: this.highlights
                    });
                    await this.commentOperationManager.addComment(h, content);
                }
                await this.updateHighlights();
            }
        });
        
        // 初始化高亮数据管理器
        this.highlightDataManager = new HighlightDataManager(
            this.app,
            this.plugin,
            this.highlightService,
            this.commentStore
        );
        
        // 初始化评论操作管理器
        this.commentOperationManager = new CommentOperationManager(
            this.app,
            this.plugin,
            this.commentStore
        );
        
        this.commentOperationManager.setCallbacks({
            onRefreshView: async () => await this.refreshView(),
            onHighlightsUpdate: (highlights) => {
                this.highlights = highlights;
            }
        });
        
        // 初始化评论输入管理器
        this.commentInputManager = new CommentInputManager(this.plugin);
        
        this.commentInputManager.setCallbacks({
            onCommentSave: async (highlight, content, existingComment) => {
                if (this.commentOperationManager) {
                    this.commentOperationManager.updateState({
                        currentFile: this.currentFile,
                        highlights: this.highlights
                    });
                    if (existingComment) {
                        await this.commentOperationManager.updateComment(highlight, existingComment.id, content);
                    } else {
                        await this.commentOperationManager.addComment(highlight, content);
                    }
                }
            },
            onCommentDelete: async (highlight, commentId) => {
                if (this.commentOperationManager) {
                    this.commentOperationManager.updateState({
                        currentFile: this.currentFile,
                        highlights: this.highlights
                    });
                    await this.commentOperationManager.deleteComment(highlight, commentId);
                }
            },
            onCommentCancel: async (highlight) => {
                if (highlight.isVirtual && (!highlight.comments || highlight.comments.length === 0)) {
                    if (this.commentOperationManager) {
                        this.commentOperationManager.updateState({
                            currentFile: this.currentFile,
                            highlights: this.highlights
                        });
                        await this.commentOperationManager.deleteVirtualHighlight(highlight);
                    }
                }
            },
            onViewUpdate: async () => await this.updateHighlights()
        });
        
        // 初始化布局管理器
        this.layoutManager = new LayoutManager(
            this.containerEl,
            this.fileListContainer,
            this.mainContentContainer,
            this.searchContainer
        );
        
        this.layoutManager.setCallbacks({
            onCreateFloatingButton: () => this.createFloatingButton(),
            onRemoveFloatingButton: () => this.removeFloatingButton(),
            onUpdateFileList: async () => {
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
            }
        });
        
        // 初始化视图位置检测器
        this.viewPositionDetector = new ViewPositionDetector(this.app, this.leaf);
        
        // 初始化全局高亮管理器
        this.allHighlightsManager = new AllHighlightsManager(
            this.app,
            this.highlightService,
            this.commentStore
        );
        
        // 初始化 Canvas 处理器
        this.canvasProcessor = new CanvasHighlightProcessor(
            this.app,
            this.canvasService,
            this.highlightDataManager!
        );
        
        this.canvasProcessor.setCallbacks({
            onShowLoading: () => {
                this.highlightContainer.empty();
                if (this.loadingIndicator) {
                    this.highlightContainer.appendChild(this.loadingIndicator);
                    this.loadingIndicator.removeClass('highlight-display-none');
                }
            },
            onHideLoading: () => {
                if (this.loadingIndicator) {
                    this.loadingIndicator.addClass('highlight-display-none');
                }
            },
            onShowError: (message) => {
                this.highlightContainer.empty();
                this.highlightContainer.createDiv({
                    cls: 'error-message',
                    text: message
                });
            },
            onShowEmpty: (message) => {
                this.highlightContainer.empty();
                this.highlightContainer.createDiv({
                    cls: 'no-highlights-message',
                    text: message
                });
            }
        });
        
        this.viewPositionDetector.setCallbacks({
            onPositionChange: async (isInMainView, wasInAllHighlightsView) => {
                this.isDraggedToMainView = isInMainView;
                
                if (isInMainView) {
                    // 拖拽到主视图
                    if (this.layoutManager) {
                        const deviceInfo = this.layoutManager.getDeviceInfo();
                        if (deviceInfo.isMobile && deviceInfo.isSmallScreen) {
                            this.isShowingFileList = true;
                        }
                    }
                    
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
                    // 切换到侧边栏
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
                    
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile) {
                        if (wasInAllHighlightsView) {
                            this.currentFile = activeFile;
                            this.highlightContainer.empty();
                            this.highlightContainer.appendChild(this.loadingIndicator);
                            setTimeout(() => {
                                this.updateHighlights();
                            }, 10);
                        } else {
                            this.currentFile = activeFile;
                            this.updateHighlights();
                        }
                    } else {
                        this.highlights = [];
                        this.renderHighlights([]);
                    }
                }
                
                // 更新布局
                if (this.layoutManager) {
                    this.layoutManager.updateState({
                        isDraggedToMainView: this.isDraggedToMainView,
                        isFlashcardMode: this.isFlashcardMode,
                        isShowingFileList: this.isShowingFileList
                    });
                    await this.layoutManager.updateViewLayout();
                }
                
                // 触发搜索更新
                if (this.searchInput && this.searchInput.value.trim() !== '') {
                    const inputEvent = new Event('input', { bubbles: true });
                    this.searchInput.dispatchEvent(inputEvent);
                }
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
        // 使用 HighlightRenderManager 渲染
        if (this.highlightRenderManager) {
            this.highlightRenderManager.updateState({
                currentFile: this.currentFile,
                isDraggedToMainView: this.isDraggedToMainView,
                highlightsWithFlashcards: this.highlightsWithFlashcards,
                currentBatch: this.currentBatch
            });
            this.highlightRenderManager.renderHighlights(
                highlightsToRender,
                append,
                this.selectionManager
            );
            // 同步 currentBatch
            this.currentBatch = this.highlightRenderManager.getCurrentBatch();
        }
    }

    // 评论操作方法已移至 CommentOperationManager 和 CommentInputManager

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
        if (this.commentInputManager) {
            this.commentInputManager.showCommentInput(card, highlight, existingComment);
        }
    }

    // 检查视图位置（使用 ViewPositionDetector）
    private async checkViewPosition() {
        if (this.viewPositionDetector) {
            const wasInAllHighlightsView = this.isInAllHighlightsView();
            await this.viewPositionDetector.checkViewPosition(wasInAllHighlightsView);
        }
    }
    
    // 更新视图布局（使用 LayoutManager）
    private async updateViewLayout() {
        if (this.layoutManager) {
            this.layoutManager.updateState({
                isDraggedToMainView: this.isDraggedToMainView,
                isFlashcardMode: this.isFlashcardMode,
                isShowingFileList: this.isShowingFileList
            });
            await this.layoutManager.updateViewLayout();
            
            // 同步设备信息
            const deviceInfo = this.layoutManager.getDeviceInfo();
            this.isMobileView = deviceInfo.isMobile;
            this.isSmallScreen = deviceInfo.isSmallScreen;
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
            // 使用 AllHighlightsManager 加载所有高亮
            if (this.allHighlightsManager) {
                this.highlights = await this.allHighlightsManager.updateAllHighlights(searchTerm, searchType);
            }
            
            // 初始加载
            await this.loadMoreHighlights();
            
            // 自动加载直到填满屏幕(解决内容不满一屏时无法滚动的问题)
            await this.loadUntilScrollable();
            
            // 设置无限滚动加载
            this.setupInfiniteScroll();
            
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


    /**
     * 加载更多高亮
     */
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
    
    /**
     * 加载内容直到容器可滚动
     * 解决内容不满一屏时无法触发滚动加载的问题
     */
    private async loadUntilScrollable() {
        const maxAttempts = 10; // 最多尝试10次,避免无限循环
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            const { scrollHeight, clientHeight } = this.highlightContainer;
            
            // 检查是否可滚动(内容高度 > 容器高度)
            if (scrollHeight > clientHeight) {
                break; // 已经可滚动,退出
            }
            
            // 检查是否还有更多内容
            const start = this.currentBatch * this.BATCH_SIZE;
            if (start >= this.highlights.length) {
                break; // 没有更多内容了,退出
            }
            
            // 加载下一批
            await this.loadMoreHighlights();
            attempts++;
            
            // 等待DOM更新
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    /**
     * 设置无限滚动加载
     * 使用 Intersection Observer 实现高性能的无限滚动
     */
    private setupInfiniteScroll() {
        // 创建哨兵元素
        const sentinel = this.highlightContainer.createEl('div', {
            cls: 'scroll-sentinel'
        });
        sentinel.style.height = '1px';
        sentinel.style.width = '100%';
        
        // 使用 Intersection Observer 监听哨兵元素
        const observer = new IntersectionObserver(
            async (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && !this.isLoading) {
                    await this.loadMoreHighlights();
                }
            },
            {
                root: this.highlightContainer,
                rootMargin: '300px', // 提前300px触发加载
                threshold: 0
            }
        );
        
        observer.observe(sentinel);
        
        // 清理资源
        this.register(() => {
            observer.disconnect();
            sentinel.remove();
        });
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
        
        // 清理高亮渲染管理器
        if (this.highlightRenderManager) {
            this.highlightRenderManager.clear();
            this.highlightRenderManager = null;
        }
        
        // 清理高亮数据管理器
        if (this.highlightDataManager) {
            this.highlightDataManager = null;
        }
        
        // 清理评论操作管理器
        if (this.commentOperationManager) {
            this.commentOperationManager = null;
        }
        
        // 清理评论输入管理器
        if (this.commentInputManager) {
            this.commentInputManager.clearEditingState();
            this.commentInputManager = null;
        }
        
        // 清理布局管理器
        if (this.layoutManager) {
            this.layoutManager = null;
        }
        
        // 清理视图位置检测器
        if (this.viewPositionDetector) {
            this.viewPositionDetector = null;
        }
        
        // 清理 Canvas 处理器
        if (this.canvasProcessor) {
            this.canvasProcessor = null;
        }
        
        // 清理全局高亮管理器
        if (this.allHighlightsManager) {
            this.allHighlightsManager = null;
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

        // 使用 HighlightDataManager 加载数据
        if (this.highlightDataManager) {
            this.highlights = await this.highlightDataManager.loadFileHighlights(this.currentFile);
        } else {
            this.highlights = [];
        }
        
        // 保留原有的虚拟高亮和闪卡处理逻辑
        const storedComments = this.commentStore.getFileComments(this.currentFile);
        const usedCommentIds = new Set<string>();
        
        // 标记已使用的评论ID
        this.highlights.forEach(h => {
            if (h.id) usedCommentIds.add(h.id);
        });
        
        // 添加虚拟高亮（这部分逻辑保留在这里，因为它依赖于 this.highlights）
        const virtualHighlights = storedComments
            .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
        
        const uniqueVirtualHighlights = virtualHighlights.filter(vh => {
            return !this.highlights.some(h => h.text === vh.text);
        });
        
        uniqueVirtualHighlights.forEach(vh => usedCommentIds.add(vh.id));
        this.highlights.unshift(...uniqueVirtualHighlights);
        
        // Canvas 标记处理
        if (isInCanvas && this.currentFile) {
            this.highlights.forEach(highlight => {
                highlight.isFromCanvas = true;
                highlight.isGlobalSearch = true;
                highlight.fileName = this.currentFile?.name;
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
        if (this.canvasProcessor) {
            this.highlights = await this.canvasProcessor.processCanvasFile(file);
            this.renderHighlights(this.highlights);
        }
    }
    
}

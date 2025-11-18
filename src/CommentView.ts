import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, Menu, setIcon, getIcon, debounce } from "obsidian";
import { CanvasService } from './services/CanvasService';
import { FlashcardComponent } from './flashcard/components/FlashcardComponent';
import { FlashcardState } from './flashcard/types/FSRSTypes';
import { CommentStore, HiNote, CommentItem } from './CommentStore';
import { ExportPreviewModal } from './templates/ExportModal';
import { HighlightInfo, CommentUpdateEvent } from './types';
import { HighlightCard } from './components/highlight/HighlightCard';
import CommentPlugin from '../main';
import { AIServiceManager } from './services/ai';
import { HighlightService } from './services/HighlightService';
import { AIButton } from './components/AIButton';
import { LocationService } from './services/LocationService';
import { ExportService } from './services/ExportService';
import { CommentInput } from './components/comment/CommentInput';
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
// 新增的 Manager
import { ExportManager } from './view/export/ExportManager';
import { VirtualHighlightManager } from './view/highlight/VirtualHighlightManager';
import { InfiniteScrollManager } from './view/scroll/InfiniteScrollManager';
import { FlashcardViewManager } from './view/flashcard/FlashcardViewManager';
import { DeviceManager } from './view/device/DeviceManager';
import { UIInitializer, UIElements } from './view/ui/UIInitializer';
import { EventCoordinator } from './view/events/EventCoordinator';
import { CallbackConfigurator } from './view/config/CallbackConfigurator';

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
    private loadingIndicator: HTMLElement;
    private aiButtons: AIButton[] = []; // 添加一个数组来跟踪所有的 AIButton 实例
    private currentEditingHighlightId: string | null | undefined = null;
    private flashcardComponent: FlashcardComponent | null = null;
    private canvasService: CanvasService;
    // Canvas 高亮处理器
    private canvasProcessor: CanvasHighlightProcessor | null = null;
    // 全局高亮管理器
    private allHighlightsManager: AllHighlightsManager | null = null;
    
    // === 新增的 Manager ===
    private exportManager: ExportManager | null = null;
    private virtualHighlightManager: VirtualHighlightManager | null = null;
    private infiniteScrollManager: InfiniteScrollManager | null = null;
    private flashcardViewManager: FlashcardViewManager | null = null;
    private deviceManager: DeviceManager | null = null;
    private uiInitializer: UIInitializer | null = null;
    private eventCoordinator: EventCoordinator | null = null;
    private callbackConfigurator: CallbackConfigurator | null = null;
    
    // UI 元素（从 UIInitializer 获取）
    private uiElements: UIElements | null = null;

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
        // 初始化 LocationService（已移除 TextSimilarityService 依赖）
        this.locationService = new LocationService(this.app);
        this.exportService = new ExportService(this.app, this.commentStore);
        // 使用插件提供的共享服务实例，避免重复创建
        this.highlightService = this.plugin.highlightService;
        this.licenseManager = new LicenseManager(this.plugin);
        this.canvasService = this.plugin.canvasService;
        
        // === 初始化新 Manager（需要在事件注册前初始化）===
        this.deviceManager = new DeviceManager();
        this.uiInitializer = new UIInitializer();
        this.eventCoordinator = new EventCoordinator(this.app, this);
        this.callbackConfigurator = new CallbackConfigurator();
        this.exportManager = new ExportManager(this.app, this.exportService);
        this.virtualHighlightManager = new VirtualHighlightManager(this.commentStore);
        this.flashcardViewManager = new FlashcardViewManager(this.app, this.plugin);
        
        // 使用 EventCoordinator 注册所有事件
        this.eventCoordinator.setCallbacks({
            onFileOpen: (file, isInCanvas) => {
                this.currentFile = file;
                this.updateHighlights(isInCanvas);
            },
            onFileModify: (file, isInCanvas) => {
                if (this.fileListManager) {
                    this.fileListManager.invalidateCache();
                }
                this.updateHighlights(isInCanvas);
            },
            onFileCreate: () => {
                if (this.fileListManager) {
                    this.fileListManager.invalidateCache();
                }
            },
            onFileDelete: () => {
                if (this.fileListManager) {
                    this.fileListManager.invalidateCache();
                }
            },
            onLayoutChange: () => {
                this.checkViewPosition();
            },
            onCommentInput: (highlightId, text) => {
                this.eventCoordinator!.handleCommentInputDisplay(
                    highlightId,
                    text,
                    this.highlightContainer,
                    (card, highlight) => this.showCommentInput(card, highlight)
                );
            }
        });
        
        this.eventCoordinator.registerAllEvents(
            () => this.currentFile,
            () => this.isDraggedToMainView
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

        // 使用 VirtualHighlightManager 创建文件评论按钮
        if (this.virtualHighlightManager) {
            this.virtualHighlightManager.createFileCommentButton(
                iconButtonsContainer,
                {
                    getCurrentFile: () => this.currentFile,
                    getHighlights: () => this.highlights,
                    onVirtualHighlightCreated: (vh) => {
                        this.highlights.unshift(vh);
                        this.renderHighlights(this.highlights);
                    },
                    onShowCommentInput: (card, highlight) => this.showCommentInput(card, highlight),
                    getHighlightContainer: () => this.highlightContainer
                }
            );
        }

        // 使用 ExportManager 创建导出按钮
        if (this.exportManager) {
            this.exportManager.createExportButton(
                iconButtonsContainer,
                () => this.currentFile
            );
        }

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
                
                // 强制清空容器并移除 flashcard-mode 类，防止异步渲染竞态条件
                this.highlightContainer.empty();
                this.highlightContainer.removeClass('flashcard-mode');
                
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
                
                // 强制清空容器并移除 flashcard-mode 类，防止异步渲染竞态条件
                this.highlightContainer.empty();
                this.highlightContainer.removeClass('flashcard-mode');
                
                this.fileListManager!.updateState({
                    currentFile: this.currentFile,
                    isFlashcardMode: this.isFlashcardMode
                });
                this.fileListManager!.updateFileListSelection();
                this.searchContainer.removeClass('highlight-display-none');
                // 在全部高亮视图下隐藏添加文件批注和导出为笔记按钮
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.addClass('highlight-display-none');
                }
                if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                    this.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.updateAllHighlights();
            },
            onRefreshView: async () => {
                // 根据当前状态刷新对应的视图
                if (this.isFlashcardMode) {
                    // 刷新闪卡视图
                    if (this.flashcardComponent) {
                        await this.flashcardComponent.activate();
                    }
                } else if (this.currentFile === null) {
                    // 刷新全部高亮视图
                    await this.updateAllHighlights();
                } else {
                    // 刷新单文件高亮视图
                    await this.updateHighlights();
                }
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
            },
            onCardUpdate: (highlight) => {
                // 同步更新 this.highlights 数组中的数据
                const index = this.highlights.findIndex(h => h.id === highlight.id);
                if (index !== -1) {
                    this.highlights[index] = highlight;
                }
                
                // 只更新单个卡片，而不是刷新整个视图
                const cardInstance = HighlightCard.findCardInstanceByHighlightId(highlight.id || '');
                if (cardInstance) {
                    cardInstance.updateComments(highlight);
                }
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
            onCreateFloatingButton: () => {},
            onRemoveFloatingButton: () => {},
            onUpdateFileList: async (forceRefresh?: boolean) => {
                if (this.fileListManager) {
                    this.fileListManager.updateState({
                        currentFile: this.currentFile,
                        isFlashcardMode: this.isFlashcardMode,
                        isMobileView: this.isMobileView,
                        isSmallScreen: this.isSmallScreen,
                        isDraggedToMainView: this.isDraggedToMainView
                    });
                    await this.fileListManager.updateFileList(forceRefresh);
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
                    // 拖拽到主视图（使用 DeviceManager）
                    if (this.deviceManager) {
                        const deviceInfo = this.deviceManager.getDeviceInfo();
                        if (deviceInfo.isMobile && deviceInfo.isSmallScreen) {
                            this.isShowingFileList = true;
                        }
                    } else if (this.layoutManager) {
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
        
        // 使用 EventCoordinator 注册键盘事件
        if (this.eventCoordinator) {
            this.eventCoordinator.registerKeyboardEvents(this.highlightContainer);
        }

        // 初始化 InfiniteScrollManager
        if (!this.infiniteScrollManager) {
            this.infiniteScrollManager = new InfiniteScrollManager(this.highlightContainer);
            this.infiniteScrollManager.setLoadingIndicator(this.loadingIndicator);
        }

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
        if (this.highlightRenderManager && this.flashcardViewManager) {
            this.highlightRenderManager.updateState({
                currentFile: this.currentFile,
                isDraggedToMainView: this.isDraggedToMainView,
                highlightsWithFlashcards: this.flashcardViewManager.getFlashcardMarkers(),
                currentBatch: this.infiniteScrollManager?.getCurrentBatch() || 0
            });
            this.highlightRenderManager.renderHighlights(
                highlightsToRender,
                append,
                this.selectionManager ?? undefined
            );
            // 同步 currentBatch 到 InfiniteScrollManager
            if (this.infiniteScrollManager) {
                this.infiniteScrollManager.setCurrentBatch(
                    this.highlightRenderManager.getCurrentBatch()
                );
            }
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

    // 修改导出图片功能的方法签名 - 使用 ExportManager
    private async exportHighlightAsImage(highlight: HighlightInfo & { comments?: CommentItem[] }) {
        if (this.exportManager) {
            await this.exportManager.exportHighlightAsImage(highlight);
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
            
            // 同步设备信息（使用 DeviceManager）
            if (this.deviceManager) {
                const deviceInfo = this.deviceManager.getDeviceInfo();
                this.isMobileView = deviceInfo.isMobile;
                this.isSmallScreen = deviceInfo.isSmallScreen;
            } else {
                const deviceInfo = this.layoutManager.getDeviceInfo();
                this.isMobileView = deviceInfo.isMobile;
                this.isSmallScreen = deviceInfo.isSmallScreen;
            }
        }
    }

    // 添加新方法来更新全部高亮
    private async updateAllHighlights(searchTerm: string = '', searchType: string = '') {
        // 重置批次计数（使用 InfiniteScrollManager）
        if (this.infiniteScrollManager) {
            this.infiniteScrollManager.reset();
        }
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
     * 加载更多高亮 - 使用 InfiniteScrollManager
     */
    private async loadMoreHighlights() {
        if (this.infiniteScrollManager) {
            await this.infiniteScrollManager.loadMoreHighlights(
                this.highlights,
                async (batch, append) => await this.renderHighlights(batch, append)
            );
        }
    }
    
    /**
     * 加载内容直到容器可滚动 - 使用 InfiniteScrollManager
     */
    private async loadUntilScrollable() {
        if (this.infiniteScrollManager) {
            await this.infiniteScrollManager.loadUntilScrollable(
                this.highlights,
                async (batch, append) => await this.renderHighlights(batch, append)
            );
        }
    }
    
    /**
     * 设置无限滚动加载 - 使用 InfiniteScrollManager
     */
    private setupInfiniteScroll() {
        if (this.infiniteScrollManager) {
            this.infiniteScrollManager.setupInfiniteScroll(
                this.highlights,
                async (batch, append) => await this.renderHighlights(batch, append)
            );
        }
    }


    // 在 onunload 方法中确保清理
    onunload() {
        
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
        
        // 使用 VirtualHighlightManager 处理虚拟高亮
        if (this.virtualHighlightManager && this.currentFile) {
            const virtualHighlights = this.virtualHighlightManager.filterVirtualHighlights(
                this.currentFile,
                this.highlights
            );
            this.highlights.unshift(...virtualHighlights);
        }
        
        // Canvas 标记处理
        if (isInCanvas && this.currentFile) {
            this.highlights.forEach(highlight => {
                highlight.isFromCanvas = true;
                highlight.isGlobalSearch = true;
                highlight.fileName = this.currentFile?.name;
            });
        }
        
        // 使用 FlashcardViewManager 更新闪卡标记
        if (this.flashcardViewManager) {
            this.flashcardViewManager.updateFlashcardMarkers(this.highlights);
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

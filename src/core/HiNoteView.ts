import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, Menu, setIcon, getIcon, debounce } from "obsidian";
import { CanvasService } from '../services/CanvasService';
import { FlashcardComponent } from '../flashcard/components/FlashcardComponent';
import { FlashcardState } from '../flashcard/types/FSRSTypes';
import { HighlightInfo as HiNote, CommentItem } from '../types';
import { HighlightManager } from '../services/HighlightManager';
import { HighlightRepository } from '../repositories/HighlightRepository';
import { ExportPreviewModal } from '../templates/ExportModal';
import { HighlightInfo, CommentUpdateEvent } from '../types';
import { HighlightCard } from '../components/highlight/HighlightCard';
import CommentPlugin from '../../main';
import { AIServiceManager } from '../services/ai';
import { HighlightService } from '../services/HighlightService';
import { AIButton } from '../components/AIButton';
import { LocationService } from '../services/LocationService';
import { ExportService } from '../services/ExportService';
import { CommentInput } from '../components/comment/CommentInput';
import {t} from "../i18n";
import { LicenseManager } from '../services/LicenseManager';
import { IdGenerator } from '../utils/IdGenerator';
import { SearchUIManager } from '../views/managers/SearchUIManager';
import { SelectionManager } from '../views/selection/SelectionManager';
import { BatchOperationsHandler } from '../views/selection/BatchOperationsHandler';
import { FileListManager } from '../views/managers/FileListManager';
import { HighlightRenderManager } from '../views/highlight/HighlightRenderManager';
import { HighlightDataService } from '../services/highlight/HighlightDataService';
import { CommentService } from '../services/comment/CommentService';
import { CommentInputManager } from '../views/highlight/CommentInputManager';
import { LayoutManager } from '../views/layout/LayoutManager';
import { ViewPositionDetector } from '../views/layout/ViewPositionDetector';
import { CanvasHighlightProcessor } from '../views/highlight/CanvasHighlightProcessor';
import { GlobalHighlightService } from '../services/highlight/GlobalHighlightService';
import { ExportManager } from '../views/highlight/ExportManager';
import { VirtualHighlightManager } from '../views/highlight/VirtualHighlightManager';
import { InfiniteScrollManager } from '../views/highlight/InfiniteScrollManager';
import { FlashcardViewManager } from '../views/highlight/FlashcardViewManager';
import { DeviceManager } from '../views/managers/DeviceManager';
import { UIInitializer, UIElements } from '../views/managers/UIInitializer';
import { EventCoordinator } from '../views/managers/EventCoordinator';
import { CallbackConfigurator } from '../views/managers/CallbackConfigurator';
import { ViewState } from './ViewState';

export const VIEW_TYPE_HINOTE = "hinote-view";

/**
 * HiNote 主视图
 * 负责显示和管理高亮、评论、闪卡等核心功能
 */
export class HiNoteView extends ItemView {
    // === 常量定义 ===
    private static readonly CANVAS_UPDATE_DELAY = 10; // Canvas 更新延迟（毫秒）
    private static readonly COMMENT_INPUT_DELAY = 100; // 评论输入延迟（毫秒）

    // === 视图状态（集中管理） ===
    private state = new ViewState();

    // === 核心服务 ===
    private plugin: CommentPlugin;
    private highlightManager: HighlightManager;
    private highlightRepository: HighlightRepository;
    private locationService: LocationService;
    private exportService: ExportService;
    private highlightService: HighlightService;
    private licenseManager: LicenseManager;
    private canvasService: CanvasService;

    // === 功能管理器 ===
    private searchUIManager: SearchUIManager | null = null;
    private selectionManager: SelectionManager | null = null;
    private batchOperationsHandler: BatchOperationsHandler | null = null;
    private fileListManager: FileListManager | null = null;
    private highlightRenderManager: HighlightRenderManager | null = null;
    private highlightDataService: HighlightDataService | null = null;
    private commentService: CommentService | null = null;
    private commentInputManager: CommentInputManager | null = null;
    private layoutManager: LayoutManager | null = null;
    private viewPositionDetector: ViewPositionDetector | null = null;
    private canvasProcessor: CanvasHighlightProcessor | null = null;
    private globalHighlightService: GlobalHighlightService | null = null;

    // === 重构新增的 Manager ===
    private exportManager: ExportManager | null = null;
    private virtualHighlightManager: VirtualHighlightManager | null = null;
    private infiniteScrollManager: InfiniteScrollManager | null = null;
    private flashcardViewManager: FlashcardViewManager | null = null;
    private deviceManager: DeviceManager | null = null;
    private uiInitializer: UIInitializer | null = null;
    private eventCoordinator: EventCoordinator | null = null;
    private callbackConfigurator: CallbackConfigurator | null = null;

    // === UI 元素（在 onOpen 中初始化）===
    private highlightContainer!: HTMLElement;
    private searchContainer!: HTMLElement;
    private fileListContainer!: HTMLElement;
    private mainContentContainer!: HTMLElement;
    private searchInput!: HTMLInputElement;
    private searchLoadingIndicator!: HTMLElement;
    private loadingIndicator!: HTMLElement;

    // === 组件实例 ===
    private flashcardComponent: FlashcardComponent | null = null;
    private aiButtons: AIButton[] = [];

    constructor(leaf: WorkspaceLeaf, highlightManager: HighlightManager, highlightRepository: HighlightRepository) {
        super(leaf);
        this.highlightManager = highlightManager;
        this.highlightRepository = highlightRepository;
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
        this.exportService = new ExportService(this.app, this.highlightRepository);
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
        this.virtualHighlightManager = new VirtualHighlightManager(this.highlightManager);
        this.flashcardViewManager = new FlashcardViewManager(this.app, this.plugin);
        
        // 使用 EventCoordinator 注册所有事件
        this.eventCoordinator.setCallbacks({
            onFileOpen: (file, isInCanvas) => {
                this.state.currentFile = file;
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
            () => this.state.currentFile,
            () => this.state.isDraggedToMainView
        );
    }

    getViewType(): string {
        return VIEW_TYPE_HINOTE;
    }

    getDisplayText(): string {
        return "HiNote";
    }

    getIcon(): string {
        return "highlighter";  // 使用与左侧功能区相同的图标
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        
        // 监听多选事件
        container.addEventListener('highlight-multi-select', ((e: CustomEvent) => {
            if (this.selectionManager) {
                this.selectionManager.updateSelectedHighlights();
            }
        }) as EventListener);

        // 使用 UIInitializer 创建所有 UI 元素
        const uiElements = this.uiInitializer!.initializeUI(container);
        
        // 保存 UI 元素引用
        this.fileListContainer = uiElements.fileListContainer;
        this.mainContentContainer = uiElements.mainContentContainer;
        this.searchContainer = uiElements.searchContainer;
        this.searchInput = uiElements.searchInput;
        this.searchLoadingIndicator = uiElements.searchLoadingIndicator;
        this.highlightContainer = uiElements.highlightContainer;
        this.loadingIndicator = uiElements.loadingIndicator;
        
        // 设置返回按钮点击事件
        uiElements.backButton.addEventListener("click", () => {
            if (this.state.isMobileView && this.state.isSmallScreen && this.state.isDraggedToMainView) {
                // 如果在闪卡模式下，实现逐级返回
                if (this.state.isFlashcardMode && this.flashcardComponent) {
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
                this.state.isShowingFileList = true;
                this.updateViewLayout();
            }
        });

        // 使用 VirtualHighlightManager 创建文件评论按钮
        if (this.virtualHighlightManager) {
            this.virtualHighlightManager.createFileCommentButton(
                uiElements.iconButtonsContainer,
                {
                    getCurrentFile: () => this.state.currentFile,
                    getHighlights: () => this.state.highlights,
                    onVirtualHighlightCreated: (vh) => {
                        this.state.highlights.unshift(vh);
                        this.renderHighlights(this.state.highlights);
                    },
                    onShowCommentInput: (card, highlight) => this.showCommentInput(card, highlight),
                    getHighlightContainer: () => this.highlightContainer
                }
            );
        }

        // 使用 ExportManager 创建导出按钮
        if (this.exportManager) {
            this.exportManager.createExportButton(
                uiElements.iconButtonsContainer,
                () => this.state.currentFile
            );
        }

        // 初始化搜索 UI 管理器
        this.searchUIManager = new SearchUIManager(
            this.plugin,
            this.searchInput,
            this.searchLoadingIndicator,
            this.searchContainer
        );
        
        // 使用 CallbackConfigurator 配置搜索 UI 管理器回调
        if (this.callbackConfigurator) {
            this.callbackConfigurator.configureSearchUIManager(this.searchUIManager, {
                onSearch: async (searchTerm: string, searchType: string) => {
                    await this.handleSearch(searchTerm, searchType);
                },
                getHighlights: () => this.state.highlights,
                getCurrentFile: () => this.state.currentFile
            });
        }
        
        // 初始化搜索功能
        this.searchUIManager.initialize();
        
        // 初始化多选管理器
        this.selectionManager = new SelectionManager(this.highlightContainer);
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

        // 使用 CallbackConfigurator 配置批量操作和选择管理器回调
        if (this.callbackConfigurator) {
            this.callbackConfigurator.configureSelectionManager(
                this.selectionManager,
                this.batchOperationsHandler
            );
            
            this.callbackConfigurator.configureBatchOperationsHandler(
                this.batchOperationsHandler,
                {
                    getSelectedHighlights: () => this.selectionManager!.getSelectedHighlights(),
                    clearSelection: () => this.selectionManager!.clearSelection(),
                    refreshView: async () => await this.refreshView()
                }
            );
        }
        
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
                this.state.currentFile = file;
                this.state.isFlashcardMode = false;
                if (this.flashcardComponent) {
                    this.flashcardComponent.deactivate();
                    this.flashcardComponent = null;
                }
                
                // 强制清空容器并移除 flashcard-mode 类，防止异步渲染竞态条件
                this.highlightContainer.empty();
                this.highlightContainer.removeClass('flashcard-mode');
                
                this.fileListManager!.updateState({
                    currentFile: this.state.currentFile,
                    isFlashcardMode: this.state.isFlashcardMode
                });
                this.fileListManager!.updateFileListSelection();
                this.searchContainer.removeClass('highlight-display-none');
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.removeClass('highlight-display-none');
                }
                if (this.state.isMobileView && this.state.isSmallScreen && this.state.isDraggedToMainView) {
                    this.state.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.updateHighlights();
            },
            onFlashcardModeToggle: async (enabled: boolean) => {
                this.state.currentFile = null;
                this.state.isFlashcardMode = enabled;
                this.fileListManager!.updateState({
                    currentFile: this.state.currentFile,
                    isFlashcardMode: this.state.isFlashcardMode
                });
                this.fileListManager!.updateFileListSelection();
                this.searchContainer.addClass('highlight-display-none');
                this.highlightContainer.empty();
                if (!this.flashcardComponent) {
                    this.flashcardComponent = new FlashcardComponent(this.highlightContainer, this.plugin);
                    this.flashcardComponent.setLicenseManager(this.licenseManager);
                }
                if (this.state.isMobileView && this.state.isSmallScreen && this.state.isDraggedToMainView) {
                    this.state.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.flashcardComponent.activate();
            },
            onAllHighlightsSelect: async () => {
                this.state.currentFile = null;
                this.state.isFlashcardMode = false;
                if (this.flashcardComponent) {
                    this.flashcardComponent.deactivate();
                    this.flashcardComponent = null;
                }
                
                // 强制清空容器并移除 flashcard-mode 类，防止异步渲染竞态条件
                this.highlightContainer.empty();
                this.highlightContainer.removeClass('flashcard-mode');
                
                this.fileListManager!.updateState({
                    currentFile: this.state.currentFile,
                    isFlashcardMode: this.state.isFlashcardMode
                });
                this.fileListManager!.updateFileListSelection();
                this.searchContainer.removeClass('highlight-display-none');
                // 在全部高亮视图下隐藏添加文件批注和导出为笔记按钮
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.addClass('highlight-display-none');
                }
                if (this.state.isMobileView && this.state.isSmallScreen && this.state.isDraggedToMainView) {
                    this.state.isShowingFileList = false;
                    this.updateViewLayout();
                }
                await this.updateAllHighlights();
            },
            onRefreshView: async () => {
                // 根据当前状态刷新对应的视图
                if (this.state.isFlashcardMode) {
                    // 刷新闪卡视图
                    if (this.flashcardComponent) {
                        await this.flashcardComponent.activate();
                    }
                } else if (this.state.currentFile === null) {
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
                if (this.commentService) {
                    this.commentService.updateState({
                        currentFile: this.state.currentFile,
                        highlights: this.state.highlights
                    });
                    await this.commentService.addComment(h, content);
                }
                await this.updateHighlights();
            }
        });
        
        // 初始化高亮数据服务
        this.highlightDataService = new HighlightDataService(
            this.app,
            this.highlightService,
            this.highlightRepository
        );
        
        // 初始化评论服务
        this.commentService = new CommentService(
            this.app,
            this.plugin,
            this.highlightManager
        );
        
        // 初始化评论输入管理器
        this.commentInputManager = new CommentInputManager(this.plugin);
        
        // 使用 CallbackConfigurator 配置评论管理器回调
        if (this.callbackConfigurator) {
            this.callbackConfigurator.configureCommentService(
                this.commentService!,
                {
                    onRefreshView: async () => await this.refreshView(),
                    onHighlightsUpdate: (highlights) => {
                        this.state.highlights = highlights;
                    },
                    onCardUpdate: (highlight) => {
                        // 同步更新 this.state.highlights 数组中的数据
                        const index = this.state.highlights.findIndex(h => h.id === highlight.id);
                        if (index !== -1) {
                            this.state.highlights[index] = highlight;
                        }
                        
                        // 只更新单个卡片，而不是刷新整个视图
                        const cardInstance = HighlightCard.findCardInstanceByHighlightId(highlight.id || '');
                        if (cardInstance) {
                            cardInstance.updateComments(highlight);
                        }
                    }
                }
            );
            
            this.callbackConfigurator.configureCommentInputManager(
                this.commentInputManager,
                {
                    onCommentSave: async (highlight, content, existingComment) => {
                        if (this.commentService) {
                            this.commentService.updateState({
                                currentFile: this.state.currentFile,
                                highlights: this.state.highlights
                            });
                            if (existingComment) {
                                await this.commentService.updateComment(highlight, existingComment.id, content);
                            } else {
                                await this.commentService.addComment(highlight, content);
                            }
                        }
                    },
                    onCommentDelete: async (highlight, commentId) => {
                        if (this.commentService) {
                            this.commentService.updateState({
                                currentFile: this.state.currentFile,
                                highlights: this.state.highlights
                            });
                            await this.commentService.deleteComment(highlight, commentId);
                        }
                    },
                    onCommentCancel: async (highlight) => {
                        if (highlight.isVirtual && (!highlight.comments || highlight.comments.length === 0)) {
                            if (this.commentService) {
                                this.commentService.updateState({
                                    currentFile: this.state.currentFile,
                                    highlights: this.state.highlights
                                });
                                await this.commentService.deleteVirtualHighlight(highlight);
                            }
                        }
                    },
                    onViewUpdate: async () => await this.updateHighlights()
                }
            );
        }
        
        // 初始化布局管理器
        this.layoutManager = new LayoutManager(
            this.containerEl,
            this.fileListContainer,
            this.mainContentContainer,
            this.searchContainer
        );
        
        // 使用 CallbackConfigurator 配置布局管理器回调
        if (this.callbackConfigurator) {
            this.callbackConfigurator.configureLayoutManager(this.layoutManager, {
                onCreateFloatingButton: () => {},
                onRemoveFloatingButton: () => {},
                onUpdateFileList: async (forceRefresh?: boolean) => {
                    if (this.fileListManager) {
                        this.fileListManager.updateState({
                            currentFile: this.state.currentFile,
                            isFlashcardMode: this.state.isFlashcardMode,
                            isMobileView: this.state.isMobileView,
                            isSmallScreen: this.state.isSmallScreen,
                            isDraggedToMainView: this.state.isDraggedToMainView
                        });
                        await this.fileListManager.updateFileList(forceRefresh);
                    }
                }
            });
        }
        
        // 初始化视图位置检测器
        this.viewPositionDetector = new ViewPositionDetector(this.app, this.leaf);
        
        // 初始化全局高亮服务
        this.globalHighlightService = new GlobalHighlightService(
            this.app,
            this.highlightService,
            this.highlightRepository
        );
        
        // 初始化 Canvas 处理器
        this.canvasProcessor = new CanvasHighlightProcessor(
            this.app,
            this.canvasService,
            this.highlightDataService!
        );
        
        // 使用 CallbackConfigurator 配置 Canvas 处理器回调
        if (this.callbackConfigurator) {
            this.callbackConfigurator.configureCanvasProcessor(this.canvasProcessor, {
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
        }
        
        this.viewPositionDetector.setCallbacks({
            onPositionChange: async (isInMainView, wasInAllHighlightsView) => {
                this.state.isDraggedToMainView = isInMainView;
                
                if (isInMainView) {
                    // 拖拽到主视图（使用 DeviceManager）
                    const deviceInfo = this.deviceManager!.getDeviceInfo();
                    if (deviceInfo.isMobile && deviceInfo.isSmallScreen) {
                        this.state.isShowingFileList = true;
                    }
                    
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile) {
                        this.state.currentFile = activeFile;
                        await this.updateHighlights();
                    } else {
                        this.state.currentFile = null;
                        await this.updateAllHighlights();
                    }
                    
                    if (this.fileListManager) {
                        this.fileListManager.updateState({
                            currentFile: this.state.currentFile,
                            isFlashcardMode: this.state.isFlashcardMode
                        });
                        this.fileListManager.updateFileListSelection();
                    }
                } else {
                    // 切换到侧边栏
                    if (this.state.isFlashcardMode) {
                        this.state.isFlashcardMode = false;
                        if (this.flashcardComponent) {
                            this.flashcardComponent.deactivate();
                            this.flashcardComponent = null;
                        }
                        if (this.fileListManager) {
                            this.fileListManager.updateState({
                                currentFile: this.state.currentFile,
                                isFlashcardMode: this.state.isFlashcardMode
                            });
                            this.fileListManager.updateFileListSelection();
                        }
                    }
                    
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile) {
                        if (wasInAllHighlightsView) {
                            this.state.currentFile = activeFile;
                            this.highlightContainer.empty();
                            this.highlightContainer.appendChild(this.loadingIndicator);
                            setTimeout(() => {
                                this.updateHighlights();
                            }, HiNoteView.CANVAS_UPDATE_DELAY);
                        } else {
                            this.state.currentFile = activeFile;
                            this.updateHighlights();
                        }
                    } else {
                        this.state.highlights = [];
                        this.renderHighlights([]);
                    }
                }
                
                // 更新布局
                if (this.layoutManager) {
                    this.layoutManager.updateState({
                        isDraggedToMainView: this.state.isDraggedToMainView,
                        isFlashcardMode: this.state.isFlashcardMode,
                        isShowingFileList: this.state.isShowingFileList
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
            this.state.currentFile = activeFile;
            await this.updateHighlights();
        }

        // 更新视图布局
        this.updateViewLayout();
        this.highlightContainer.empty();

        // 过滤并显示高亮评论
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const filteredHighlights = this.state.highlights.filter(highlight => {
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
            if (this.state.currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
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
                currentFile: this.state.currentFile,
                isDraggedToMainView: this.state.isDraggedToMainView,
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
        if (this.state.isDraggedToMainView) {
            // 如果在视图中，则不执行转
            return;
        }

        // 如果是全局搜索结果，静默禁止跳转
        if (highlight.isGlobalSearch) {
            return;
        }

        if (!this.state.currentFile) {
            new Notice(t("No corresponding file found."));
            return;
        }
        await this.locationService.jumpToHighlight(highlight, this.state.currentFile.path);
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
                isDraggedToMainView: this.state.isDraggedToMainView,
                isFlashcardMode: this.state.isFlashcardMode,
                isShowingFileList: this.state.isShowingFileList
            });
            await this.layoutManager.updateViewLayout();
            
            // 同步设备信息（使用 DeviceManager）
            const deviceInfo = this.deviceManager!.getDeviceInfo();
            this.state.isMobileView = deviceInfo.isMobile;
            this.state.isSmallScreen = deviceInfo.isSmallScreen;
        }
    }

    // 添加新方法来更新全部高亮
    private async updateAllHighlights(searchTerm: string = '', searchType: string = '') {
        // 重置批次计数（使用 InfiniteScrollManager）
        if (this.infiniteScrollManager) {
            this.infiniteScrollManager.reset();
        }
        this.state.highlights = [];

        // 清空容器并添加加载指示
        this.highlightContainer.empty();
        this.highlightContainer.appendChild(this.loadingIndicator);

        try {
            // 使用 AllHighlightsManager 加载所有高亮
            if (this.globalHighlightService) {
                this.state.highlights = await this.globalHighlightService.updateAllHighlights(searchTerm, searchType);
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
                this.state.highlights,
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
                this.state.highlights,
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
                this.state.highlights,
                async (batch, append) => await this.renderHighlights(batch, append)
            );
        }
    }


    // 在 onunload 方法中确保清理
    onunload() {
        // 清理有 destroy 方法的管理器
        this.searchUIManager?.destroy();
        this.selectionManager?.destroy();
        this.batchOperationsHandler?.destroy();
        this.fileListManager?.destroy();
        this.highlightRenderManager?.clear();
        this.commentInputManager?.clearEditingState();
        
        // 置空所有管理器引用
        this.searchUIManager = null;
        this.selectionManager = null;
        this.batchOperationsHandler = null;
        this.fileListManager = null;
        this.highlightRenderManager = null;
        this.highlightDataService = null;
        this.commentService = null;
        this.commentInputManager = null;
        this.layoutManager = null;
        this.viewPositionDetector = null;
        this.canvasProcessor = null;
        this.globalHighlightService = null;
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
        return this.state.currentFile === null;
    }
    
    // 添加方法来更新高亮列表显示（搜索筛选）

    
    /**
     * 处理搜索请求
     * 由 SearchManager 调用
     */
    private async handleSearch(searchTerm: string, searchType: string) {
        try {
            // 检查是否需要恢复到当前文件视图
            const wasGlobalSearch = this.state.highlights.some(h => h.isGlobalSearch);
            if (wasGlobalSearch && searchType !== 'all' && searchType !== 'path' && this.state.currentFile) {
                // 恢复到当前文件视图
                this.highlightContainer.empty();
                this.highlightContainer.appendChild(this.loadingIndicator);
                
                // 重新加载当前文件的高亮
                await this.updateHighlights();
                
                // 标记所有高亮为非全局搜索结果
                this.state.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                
                // 使用实际搜索词过滤
                const filteredHighlights = this.searchUIManager!.filterHighlightsByTerm(searchTerm, searchType);
                
                // 更新显示
                this.renderHighlights(filteredHighlights);
                return;
            }
            
            // 如果是全局搜索或路径搜索，且不在全局视图中
            if ((searchType === 'all' || searchType === 'path') && this.state.currentFile !== null) {
                // 显示加载指示器
                this.highlightContainer.empty();
                this.highlightContainer.appendChild(this.loadingIndicator);
                
                // 保存当前文件引用
                const originalFile = this.state.currentFile;
                
                try {
                    // 临时设置为 null 以启用全局搜索
                    this.state.currentFile = null;
                    
                    // 直接使用索引搜索
                    await this.updateAllHighlights(searchTerm, searchType);
                    
                    // 标记所有高亮为全局搜索结果
                    this.state.highlights.forEach(highlight => {
                        highlight.isGlobalSearch = true;
                    });
                    
                    // 直接渲染索引搜索结果
                    this.renderHighlights(this.state.highlights);
                } finally {
                    // 恢复原始文件引用
                    this.state.currentFile = originalFile;
                }
            } else {
                // 常规搜索逻辑
                this.state.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                
                const filteredHighlights = this.searchUIManager!.filterHighlightsByTerm(searchTerm, searchType);
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
        if (!this.state.currentFile) {
            this.renderHighlights([]);
            return;
        }
        
        // 检查是否是 Canvas 文件
        if (this.state.currentFile.extension === 'canvas') {
            // 如果是 Canvas 文件，使用专门的处理方法
            await this.handleCanvasFile(this.state.currentFile);
            return;
        }

        // 使用 HighlightDataManager 加载数据
        if (this.highlightDataService) {
            this.state.highlights = await this.highlightDataService.loadFileHighlights(this.state.currentFile);
        } else {
            this.state.highlights = [];
        }
        
        // 使用 VirtualHighlightManager 处理虚拟高亮
        if (this.virtualHighlightManager && this.state.currentFile) {
            const virtualHighlights = await this.virtualHighlightManager.filterVirtualHighlights(
                this.state.currentFile,
                this.state.highlights
            );
            this.state.highlights.unshift(...virtualHighlights);
        }
        
        // Canvas 标记处理
        if (isInCanvas && this.state.currentFile) {
            this.state.highlights.forEach(highlight => {
                highlight.isFromCanvas = true;
                highlight.isGlobalSearch = true;
                highlight.fileName = this.state.currentFile?.name;
            });
        }
        
        // 使用 FlashcardViewManager 更新闪卡标记
        if (this.flashcardViewManager) {
            this.flashcardViewManager.updateFlashcardMarkers(this.state.highlights);
        }
        
        // 检查搜索框是否有内容
        if (this.searchInput && this.searchInput.value.trim() !== '' && this.searchUIManager) {
            // 如果有搜索内容，使用搜索管理器过滤
            const searchValue = this.searchInput.value.toLowerCase().trim();
            const filteredHighlights = this.searchUIManager.filterHighlightsByTerm(searchValue, '');
            this.renderHighlights(filteredHighlights);
        } else {
            // 如果没有搜索内容，直接渲染所有高亮
            this.renderHighlights(this.state.highlights);
        }
    }

    // 处理 Canvas 文件的方法
    private async handleCanvasFile(file: TFile): Promise<void> {
        if (this.canvasProcessor) {
            this.state.highlights = await this.canvasProcessor.processCanvasFile(file);
            this.renderHighlights(this.state.highlights);
        }
    }
    
}

import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { CanvasService } from '../../services/CanvasService';
import { HighlightInfo } from '../../types/highlight';
import { HighlightManager } from '../../services/HighlightManager';
import { HighlightRepository } from '../../repositories/HighlightRepository';
import CommentPlugin from '../../../main';
import { HighlightService } from '../../services/HighlightService';
import { LocationService } from '../../services/LocationService';
import { ExportService } from '../../services/ExportService';
import {t} from "../../i18n";
import { LicenseManager } from '../../services/LicenseManager';
import { ExportManager, FlashcardViewManager, VirtualHighlightManager } from '../highlight';
import { DeviceManager, EventCoordinator, UIInitializer } from '../managers';
import { ViewState, type ViewSession } from './ViewState';
import { setupHiNoteView } from './HiNoteViewSetup';
import { HiNoteViewSetupResult } from './HiNoteViewSetupTypes';
import type { PluginServices } from '../../plugin/PluginServices';

export const VIEW_TYPE_HINOTE = "hinote-view";

/**
 * HiNote 主视图
 * 负责显示和管理高亮、评论、闪卡等核心功能
 */
export class HiNoteView extends ItemView {
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

    // === 视图装配产物 ===
    private closed = false;
    private setupResult: HiNoteViewSetupResult | null = null;
    private exportManager: ExportManager | null = null;
    private virtualHighlightManager: VirtualHighlightManager | null = null;
    private flashcardViewManager: FlashcardViewManager | null = null;
    private deviceManager: DeviceManager | null = null;
    private uiInitializer: UIInitializer | null = null;
    private eventCoordinator: EventCoordinator | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: CommentPlugin, services: PluginServices) {
        super(leaf);
        this.plugin = plugin;
        this.highlightManager = services.highlightManager;
        this.highlightRepository = services.highlightRepository;
        // 初始化 LocationService（已移除 TextSimilarityService 依赖）
        this.locationService = new LocationService(this.app);
        this.highlightService = services.highlightService;
        this.exportService = new ExportService(
            this.app,
            this.highlightRepository,
            this.highlightService,
            () => this.plugin.settings
        );
        this.licenseManager = new LicenseManager(this.plugin);
        this.canvasService = services.canvasService;
        
        // === 初始化新 Manager（需要在事件注册前初始化）===
        this.deviceManager = new DeviceManager();
        this.uiInitializer = new UIInitializer();
        this.eventCoordinator = new EventCoordinator(this.app, this, services.eventManager);
        this.exportManager = new ExportManager(this.app, this.exportService);
        this.virtualHighlightManager = new VirtualHighlightManager(this.highlightManager);
        this.flashcardViewManager = new FlashcardViewManager(this.app, this.plugin);
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

    isInMainWindowMode(): boolean {
        return this.state.isDraggedToMainView;
    }

    async setMainWindowMode(enabled: boolean, _refreshHighlights = false): Promise<void> {
        if (this.setupResult) await this.setupResult.viewPositionController.handlePositionChange(enabled);
        else this.state.setPlacement(enabled ? 'main' : 'sidebar');
    }

    getSessionState(): ViewSession {
        this.setupResult?.commentInputManager.suspendAll();
        return this.state.snapshot();
    }

    restoreSessionState(session: ViewSession): void {
        this.state.restore(session);
        if (this.setupResult) this.setupResult.searchInput.value = session.search;
    }

    async onOpen() {
        try {
            await this.plugin.ensureServicesInitialized();
        } catch (error) {
            new Notice('HiNote could not load its data. Check vault storage before editing.');
            console.error('[HiNote] View initialization failed:', error);
            return;
        }
        if (this.closed) return;
        const setup = await setupHiNoteView({
            app: this.app,
            component: this,
            leaf: this.leaf,
            containerEl: this.containerEl,
            state: this.state,
            plugin: this.plugin,
            highlightManager: this.highlightManager,
            highlightRepository: this.highlightRepository,
            highlightService: this.highlightService,
            licenseManager: this.licenseManager,
            exportService: this.exportService,
            canvasService: this.canvasService,
            deviceManager: this.deviceManager!,
            uiInitializer: this.uiInitializer!,
            eventCoordinator: this.eventCoordinator!,
            exportManager: this.exportManager!,
            virtualHighlightManager: this.virtualHighlightManager!,
            flashcardViewManager: this.flashcardViewManager!,
            jumpToHighlight: async (highlight) => await this.jumpToHighlight(highlight),
            checkViewPosition: async () => await this.checkViewPosition(),
            updateViewLayout: async () => await this.updateViewLayout()
        });
        if (this.closed) {
            setup.searchUIManager.destroy();
            setup.infiniteScrollManager.destroy();
            setup.commentInputManager.clearEditingState();
            setup.highlightRenderManager.destroy();
            setup.selectionManager.destroy();
            setup.fileListManager.destroy();
            setup.batchOperationsHandler.destroy();
            this.deviceManager?.destroy();
            this.flashcardViewManager?.destroy();
            return;
        }
        this.setupResult = setup;
        await this.checkViewPosition();
    }

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

    // 检查视图位置（使用 ViewPositionDetector）
    private async checkViewPosition() {
        if (this.setupResult) {
            const wasInAllHighlightsView = this.setupResult.highlightListController.isInAllHighlightsView();
            await this.setupResult.viewPositionDetector.checkViewPosition(wasInAllHighlightsView);
        }
    }
    
    // 更新视图布局（使用 LayoutManager）
    private async updateViewLayout() {
        if (!this.setupResult || this.state.disposed) return;
        const info = this.deviceManager!.getDeviceInfo();
        if (info.isMobile !== this.state.isMobileView || info.isSmallScreen !== this.state.isSmallScreen) {
            this.state.setViewport(info.isMobile, info.isSmallScreen);
        }
        await this.setupResult.layoutManager.updateViewLayout();
    }

    // 在 onunload 方法中确保清理
    onunload() {
        this.closed = true;
        this.setupResult?.commentInputManager.clearEditingState();
        this.state.dispose();
        this.setupResult?.infiniteScrollManager.destroy();
        this.flashcardViewManager?.destroy();
        // 清理有 destroy 方法的管理器
        this.setupResult?.searchUIManager.destroy();
        this.setupResult?.selectionManager.destroy();
        this.setupResult?.batchOperationsHandler.destroy();
        this.setupResult?.fileListManager.destroy();
        this.setupResult?.highlightRenderManager.destroy();
        this.deviceManager?.destroy();
        
        this.setupResult = null;
    }

}

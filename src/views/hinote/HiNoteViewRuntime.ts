import { Component, Notice, WorkspaceLeaf } from 'obsidian';
import type CommentPlugin from '../../../main';
import type { PluginServices } from '../../plugin/PluginServices';
import { ExportService } from '../../services/ExportService';
import { LicenseManager } from '../../services/LicenseManager';
import { LocationService } from '../../services/LocationService';
import type { HighlightInfo } from '../../types/highlight';
import { t } from '../../i18n';
import { ExportManager, FileCommentDraftManager, HighlightFlashcardMarkers } from '../highlight';
import { DeviceManager, EventCoordinator, UIInitializer } from '../managers';
import { setupHiNoteView } from './HiNoteViewSetup';
import type { HiNoteViewSetupResult } from './HiNoteViewSetupTypes';
import type { ViewSession } from './ViewState';
import { ViewState } from './ViewState';

interface HiNoteViewRuntimeOptions {
    component: Component;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    state: ViewState;
    plugin: CommentPlugin;
    services: PluginServices;
}

/** Per-view composition root and lifecycle owner for the HiNote workspace view. */
export class HiNoteViewRuntime {
    private setup: HiNoteViewSetupResult | null = null;
    private disposed = false;
    private readonly locationService: LocationService;
    private readonly exportService: ExportService;
    private readonly licenseManager: LicenseManager;
    private readonly deviceManager = new DeviceManager();
    private readonly uiInitializer = new UIInitializer();
    private readonly eventCoordinator: EventCoordinator;
    private readonly exportManager: ExportManager;
    private readonly fileCommentDraftManager = new FileCommentDraftManager();
    private readonly flashcardMarkers: HighlightFlashcardMarkers;

    constructor(private options: HiNoteViewRuntimeOptions) {
        const { component, plugin, services } = options;
        this.locationService = new LocationService(plugin.app);
        component.addChild(this.locationService);
        this.exportService = new ExportService(
            plugin.app,
            services.highlightRepository,
            services.highlightService,
            () => plugin.settings
        );
        this.licenseManager = new LicenseManager(plugin);
        this.eventCoordinator = new EventCoordinator(plugin.app, component, services.eventManager);
        this.exportManager = new ExportManager(plugin.app, this.exportService);
        this.flashcardMarkers = new HighlightFlashcardMarkers(plugin);
    }

    async mount(): Promise<void> {
        const { component, leaf, containerEl, state, plugin, services } = this.options;
        await plugin.ensureServicesInitialized();
        if (this.disposed) return;

        const setup = await setupHiNoteView({
            app: plugin.app,
            component,
            leaf,
            containerEl,
            state,
            plugin,
            highlightManager: services.highlightManager,
            highlightRepository: services.highlightRepository,
            highlightService: services.highlightService,
            licenseManager: this.licenseManager,
            exportService: this.exportService,
            canvasService: services.canvasService,
            deviceManager: this.deviceManager,
            uiInitializer: this.uiInitializer,
            eventCoordinator: this.eventCoordinator,
            exportManager: this.exportManager,
            fileCommentDraftManager: this.fileCommentDraftManager,
            flashcardMarkers: this.flashcardMarkers,
            jumpToHighlight: highlight => this.jumpToHighlight(highlight),
            checkViewPosition: () => this.checkViewPosition(),
            updateViewLayout: () => this.updateViewLayout()
        });
        if (this.disposed) {
            this.destroySetup(setup);
            return;
        }
        this.setup = setup;
        await this.checkViewPosition();
    }

    async setMainWindowMode(enabled: boolean): Promise<void> {
        if (this.setup) await this.setup.viewPositionController.handlePositionChange(enabled);
        else this.options.state.setPlacement(enabled ? 'main' : 'sidebar');
    }

    snapshotSession(): ViewSession {
        this.setup?.commentInputManager.suspendAll();
        return this.options.state.snapshot();
    }

    restoreSession(session: ViewSession): void {
        this.options.state.restore(session);
        if (this.setup) this.setup.searchInput.value = session.search;
    }

    private async jumpToHighlight(highlight: HighlightInfo): Promise<void> {
        const { state } = this.options;
        if (state.isDraggedToMainView || highlight.isGlobalSearch) return;
        if (!state.currentFile) {
            new Notice(t('No corresponding file found.'));
            return;
        }
        await this.locationService.jumpToHighlight(highlight, state.currentFile.path);
    }

    private async checkViewPosition(): Promise<void> {
        if (!this.setup || this.disposed) return;
        const wasInAllHighlightsView = this.setup.highlightListController.isInAllHighlightsView();
        await this.setup.viewPositionDetector.checkViewPosition(wasInAllHighlightsView);
    }

    private async updateViewLayout(): Promise<void> {
        const { state } = this.options;
        if (!this.setup || this.disposed || state.disposed) return;
        const info = this.deviceManager.getDeviceInfo();
        if (info.isMobile !== state.isMobileView || info.isSmallScreen !== state.isSmallScreen) {
            state.setViewport(info.isMobile, info.isSmallScreen);
        }
        await this.setup.layoutManager.updateViewLayout();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.options.state.dispose();
        if (this.setup) this.destroySetup(this.setup);
        this.setup = null;
        this.flashcardMarkers.destroy();
        this.deviceManager.destroy();
    }

    private destroySetup(setup: HiNoteViewSetupResult): void {
        setup.commentInputManager.clearEditingState();
        setup.infiniteScrollManager.destroy();
        setup.searchUIManager.destroy();
        setup.selectionManager.destroy();
        setup.batchOperationsHandler.destroy();
        setup.fileListManager.destroy();
        setup.highlightRenderManager.destroy();
    }
}

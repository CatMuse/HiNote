import { ViewState } from './ViewState';
import { HighlightDataService } from "../../services/highlight";
import { HighlightListController, HighlightRenderManager, InfiniteScrollManager } from "../highlight";
import { SelectionManager } from "../selection";
import { SearchUIManager } from "../managers";
import { setupSearchAndSelection } from "./setup/SearchSelectionSetup";
import { setupFileList } from "./setup/FileListSetup";
import { setupHighlightRendering } from "./setup/HighlightRenderingSetup";
import { setupLayoutAndCanvas } from "./setup/LayoutCanvasSetup";
import { registerHiNoteViewEvents } from "./HiNoteViewEventBindings";
import { HiNoteViewSetupOptions, HiNoteViewSetupResult } from "./HiNoteViewSetupTypes";

export async function setupHiNoteView(options: HiNoteViewSetupOptions): Promise<HiNoteViewSetupResult> {
    const {
        app,
        component,
        leaf,
        containerEl,
        state,
        plugin,
        highlightManager,
        highlightRepository,
        highlightService,
        licenseManager,
        exportService,
        canvasService,
        deviceManager,
        uiInitializer,
        eventCoordinator,
        exportManager,
        virtualHighlightManager,
        flashcardViewManager,
        jumpToHighlight,
        checkViewPosition,
        updateViewLayout
    } = options;
    const container = containerEl.children[1] as HTMLElement;

    let searchUIManager: SearchUIManager | null = null;
    let selectionManager: SelectionManager | null = null;
    let highlightRenderManager: HighlightRenderManager | null = null;
    let infiniteScrollManager: InfiniteScrollManager | null = null;
    let highlightRendering: ReturnType<typeof setupHighlightRendering> | null = null;
    let layoutAndCanvas: ReturnType<typeof setupLayoutAndCanvas> | null = null;

    const uiElements = uiInitializer.initializeUI(container, component);
    const {
        fileListContainer,
        mainContentContainer,
        searchContainer,
        searchInput,
        searchLoadingIndicator,
        highlightContainer,
        loadingIndicator
    } = uiElements;

    const highlightDataService = new HighlightDataService(
        app,
        highlightService,
        highlightRepository
    );

    const highlightListController = new HighlightListController({
        app,
        state,
        highlightContainer,
        loadingIndicator,
        getSearchInput: () => searchInput,
        getSearchUIManager: () => searchUIManager,
        getHighlightRenderManager: () => highlightRenderManager,
        getFlashcardViewManager: () => flashcardViewManager,
        getInfiniteScrollManager: () => infiniteScrollManager,
        getGlobalHighlightService: () => layoutAndCanvas?.globalHighlightService ?? null,
        getHighlightDataService: () => highlightDataService,
        getVirtualHighlightManager: () => virtualHighlightManager,
        getCanvasProcessor: () => layoutAndCanvas?.canvasProcessor ?? null,
        getSelectionManager: () => selectionManager,
        beforeReplace: () => highlightRendering?.commentInputManager.suspendAll()
    });

    component.registerDomEvent(uiElements.backButton, "click", () => {
        if (state.isDraggedToMainView) {
            if (flashcardViewManager.handleBackButton()) {
                return;
            }

            if (state.isSmallScreen) {
                state.setNavigationOpen(true);
                void updateViewLayout();
            } else {
                void fileList.fileListController.navigate({ kind: 'all' });
            }
        }
    });

    virtualHighlightManager.createFileCommentButton(
        uiElements.iconButtonsContainer,
        {
            getCurrentFile: () => state.disposed || state.search.scope === 'vault' ? null : state.currentFile,
            getHighlights: () => state.highlights,
            onVirtualHighlightCreated: (vh) => {
                state.highlights.unshift(vh);
                highlightListController.renderHighlights(state.highlights);
            },
            onShowCommentInput: (card, highlight) => highlightRendering?.commentController.showCommentInput(card, highlight),
            getHighlightContainer: () => highlightContainer
        }
    );

    exportManager.createExportButton(
        uiElements.iconButtonsContainer,
        () => state.search.scope === 'vault' ? null : state.currentFile
    );

    const interactions = setupSearchAndSelection({
        plugin,
        exportService,
        licenseManager,
        highlightService,
        containerEl,
        state,
        searchInput,
        searchLoadingIndicator,
        highlightContainer,
        highlightListController
    });
    searchUIManager = interactions.searchUIManager;
    selectionManager = interactions.selectionManager;

    const fileList = setupFileList({
        plugin,
        highlightService,
        licenseManager,
        state,
        fileListContainer,
        highlightContainer,
        searchContainer,
        flashcardViewManager,
        highlightListController,
        updateViewLayout
    });
    const fileListManager = fileList.fileListManager;

    highlightRendering = setupHighlightRendering({
        app,
        plugin,
        highlightManager,
        state,
        searchInput,
        highlightContainer,
        exportManager,
        highlightListController,
        jumpToHighlight
    });
    highlightRenderManager = highlightRendering.highlightRenderManager;

    layoutAndCanvas = setupLayoutAndCanvas({
        app,
        leaf,
        containerEl,
        state,
        canvasService,
        highlightRepository,
        highlightService,
        highlightDataService,
        fileListManager,
        fileListController: fileList.fileListController,
        fileListContainer,
        mainContentContainer,
        searchContainer,
    });

    registerHiNoteViewEvents({
        component,
        container,
        state,
        eventCoordinator,
        highlightContainer,
        selectionManager,
        fileListManager,
        highlightListController,
        commentController: highlightRendering.commentController,
        fileListController: fileList.fileListController,
        checkViewPosition
    });

    deviceManager.setOnDeviceChange(info => {
        state.setViewport(info.isMobile, info.isSmallScreen);
        void updateViewLayout();
    });
    deviceManager.startWatching(container);

    infiniteScrollManager = new InfiniteScrollManager(highlightContainer);
    infiniteScrollManager.setLoadingIndicator(loadingIndicator);

    const deviceInfo = deviceManager.getDeviceInfo();
    state.setViewport(deviceInfo.isMobile, deviceInfo.isSmallScreen);
    const layoutManager = layoutAndCanvas.layoutManager;
    const renderLayout = async () => {
        await layoutManager.updateViewLayout();
        highlightContainer.setAttribute('aria-busy', String(state.loading === 'loading'));
        fileListManager.updateFileListSelection();
    };
    component.register(state.subscribe(() => { void renderLayout(); }));
    if (state.page.kind === 'empty') state.navigate(ViewState.filePage(app.workspace.getActiveFile()));
    await renderLayout();
    if (!state.disposed) {
        void fileList.fileListController.refreshCurrentView();
        if (state.isDraggedToMainView) void fileListManager.updateFileList();
    }

    return {
        highlightContainer,
        searchContainer,
        fileListContainer,
        mainContentContainer,
        searchInput,
        searchLoadingIndicator,
        loadingIndicator,
        searchUIManager,
        selectionManager,
        batchOperationsHandler: interactions.batchOperationsHandler,
        fileListManager,
        fileListController: fileList.fileListController,
        highlightRenderManager,
        highlightRenderController: highlightRendering.highlightRenderController,
        highlightListController,
        highlightDataService,
        commentService: highlightRendering.commentService,
        commentInputManager: highlightRendering.commentInputManager,
        commentController: highlightRendering.commentController,
        layoutManager: layoutAndCanvas.layoutManager,
        viewPositionDetector: layoutAndCanvas.viewPositionDetector,
        viewPositionController: layoutAndCanvas.viewPositionController,
        canvasProcessor: layoutAndCanvas.canvasProcessor,
        globalHighlightService: layoutAndCanvas.globalHighlightService,
        infiniteScrollManager
    };
}

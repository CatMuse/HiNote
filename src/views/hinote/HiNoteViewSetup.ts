import { HighlightDataService } from "../../services/highlight";
import { HighlightListController, HighlightRenderManager, InfiniteScrollManager } from "../highlight";
import { SelectionManager } from "../selection";
import { FileListManager, SearchUIManager } from "../managers";
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
        canvasUpdateDelay,
        jumpToHighlight,
        checkViewPosition,
        updateViewLayout
    } = options;
    const container = containerEl.children[1] as HTMLElement;

    let searchUIManager: SearchUIManager | null = null;
    let selectionManager: SelectionManager | null = null;
    let fileListManager: FileListManager;
    let highlightRenderManager: HighlightRenderManager | null = null;
    let highlightListController: HighlightListController;
    let infiniteScrollManager: InfiniteScrollManager | null = null;
    let highlightRendering: ReturnType<typeof setupHighlightRendering> | null = null;
    let layoutAndCanvas: ReturnType<typeof setupLayoutAndCanvas> | null = null;

    const uiElements = uiInitializer.initializeUI(container);
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

    highlightListController = new HighlightListController({
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
        getSelectionManager: () => selectionManager
    });

    component.registerDomEvent(uiElements.backButton, "click", () => {
        if (state.isMobileView && state.isSmallScreen && state.isDraggedToMainView) {
            if (flashcardViewManager.handleBackButton()) {
                return;
            }

            state.isShowingFileList = true;
            void updateViewLayout();
        }
    });

    virtualHighlightManager.createFileCommentButton(
        uiElements.iconButtonsContainer,
        {
            getCurrentFile: () => state.currentFile,
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
        () => state.currentFile
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
    fileListManager = fileList.fileListManager;

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
        canvasUpdateDelay,
        deviceManager,
        highlightRepository,
        highlightService,
        highlightDataService,
        fileListManager,
        flashcardViewManager,
        highlightListController,
        fileListContainer,
        mainContentContainer,
        searchContainer,
        searchInput,
        highlightContainer,
        loadingIndicator
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
        checkViewPosition
    });

    deviceManager.setOnDeviceChange(() => {
        void updateViewLayout();
    });
    deviceManager.startWatching(container);

    infiniteScrollManager = new InfiniteScrollManager(highlightContainer);
    infiniteScrollManager.setLoadingIndicator(loadingIndicator);

    const activeFile = app.workspace.getActiveFile();
    if (activeFile) {
        state.currentFile = activeFile;
    }

    layoutAndCanvas.layoutManager.updateState({
        isDraggedToMainView: state.isDraggedToMainView,
        isFlashcardMode: state.isFlashcardMode,
        isShowingFileList: state.isShowingFileList
    });
    await layoutAndCanvas.layoutManager.updateViewLayout();
    const deviceInfo = deviceManager.getDeviceInfo();
    state.isMobileView = deviceInfo.isMobile;
    state.isSmallScreen = deviceInfo.isSmallScreen;

    if (activeFile) {
        void highlightListController.updateHighlights().catch(error => {
            console.error('[HiNoteViewSetup] Failed to load initial highlights:', error);
        });
    } else {
        highlightContainer.empty();
        highlightListController.renderWithCurrentSearch();
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

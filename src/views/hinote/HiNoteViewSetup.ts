import { Notice } from 'obsidian';
import { t } from '../../i18n';
import { ViewState } from './ViewState';
import { HighlightDataService } from "../../services/highlight";
import { HighlightListController, HighlightRenderManager, InfiniteScrollManager } from "../highlight";
import { defaultHighlightCardRegistry } from "../../components/highlight";
import { SelectionManager } from "../selection";
import { SearchUIManager } from "../managers";
import { setupSearchAndSelection } from "./setup/SearchSelectionSetup";
import { setupFileList } from "./setup/FileListSetup";
import { setupHighlightRendering } from "./setup/HighlightRenderingSetup";
import { setupLayoutAndCanvas } from "./setup/LayoutCanvasSetup";
import { registerHiNoteViewEvents } from "./HiNoteViewEventBindings";
import { HiNoteViewSetupOptions, HiNoteViewSetupResult } from "./HiNoteViewSetupTypes";
import { HighlightToolbar } from './HighlightToolbar';

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
        fileCommentDraftManager,
        flashcardMarkers,
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

    const uiElements = uiInitializer.initializeUI(container);
    const {
        fileListContainer,
        mainContentContainer,
        searchContainer,
        searchComponent,
        searchInput,
        searchLoadingIndicator,
        highlightContainer,
        loadingIndicator
    } = uiElements;
    searchInput.value = state.search.raw;

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
        getHighlightFlashcardMarkers: () => flashcardMarkers,
        getInfiniteScrollManager: () => infiniteScrollManager,
        getGlobalHighlightService: () => layoutAndCanvas?.globalHighlightService ?? null,
        getHighlightDataService: () => highlightDataService,
        getCanvasProcessor: () => layoutAndCanvas?.canvasProcessor ?? null,
        getSelectionManager: () => selectionManager,
        beforeReplace: () => highlightRendering?.commentInputManager.suspendAll()
    });

    component.registerDomEvent(uiElements.backButton, "click", () => {
        if (state.isDraggedToMainView) {
            if (state.isSmallScreen) {
                state.setNavigationOpen(true);
                void updateViewLayout();
            } else {
                void fileList.fileListController.navigate({ kind: 'all' });
            }
        }
    });

    const interactions = setupSearchAndSelection({
        plugin,
        exportService,
        licenseManager,
        highlightService,
        containerEl,
        state,
        searchComponent,
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
        highlightListController,
        updateViewLayout
    });
    const fileListManager = fileList.fileListManager;

    const addFileComment = async () => {
        const currentFile = state.disposed || state.page.kind !== 'file' ? null : state.currentFile;
        if (!currentFile) return;

        const draft = fileCommentDraftManager.createDraft(currentFile);
        const existing = state.highlights.find(highlight =>
            highlight.isDraft && !highlight.recordId && highlight.filePath === draft.filePath
        );
        const target = existing || draft;
        if (!existing) {
            state.highlights.unshift(target);
            await highlightListController.renderWithCurrentSearch();
        }
        const card = defaultHighlightCardRegistry.findByHighlightId(target.id || '', highlightContainer)?.getElement();
        if (!card || !highlightRendering) return;
        highlightRendering.commentController.showCommentInput(card, target);
        highlightContainer.scrollTo({ top: 0, behavior: 'smooth' });
    };

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

    new HighlightToolbar(component, state, {
        toolbar: searchContainer,
        toolbarTitle: uiElements.toolbarTitle,
        searchField: uiElements.searchField,
        searchInput,
        actions: uiElements.iconButtonsContainer
    }, {
        onCurrentDocument: async () => {
            const page = ViewState.filePage(app.workspace.getActiveFile());
            if (page.kind === 'empty') {
                new Notice(t('Please open a file first.'));
                return;
            }
            await fileList.fileListController.navigate(page);
        },
        onAllDocuments: async () => await fileList.fileListController.navigate({ kind: 'all' }),
        onAddFileComment: addFileComment,
        onViewOptionsChanged: () => { void highlightListController.renderWithCurrentSearch(); },
        onRefresh: async () => {
            await fileListManager.updateFileList(true);
            if (!state.disposed) await highlightListController.refreshView();
        },
        onExport: async () => await exportManager.exportCurrentFile(state.page.kind === 'file' ? state.currentFile : null)
    });

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
        mainContentContainer
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
        const placeholder = t(state.page.kind === 'favorites' ? 'Search favorites...' : 'Search...');
        searchInput.placeholder = placeholder;
        searchInput.setAttribute('aria-label', placeholder);
        const visibleCount = searchUIManager?.filterHighlightsByTerm(searchInput.value).length ?? 0;
        uiElements.toolbarMeta.setText(state.loading === 'loading'
            ? t('Loading...')
            : t('{count} results', { count: visibleCount }));
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

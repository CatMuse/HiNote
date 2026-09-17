import { App, WorkspaceLeaf } from "obsidian";
import { CanvasService } from "../../../services/CanvasService";
import { HighlightRepository } from "../../../repositories/HighlightRepository";
import { HighlightService } from "../../../services/HighlightService";
import { GlobalHighlightService, HighlightDataService } from "../../../services/highlight";
import { CanvasHighlightProcessor, FlashcardViewManager, HighlightListController } from "../../highlight";
import { LayoutManager, ViewPositionController, ViewPositionDetector } from "../../layout";
import { DeviceManager, FileListManager, FileListController } from "../../managers";
import { ViewState } from "../ViewState";

interface LayoutAndCanvasSetupOptions {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    state: ViewState;
    canvasService: CanvasService;
    deviceManager: DeviceManager;
    highlightRepository: HighlightRepository;
    highlightService: HighlightService;
    highlightDataService: HighlightDataService;
    fileListManager: FileListManager;
    fileListController: FileListController;
    flashcardViewManager: FlashcardViewManager;
    highlightListController: HighlightListController;
    fileListContainer: HTMLElement;
    mainContentContainer: HTMLElement;
    searchContainer: HTMLElement;
    searchInput: HTMLInputElement;
    highlightContainer: HTMLElement;
    loadingIndicator: HTMLElement;
}

export function setupLayoutAndCanvas(options: LayoutAndCanvasSetupOptions): {
    layoutManager: LayoutManager;
    viewPositionDetector: ViewPositionDetector;
    viewPositionController: ViewPositionController;
    canvasProcessor: CanvasHighlightProcessor;
    globalHighlightService: GlobalHighlightService;
} {
    const {
        app,
        leaf,
        containerEl,
        state,
        canvasService,
        deviceManager,
        highlightRepository,
        highlightService,
        highlightDataService,
        fileListManager,
        fileListController,
        flashcardViewManager,
        highlightListController,
        fileListContainer,
        mainContentContainer,
        searchContainer,
        searchInput,
        highlightContainer,
        loadingIndicator
    } = options;

    const layoutManager = new LayoutManager(containerEl, fileListContainer, mainContentContainer, searchContainer, state);
    const viewPositionDetector = new ViewPositionDetector(app, leaf, state);
    const viewPositionController = new ViewPositionController({
        app, state, fileListController, fileListManager,
        updateLayout: () => layoutManager.updateViewLayout()
    });

    const globalHighlightService = new GlobalHighlightService(
        app,
        highlightService,
        highlightRepository
    );

    const canvasProcessor = new CanvasHighlightProcessor(
        app,
        canvasService,
        highlightDataService
    );
    viewPositionDetector.setCallbacks({
        onPositionChange: async (isInMainView, wasInAllHighlightsView) => {
            await viewPositionController.handlePositionChange(isInMainView, wasInAllHighlightsView);
        }
    });

    return {
        layoutManager,
        viewPositionDetector,
        viewPositionController,
        canvasProcessor,
        globalHighlightService
    };
}

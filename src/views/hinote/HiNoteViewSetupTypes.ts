import { App, Component, WorkspaceLeaf } from "obsidian";
import CommentPlugin from "../../../main";
import { CanvasService } from "../../services/CanvasService";
import { ExportService } from "../../services/ExportService";
import { HighlightManager } from "../../services/HighlightManager";
import { HighlightRepository } from "../../repositories/HighlightRepository";
import { HighlightService } from "../../services/HighlightService";
import { LicenseManager } from "../../services/LicenseManager";
import { CommentService } from "../../services/comment";
import { GlobalHighlightService, HighlightDataService } from "../../services/highlight";
import { HighlightInfo } from "../../types/highlight";
import {
    CanvasHighlightProcessor,
    CommentController,
    CommentInputManager,
    ExportManager,
    HighlightFlashcardMarkers,
    HighlightListController,
    HighlightRenderController,
    HighlightRenderManager,
    InfiniteScrollManager,
    FileCommentDraftManager
} from "../highlight";
import { LayoutManager, ViewPositionController, ViewPositionDetector } from "../layout";
import { BatchOperationsHandler, SelectionManager } from "../selection";
import {
    DeviceManager,
    EventCoordinator,
    FileListController,
    FileListManager,
    SearchUIManager,
    UIInitializer
} from "../managers";
import { ViewState } from "./ViewState";

export interface HiNoteViewSetupOptions {
    app: App;
    component: Component;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    state: ViewState;
    plugin: CommentPlugin;
    highlightManager: HighlightManager;
    highlightRepository: HighlightRepository;
    highlightService: HighlightService;
    licenseManager: LicenseManager;
    exportService: ExportService;
    canvasService: CanvasService;
    deviceManager: DeviceManager;
    uiInitializer: UIInitializer;
    eventCoordinator: EventCoordinator;
    exportManager: ExportManager;
    fileCommentDraftManager: FileCommentDraftManager;
    flashcardMarkers: HighlightFlashcardMarkers;
    jumpToHighlight: (highlight: HighlightInfo) => Promise<void>;
    checkViewPosition: () => Promise<void>;
    updateViewLayout: () => Promise<void>;
}

export interface HiNoteViewSetupResult {
    highlightContainer: HTMLElement;
    searchContainer: HTMLElement;
    fileListContainer: HTMLElement;
    mainContentContainer: HTMLElement;
    searchInput: HTMLInputElement;
    searchLoadingIndicator: HTMLElement;
    loadingIndicator: HTMLElement;
    searchUIManager: SearchUIManager;
    selectionManager: SelectionManager;
    batchOperationsHandler: BatchOperationsHandler;
    fileListManager: FileListManager;
    fileListController: FileListController;
    highlightRenderManager: HighlightRenderManager;
    highlightRenderController: HighlightRenderController;
    highlightListController: HighlightListController;
    highlightDataService: HighlightDataService;
    commentService: CommentService;
    commentInputManager: CommentInputManager;
    commentController: CommentController;
    layoutManager: LayoutManager;
    viewPositionDetector: ViewPositionDetector;
    viewPositionController: ViewPositionController;
    canvasProcessor: CanvasHighlightProcessor;
    globalHighlightService: GlobalHighlightService;
    infiniteScrollManager: InfiniteScrollManager;
}

import { App } from "obsidian";
import CommentPlugin from "../../../../main";
import { HighlightManager } from "../../../services/HighlightManager";
import { CommentService } from "../../../services/comment";
import { HighlightInfo } from "../../../types/highlight";
import {
    CommentController,
    CommentInputManager,
    ExportManager,
    HighlightListController,
    HighlightRenderController,
    HighlightRenderManager
} from "../../highlight";
import { ViewState } from "../ViewState";

interface HighlightRenderingSetupOptions {
    app: App;
    plugin: CommentPlugin;
    highlightManager: HighlightManager;
    state: ViewState;
    searchInput: HTMLInputElement;
    highlightContainer: HTMLElement;
    exportManager: ExportManager;
    highlightListController: HighlightListController;
    jumpToHighlight: (highlight: HighlightInfo) => Promise<void>;
}

export function setupHighlightRendering(options: HighlightRenderingSetupOptions): {
    highlightRenderManager: HighlightRenderManager;
    highlightRenderController: HighlightRenderController;
    commentService: CommentService;
    commentInputManager: CommentInputManager;
    commentController: CommentController;
} {
    const {
        app,
        plugin,
        highlightManager,
        state,
        searchInput,
        highlightContainer,
        exportManager,
        highlightListController,
        jumpToHighlight
    } = options;

    const highlightRenderManager = new HighlightRenderManager(
        highlightContainer,
        plugin,
        searchInput
    );
    const commentService = new CommentService(
        app,
        plugin,
        highlightManager
    );
    const commentInputManager = new CommentInputManager(plugin);
    const commentController = new CommentController({
        state,
        commentService,
        commentInputManager,
        refreshView: async () => await highlightListController.refreshView()
    });
    commentController.configure();

    const highlightRenderController = new HighlightRenderController({
        highlightRenderManager,
        commentController,
        exportManager,
        jumpToHighlight
    });
    highlightRenderController.configure();

    return {
        highlightRenderManager,
        highlightRenderController,
        commentService,
        commentInputManager,
        commentController
    };
}

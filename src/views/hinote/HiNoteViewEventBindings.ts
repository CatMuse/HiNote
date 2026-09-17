import { Component } from "obsidian";
import { CommentController, HighlightListController } from "../highlight";
import { EventCoordinator, FileListManager, FileListController } from "../managers";
import { SelectionManager } from "../selection";
import { ViewState } from "./ViewState";

interface HiNoteViewEventBindingOptions {
    component: Component;
    container: HTMLElement;
    state: ViewState;
    eventCoordinator: EventCoordinator;
    highlightContainer: HTMLElement;
    selectionManager: SelectionManager;
    fileListManager: FileListManager;
    fileListController: FileListController;
    highlightListController: HighlightListController;
    commentController: CommentController;
    checkViewPosition: () => Promise<void>;
}

export function registerHiNoteViewEvents(options: HiNoteViewEventBindingOptions): void {
    const {
        component,
        container,
        state,
        eventCoordinator,
        highlightContainer,
        selectionManager,
        fileListManager,
        fileListController,
        highlightListController,
        commentController,
        checkViewPosition
    } = options;

    const handleMultiSelect = () => {
        selectionManager.updateSelectedHighlights();
    };
    container.addEventListener("highlight-multi-select", handleMultiSelect);
    component.register(() => {
        container.removeEventListener("highlight-multi-select", handleMultiSelect);
    });

    component.registerDomEvent(activeDocument, "click", (e: MouseEvent) => {
        if (selectionManager.isInSelectionMode()) {
            return;
        }

        const selectedCount = selectionManager.getSelectedCount();
        if (selectedCount <= 1) {
            return;
        }

        const target = e.target as HTMLElement;
        if (!target.closest(".multi-select-actions") &&
            !target.closest(".highlight-card.selected") &&
            !target.closest(".highlight-container")) {
            selectionManager.clearSelection();
        }
    });

    let refreshTimer: number | null = null;
    let pendingContent = false;
    component.register(() => { if (refreshTimer !== null) window.clearTimeout(refreshTimer); });
    const scheduleRefresh = (content: boolean) => {
        if (state.disposed) return;
        fileListManager.invalidateCache();
        pendingContent ||= content;
        if (content && !state.isFlashcardMode) state.invalidate();
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
            refreshTimer = null;
            if (state.disposed) return;
            if (state.isDraggedToMainView) void fileListManager.updateFileList();
            const shouldRefresh = pendingContent; pendingContent = false;
            if (shouldRefresh && !state.isFlashcardMode) void highlightListController.refreshView(true, false, true);
        }, 300);
    };
    eventCoordinator.setCallbacks({
        onExclusionsChanged: () => {
            if (!state.isFlashcardMode) highlightListController.cancelPending();
            scheduleRefresh(!state.isFlashcardMode);
        },
        onFileOpen: file => { void fileListController.navigate(ViewState.filePage(file)); },
        onFileModify: file => {
            scheduleRefresh(state.currentFile === file || state.page.kind === 'all' ||
                state.page.kind === 'canvas' || state.search.scope === 'vault');
        },
        onFileCreate: () => scheduleRefresh(state.page.kind === 'all' || state.search.scope === 'vault'),
        onFileDelete: file => {
            if (state.mainPage && 'file' in state.mainPage && state.mainPage.file === file) state.mainPage = null;
            if (state.currentFile === file) void fileListController.navigate({ kind: 'empty' });
            scheduleRefresh(state.page.kind === 'all' || state.page.kind === 'canvas' || state.search.scope === 'vault');
        },
        onFileRename: () => { state.notify(); scheduleRefresh(!state.isFlashcardMode); },
        onLayoutChange: () => { void checkViewPosition(); },
        onCommentInput: (highlightId, text) => {
            eventCoordinator.handleCommentInputDisplay(highlightId, text, highlightContainer,
                (card, highlight) => commentController.showCommentInput(card, highlight));
        }
    });
    eventCoordinator.registerAllEvents(
        () => state.currentFile,
        () => state.isDraggedToMainView
    );
    eventCoordinator.registerKeyboardEvents(highlightContainer);
}

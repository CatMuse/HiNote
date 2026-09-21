import CommentPlugin from "../../../../main";
import type { SearchComponent } from "obsidian";
import { ExportService } from "../../../services/ExportService";
import { HighlightService } from "../../../services/HighlightService";
import { LicenseManager } from "../../../services/LicenseManager";
import { HighlightListController } from "../../highlight";
import { BatchOperationsHandler, SelectionManager } from "../../selection";
import { SearchUIManager } from "../../managers";
import { ViewState } from "../ViewState";

interface SearchAndSelectionOptions {
    plugin: CommentPlugin;
    exportService: ExportService;
    licenseManager: LicenseManager;
    highlightService: HighlightService;
    containerEl: HTMLElement;
    state: ViewState;
    searchComponent: SearchComponent;
    searchLoadingIndicator: HTMLElement;
    highlightContainer: HTMLElement;
    highlightListController: HighlightListController;
}

export function setupSearchAndSelection(options: SearchAndSelectionOptions): {
    searchUIManager: SearchUIManager;
    selectionManager: SelectionManager;
    batchOperationsHandler: BatchOperationsHandler;
} {
    const {
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
    } = options;

    const searchUIManager = new SearchUIManager(
        plugin,
        searchComponent,
        searchLoadingIndicator,
        state
    );
    searchUIManager.setCallbacks(
        async (searchTerm: string) => {
            await highlightListController.handleSearch(searchTerm);
        },
        () => state.highlights,
        () => state.currentFile
    );
    searchUIManager.initialize();

    const selectionManager = new SelectionManager(highlightContainer);
    selectionManager.initialize();

    const batchOperationsHandler = new BatchOperationsHandler(
        plugin,
        exportService,
        licenseManager,
        highlightService,
        containerEl
    );
    selectionManager.setOnSelectionChange((selectedCount) => {
        void batchOperationsHandler.showMultiSelectActions(selectedCount);
    });
    batchOperationsHandler.setCallbacks(
        () => selectionManager.getSelectedHighlights(),
        () => selectionManager.clearSelection(),
        async () => await highlightListController.refreshView()
    );

    return {
        searchUIManager,
        selectionManager,
        batchOperationsHandler
    };
}

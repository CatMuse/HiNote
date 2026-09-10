import CommentPlugin from "../../../../main";
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
    searchInput: HTMLInputElement;
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
        searchInput,
        searchLoadingIndicator,
        highlightContainer,
        highlightListController
    } = options;

    const searchUIManager = new SearchUIManager(
        plugin,
        searchInput,
        searchLoadingIndicator
    );
    searchUIManager.setCallbacks(
        async (searchTerm: string, searchType: string) => {
            await highlightListController.handleSearch(searchTerm, searchType);
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

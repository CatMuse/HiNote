import CommentPlugin from "../../../../main";
import { HighlightService } from "../../../services/HighlightService";
import { LicenseManager } from "../../../services/LicenseManager";
import { HighlightListController } from "../../highlight";
import { FileListController, FileListManager } from "../../managers";
import { ViewState } from "../ViewState";

interface FileListSetupOptions {
    plugin: CommentPlugin;
    highlightService: HighlightService;
    licenseManager: LicenseManager;
    state: ViewState;
    fileListContainer: HTMLElement;
    highlightContainer: HTMLElement;
    highlightListController: HighlightListController;
    updateViewLayout: () => Promise<void>;
}

export function setupFileList(options: FileListSetupOptions): {
    fileListManager: FileListManager;
    fileListController: FileListController;
} {
    const {
        plugin,
        highlightService,
        licenseManager,
        state,
        fileListContainer,
        highlightContainer,
        highlightListController,
        updateViewLayout
    } = options;

    const fileListManager = new FileListManager(
        fileListContainer,
        plugin,
        highlightService,
        licenseManager,
        state
    );
    const fileListController = new FileListController({
        state,
        fileListManager,
        highlightListController,
        highlightContainer,
        updateViewLayout
    });
    fileListManager.setCallbacks(fileListController.getCallbacks());

    return {
        fileListManager,
        fileListController
    };
}

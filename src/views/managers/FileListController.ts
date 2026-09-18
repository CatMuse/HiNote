import type { TFile } from 'obsidian';
import type { HighlightListController } from '../highlight';
import type { FileListManager } from './FileListManager';
import { ViewState, type HiNotePage } from '../hinote/ViewState';

interface FileListControllerOptions {
    state: ViewState;
    fileListManager: FileListManager;
    highlightListController: HighlightListController;
    highlightContainer: HTMLElement;
    updateViewLayout: () => Promise<void>;
}

/** Navigation within the highlight view; HiCard has its own workspace leaf. */
export class FileListController {
    constructor(private options: FileListControllerOptions) {}
    getCallbacks() {
        return {
            onFileSelect: (file: TFile | null) => this.navigate(ViewState.filePage(file)),
            onAllHighlightsSelect: () => this.navigate({ kind: 'all' }),
            onFavoritesSelect: () => this.navigate({ kind: 'favorites' }),
            onRefreshView: () => this.refreshCurrentView()
        };
    }
    async navigate(page: HiNotePage): Promise<void> {
        const { state, highlightListController } = this.options;
        if (state.disposed) return;
        highlightListController.cancelPending();
        state.navigate(page);
        this.options.highlightContainer.empty();
        this.options.fileListManager.updateFileListSelection();
        await this.options.updateViewLayout();
        if (state.page !== page || state.disposed) return;
        await this.refreshCurrentView();
    }
    async refreshCurrentView(): Promise<void> {
        if (!this.options.state.disposed) await this.options.highlightListController.refreshView();
    }
}

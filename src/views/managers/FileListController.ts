import { t } from '../../i18n';
import type { TFile } from 'obsidian';
import type { LicenseManager } from '../../services/LicenseManager';
import type { FlashcardViewManager, HighlightListController } from '../highlight';
import type { FileListManager } from './FileListManager';
import { ViewState, type HiNotePage } from '../hinote/ViewState';

interface FileListControllerOptions {
    state: ViewState;
    fileListManager: FileListManager;
    flashcardViewManager: FlashcardViewManager;
    highlightListController: HighlightListController;
    highlightContainer: HTMLElement;
    searchContainer: HTMLElement;
    licenseManager: LicenseManager;
    updateViewLayout: () => Promise<void>;
}

/** One navigation path for mouse, keyboard, native file events and placement. */
export class FileListController {
    constructor(private options: FileListControllerOptions) {}
    getCallbacks() {
        return {
            onFileSelect: (file: TFile | null) => this.navigate(ViewState.filePage(file)),
            onFlashcardModeToggle: (enabled: boolean) => this.navigate({ kind: enabled ? 'hicard' : 'all' }),
            onAllHighlightsSelect: () => this.navigate({ kind: 'all' }),
            onRefreshView: () => this.refreshCurrentView()
        };
    }
    async navigate(page: HiNotePage): Promise<void> {
        const { state, highlightListController, flashcardViewManager } = this.options;
        if (state.disposed) return;
        highlightListController.cancelPending();
        flashcardViewManager.exitFlashcardMode();
        state.navigate(page);
        this.options.highlightContainer.empty();
        this.options.highlightContainer.removeClass('flashcard-mode');
        this.options.fileListManager.updateFileListSelection();
        await this.options.updateViewLayout();
        // Another navigation may have run while layout yielded.
        if (state.page !== page || state.disposed) return;
        await this.refreshCurrentView();
    }
    async refreshCurrentView(): Promise<void> {
        const { state } = this.options;
        if (state.disposed) return;
        if (!state.isFlashcardMode) { await this.options.highlightListController.refreshView(); return; }
        this.options.highlightListController.cancelPending();
        const token = state.beginRequest();
        try {
            await this.options.flashcardViewManager.activateFlashcardMode(
                this.options.highlightContainer, this.options.licenseManager, () => state.isCurrent(token));
            state.finishRequest(token);
        } catch (error) {
            if (state.isCurrent(token)) {
                state.finishRequest(token, true);
                console.error('[HiNote] Could not open HiCard:', error);
                this.options.highlightContainer.empty();
                this.options.highlightContainer.createDiv({ cls: 'highlight-empty-state', text: t('Unable to load this view. Try refreshing.') });
            }
        }
    }
}

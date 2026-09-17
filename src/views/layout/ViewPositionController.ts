import type { App } from 'obsidian';
import { ViewState } from '../hinote/ViewState';
import type { FileListController, FileListManager } from '../managers';

interface ViewPositionControllerOptions {
    app: App;
    state: ViewState;
    fileListController: FileListController;
    fileListManager: FileListManager;
    updateLayout: () => Promise<void>;
}
export class ViewPositionController {
    constructor(private options: ViewPositionControllerOptions) {}
    async handlePositionChange(main: boolean, _wasAll = false): Promise<void> {
        const { state, app, fileListController, fileListManager } = this.options;
        if (state.disposed) return;
        const next = main
            ? state.mainPage || (state.page.kind === 'empty' ? { kind: 'all' as const } : state.page)
            : ViewState.filePage(app.workspace.getActiveFile());
        state.setPlacement(main ? 'main' : 'sidebar');
        const navigation = fileListController.navigate(next);
        // Navigation controls remain usable while content is still loading.
        if (main && !state.disposed) void fileListManager.updateFileList().catch(error => console.error('[HiNote] Navigation load failed:', error));
        await navigation;
        await this.options.updateLayout();
    }
}

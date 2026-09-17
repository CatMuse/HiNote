import { App } from 'obsidian';
import { HiNoteView, VIEW_TYPE_HINOTE } from '../views/hinote/HiNoteView';

/** Move the panel with its in-memory navigation/search/drafts intact. */
export class WindowManager {
    constructor(private app: App) {}
    openCommentPanelInSidebar(): Promise<void> { return this.open(false); }
    openCommentPanelInMainWindow(): Promise<void> { return this.open(true); }

    private async open(main: boolean): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_HINOTE)[0];
        const view = existing?.view;
        if (view instanceof HiNoteView && view.isInMainWindowMode() === main) {
            await workspace.revealLeaf(existing);
            return;
        }
        const session = view instanceof HiNoteView ? view.getSessionState() : undefined;
        if (existing) existing.detach();
        const leaf = main ? workspace.getLeaf('tab') : workspace.getRightLeaf(false);
        if (!leaf) return;
        await leaf.setViewState({ type: VIEW_TYPE_HINOTE, active: true });
        if (leaf.view instanceof HiNoteView) {
            if (session) leaf.view.restoreSessionState(session);
            await leaf.view.setMainWindowMode(main, true);
        }
        await workspace.revealLeaf(leaf);
    }
}

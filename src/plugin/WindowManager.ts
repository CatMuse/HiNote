import { App } from 'obsidian';
import { HiNoteView, VIEW_TYPE_HINOTE } from '../views/hinote/HiNoteView';
import { VIEW_TYPE_HICARD } from '../views/hicard/HiCardView';

/** Move the panel with its in-memory navigation/search/drafts intact. */
export class WindowManager {
    private openingHiCard: Promise<void> | null = null;
    constructor(private app: App) {}
    openHiCard(): Promise<void> {
        if (this.openingHiCard) return this.openingHiCard;
        this.openingHiCard = this.openStudyView().finally(() => { this.openingHiCard = null; });
        return this.openingHiCard;
    }

    private async openStudyView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_HICARD)[0];
        const leaf = existing ?? workspace.getLeaf('tab');
        if (!existing) await leaf.setViewState({ type: VIEW_TYPE_HICARD, active: true });
        await workspace.revealLeaf(leaf);
    }
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

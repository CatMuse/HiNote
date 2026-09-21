import type { ViewState } from '../hinote/ViewState';

/** Presentation only. Resizing never navigates, reloads files or scans the vault. */
export class LayoutManager {
    constructor(
        private containerEl: HTMLElement,
        private fileListContainer: HTMLElement,
        private mainContentContainer: HTMLElement,
        private state: ViewState
    ) {}
    async updateViewLayout(): Promise<void> {
        const { state } = this;
        if (state.disposed) return;
        const root = this.containerEl.children[1] as HTMLElement;
        root.toggleClass('is-in-main-view', state.isDraggedToMainView);
        root.toggleClass('is-small-screen', state.isSmallScreen);
        const navigationOnly = state.isDraggedToMainView && state.isSmallScreen && state.navigationOpen;
        const showNavigation = state.isDraggedToMainView && (!state.isSmallScreen || state.navigationOpen);
        this.fileListContainer.toggleClass('highlight-display-none', !showNavigation);
        this.fileListContainer.toggleClass('highlight-display-block', showNavigation);
        this.fileListContainer.toggleClass('highlight-full-width', navigationOnly);
        this.mainContentContainer.toggleClass('highlight-display-none', navigationOnly);
    }
}

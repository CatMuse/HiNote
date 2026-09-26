import { MarkdownView, Plugin } from 'obsidian';
import type { EventManager } from '../services/EventManager';

/** Coalesces model changes into one editor/reading-mode refresh per task. */
export class RenderInvalidationCoordinator {
    private pendingPaths = new Set<string>();
    private invalidateAll = false;
    private timer: number | null = null;
    private enabled = false;

    constructor(
        private host: Plugin,
        private eventManager: EventManager,
        private refreshEditor: (filePath?: string) => void
    ) {}

    enable(): void {
        if (this.enabled) return;
        this.enabled = true;
        this.host.registerEvent(this.eventManager.on(
            'records:changed',
            change => this.invalidate(change.filePath)
        ));
        this.host.registerEvent(this.eventManager.on('exclusions:changed', () => this.invalidate()));
        this.host.register(() => this.destroy());
    }

    invalidate(filePath?: string): void {
        if (filePath) this.pendingPaths.add(filePath);
        else this.invalidateAll = true;
        if (this.timer !== null) return;
        this.timer = window.setTimeout(() => this.flush(), 0);
    }

    private flush(): void {
        this.timer = null;
        const refreshAll = this.invalidateAll;
        const paths = new Set(this.pendingPaths);
        this.invalidateAll = false;
        this.pendingPaths.clear();

        this.refreshEditor(refreshAll || paths.size !== 1 ? undefined : paths.values().next().value);
        for (const leaf of this.host.app.workspace.getLeavesOfType('markdown')) {
            if (!(leaf.view instanceof MarkdownView) || leaf.view.getMode() !== 'preview') continue;
            if (!refreshAll && (!leaf.view.file || !paths.has(leaf.view.file.path))) continue;
            leaf.view.previewMode.rerender(true);
        }
    }

    destroy(): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        this.pendingPaths.clear();
        this.invalidateAll = false;
    }
}

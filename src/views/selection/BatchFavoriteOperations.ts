import { Component, Notice, setIcon } from 'obsidian';
import type CommentPlugin from '../../../main';
import type { HighlightInfo } from '../../types/highlight';
import { t } from '../../i18n';

export class BatchFavoriteOperations extends Component {
    private cleanup?: () => void;
    private busy = false;
    constructor(private plugin: CommentPlugin, private getSelected: () => Set<HighlightInfo>, private clearSelection: () => void) { super(); }
    onload(): void { this.register(() => this.clearButton()); }

    addButton(container: HTMLElement): void {
        this.clearButton();
        const remove = [...this.getSelected()].every(row => !!row.favoritedAt);
        const button = container.createEl('button', {
            cls: 'multi-select-action-button clickable-icon',
            attr: { type: 'button', 'aria-label': t(remove ? 'Remove from favorites' : 'Add to favorites') }
        });
        setIcon(button, remove ? 'star-off' : 'star');
        const click = (event: MouseEvent) => { event.stopPropagation(); void this.run(!remove, button); };
        button.addEventListener('click', click);
        this.cleanup = () => button.removeEventListener('click', click);
    }
    clearButton(): void { this.cleanup?.(); this.cleanup = undefined; }

    private async run(favorite: boolean, button: HTMLButtonElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        button.disabled = true;
        const selected = [...this.getSelected()];
        let failed = false;
        try {
            for (const row of selected) {
                try { await this.plugin.highlightManager.setFavorite(row, favorite); }
                catch (error) { failed = true; console.error('[HiNote] Batch favorite failed:', error); }
            }
            this.clearSelection();
            if (failed) new Notice(t('Some favorites could not be updated. Please try again.'));
        } finally { this.busy = false; button.disabled = false; }
    }
}

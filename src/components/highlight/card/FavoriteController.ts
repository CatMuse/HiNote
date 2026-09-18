import { Component, Notice, setIcon } from 'obsidian';
import type CommentPlugin from '../../../../main';
import type { HighlightInfo } from '../../../types/highlight';
import { t } from '../../../i18n';

/** Owned by the card so handlers are removed on rerender/unload. */
export class HighlightFavoriteController extends Component {
    private button: HTMLButtonElement;
    private busy = false;
    constructor(private plugin: CommentPlugin, private getHighlight: () => HighlightInfo, private refresh: () => void) { super(); }

    bind(container: HTMLElement): void {
        this.button = container.createEl('button', {
            cls: 'highlight-title-btn highlight-favorite-btn', attr: { type: 'button' }
        });
        setIcon(this.button, 'star');
        this.update();
        this.registerDomEvent(this.button, 'click', event => {
            event.stopPropagation();
            void this.toggle();
        });
    }

    update(): void {
        if (!this.button) return;
        const favorite = !!this.getHighlight().favoritedAt;
        const label = t(favorite ? 'Remove from favorites' : 'Add to favorites');
        this.button.toggleClass('is-favorite', favorite);
        this.button.setAttribute('aria-pressed', String(favorite));
        this.button.setAttribute('aria-label', label);
        this.button.title = label;
    }

    private async toggle(): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        this.button.disabled = true;
        const highlight = this.getHighlight();
        const timestamp = highlight.favoritedAt;
        try {
            await this.plugin.highlightManager.setFavorite(highlight, !timestamp);
            this.update();
            this.refresh();
        } catch (error) {
            console.error('[HiNote] Favorite could not be saved:', error);
            new Notice(t('Could not update favorites. Please try again.'));
        } finally {
            this.busy = false;
            this.button.disabled = false;
        }
    }

}

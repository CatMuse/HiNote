import { Component, Notice } from 'obsidian';
import type CommentPlugin from '../../../../main';
import type { HighlightInfo } from '../../../types/highlight';
import { HIGHLIGHT_SOURCE, isFileComment } from '../../../types/highlight';
import { HighlightColorPalette } from './ColorPalette';
import { HighlightColor } from '../../../services/highlight/HighlightColor';
import { t } from '../../../i18n';

export class HighlightCardColorController extends Component {
    private palette?: HighlightColorPalette;
    private busy = false;

    constructor(private plugin: CommentPlugin, private getHighlight: () => HighlightInfo) {
        super();
    }

    bind(card: HTMLElement): void {
        const highlight = this.getHighlight();
        if (highlight.sourceUnavailable || isFileComment(highlight) || highlight.isFromCanvas || !highlight.filePath?.endsWith('.md') ||
            !['markdown', 'html'].includes(highlight.syntax || '')) return;
        const decorator = card.querySelector<HTMLElement>('.highlight-text-decorator');
        if (!decorator) return;
        decorator.addClass('highlight-color-trigger');
        decorator.setAttribute('role', 'button');
        decorator.setAttribute('tabindex', '0');
        decorator.setAttribute('aria-label', t('Change highlight color'));
        decorator.setAttribute('aria-haspopup', 'menu');
        decorator.setAttribute('aria-expanded', 'false');
        this.registerDomEvent(decorator, 'click', event => {
            event.preventDefault();
            event.stopPropagation();
            this.show(decorator, card, event.detail > 0 ? { x: event.clientX, y: event.clientY } : undefined);
        });
        this.registerDomEvent(decorator, 'keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            this.show(decorator, card);
        });
    }

    private show(button: HTMLElement, card: HTMLElement, pointer?: { x: number; y: number }): void {
        if (this.busy) return;
        if (this.palette) { this.closePalette(); return; }
        // Assign before loading: lifecycle callbacks may close the palette immediately.
        this.palette = new HighlightColorPalette(button, this.getHighlight().backgroundColor,
            color => { void this.change(color, button, card); }, () => this.closePalette(), pointer);
        this.addChild(this.palette);
    }

    private closePalette(): void {
        if (this.palette) this.removeChild(this.palette);
        this.palette = undefined;
    }

    private async change(color: HighlightColor | null, button: HTMLElement, card: HTMLElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        button.setAttribute('aria-disabled', 'true');
        try {
            const highlight = this.getHighlight();
            const updated = await this.plugin.highlightService.changeHighlightColor(highlight, color);
            Object.assign(highlight, updated, { [HIGHLIGHT_SOURCE]: updated });
            button.style.backgroundColor = updated.backgroundColor || '';
            card.setAttribute('data-highlight', JSON.stringify(highlight));
        } catch (error) {
            console.error('[HiNote] Could not change highlight color:', error);
            new Notice(t('Could not change highlight color. Refresh the highlights and try again.'));
        } finally {
            this.busy = false;
            button.removeAttribute('aria-disabled');
        }
    }

    onunload(): void { this.closePalette(); }
}

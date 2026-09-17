import { Component, Notice, setIcon } from 'obsidian';
import type CommentPlugin from '../../../main';
import { HIGHLIGHT_SOURCE, HighlightInfo } from '../../types/highlight';
import { HighlightColorPalette } from '../../components/highlight/card/ColorPalette';
import { defaultHighlightCardRegistry } from '../../components/highlight/HighlightCardRegistry';
import type { HighlightColor } from '../../services/highlight/HighlightColor';
import { t } from '../../i18n';

export class BatchColorOperations extends Component {
    private palette?: HighlightColorPalette;
    private busy = false;
    private button?: HTMLButtonElement;
    private buttonEvents?: Component;
    constructor(private plugin: CommentPlugin, private selected: () => Set<HighlightInfo>,
        private container: HTMLElement) { super(); }

    addButton(toolbar: HTMLElement): void {
        this.clearButton();
        this.buttonEvents = this.addChild(new Component());
        const button = toolbar.createEl('button', { cls: 'multi-select-action-button',
            attr: { type: 'button', 'aria-label': t('Change color'), 'aria-haspopup': 'menu' } });
        this.button = button;
        setIcon(button, 'palette');
        button.disabled = this.busy || ![...this.selected()].some(h => this.plugin.highlightService.canChangeHighlightColor(h));
        this.buttonEvents.registerDomEvent(button, 'click', event => {
            event.stopPropagation();
            if (this.busy) return;
            if (this.palette) { this.closePalette(); return; }
            const rows = [...this.selected()];
            const eligible = rows.filter(h => this.plugin.highlightService.canChangeHighlightColor(h));
            const current = eligible.length && eligible.every(h => h.backgroundColor === eligible[0].backgroundColor)
                ? eligible[0].backgroundColor : 'mixed';
            this.palette = new HighlightColorPalette(button, current, color => { void this.apply(rows, color, button); },
                () => this.closePalette(), undefined, 'above');
            this.addChild(this.palette);
        });
    }

    clearButton(): void {
        this.closePalette();
        if (this.buttonEvents) this.removeChild(this.buttonEvents);
        this.buttonEvents = undefined;
        this.button = undefined;
    }

    closePalette(): void {
        if (this.palette) this.removeChild(this.palette);
        this.palette = undefined;
    }

    private async apply(rows: HighlightInfo[], color: HighlightColor | null, button: HTMLButtonElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        button.disabled = true;
        try {
            const result = await this.plugin.highlightService.batchChangeHighlightColors(rows, color);
            result.updated.forEach((scan, row) => Object.assign(row, scan, { [HIGHLIGHT_SOURCE]: scan }));
            defaultHighlightCardRegistry.refreshMetadataWithin(this.container);
            new Notice(t('Highlight colors updated: {success}; skipped: {skipped}; failed: {failed}.')
                .replace('{success}', String(result.updated.size)).replace('{skipped}', String(result.skipped))
                .replace('{failed}', String(result.failed)) + (result.failed ? ' ' + t('Refresh the highlights and try again.') : ''));
        } catch (error) {
            console.error('[HiNote] Batch color update failed:', error);
            new Notice(t('Could not change highlight color. Refresh the highlights and try again.'));
        } finally {
            this.busy = false;
            if (this.button) this.button.disabled = ![...this.selected()].some(h => this.plugin.highlightService.canChangeHighlightColor(h));
        }
    }
    onunload(): void { this.closePalette(); }
}

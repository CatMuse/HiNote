import { Component } from 'obsidian';
import { HIGHLIGHT_COLOR_CHOICES } from '../../../services/highlight/HighlightColorEdit';
import { HighlightColor, highlightColorStyle } from '../../../services/highlight/HighlightColor';
import { t } from '../../../i18n';

/** A compact, keyboard-accessible palette attached to the trigger's window. */
export class HighlightColorPalette extends Component {
    private static active?: HighlightColorPalette;
    private element?: HTMLElement;

    constructor(
        private trigger: HTMLElement,
        private current: string | undefined,
        private onSelect: (color: HighlightColor | null) => void,
        private onClose: () => void,
        private pointer?: { x: number; y: number }
    ) { super(); }

    onload(): void {
        HighlightColorPalette.active?.close();
        HighlightColorPalette.active = this;
        const doc = this.trigger.ownerDocument;
        const win = doc.defaultView;
        if (!win) return;
        const palette = this.element = doc.body.createDiv({
            cls: 'hinote-color-palette',
            attr: { role: 'menu', 'aria-label': t('Change highlight color') }
        });
        this.trigger.setAttribute('aria-expanded', 'true');
        this.registerDomEvent(palette, 'click', event => event.stopPropagation());
        const swatches: HTMLButtonElement[] = [];
        let selected = 0;
        HIGHLIGHT_COLOR_CHOICES.forEach((choice, index) => {
            const checked = choice.color ? this.current === highlightColorStyle(choice.color) :
                !this.current || ['#ffeb3b', 'var(--text-highlight-bg, #ffeb3b)', highlightColorStyle('yellow')].includes(this.current);
            if (checked) selected = index;
            const swatch = palette.createEl('button', {
                cls: 'hinote-color-swatch',
                attr: {
                    type: 'button', role: 'menuitemradio', tabindex: '-1',
                    'aria-label': t(choice.label), 'aria-checked': String(checked), title: t(choice.label)
                }
            });
            swatch.style.setProperty('--swatch-color', highlightColorStyle(choice.color || 'yellow'));
            swatches.push(swatch);
            this.registerDomEvent(swatch, 'click', event => {
                event.preventDefault();
                event.stopPropagation();
                this.close(true);
                this.onSelect(choice.color);
            });
        });
        const focus = (index: number) => {
            swatches.forEach((swatch, i) => { swatch.tabIndex = i === index ? 0 : -1; });
            swatches[index].focus({ preventScroll: true });
        };
        this.registerDomEvent(palette, 'keydown', event => {
            const index = swatches.indexOf(doc.activeElement as HTMLButtonElement);
            if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                focus(event.key === 'Home' ? 0 : event.key === 'End' ? swatches.length - 1 :
                    (index + (event.key === 'ArrowRight' ? 1 : -1) + swatches.length) % swatches.length);
            } else if (event.key === 'Escape' || event.key === 'Tab') {
                if (event.key === 'Escape') event.preventDefault();
                event.stopPropagation();
                this.close(true);
            }
        });
        this.registerDomEvent(doc, 'pointerdown', event => {
            const target = event.target as Node;
            if (!palette.contains(target) && !this.trigger.contains(target)) this.close();
        });
        this.registerDomEvent(win, 'resize', () => this.close());
        this.registerDomEvent(doc, 'scroll', () => this.close(), true);
        const anchor = this.trigger.getBoundingClientRect();
        const rect = palette.getBoundingClientRect();
        const x = this.pointer?.x ?? anchor.right;
        const y = this.pointer?.y ?? (anchor.top + Math.min(anchor.height, 24) / 2);
        const preferredLeft = x + 12;
        const side = preferredLeft + rect.width <= win.innerWidth - 8 ? preferredLeft : x - rect.width - 12;
        const left = Math.max(8, Math.min(side, win.innerWidth - rect.width - 8));
        const top = Math.max(8, Math.min(y - rect.height / 2, win.innerHeight - rect.height - 8));
        palette.style.left = `${left}px`;
        palette.style.top = `${top}px`;
        focus(selected);
    }

    private close(restoreFocus = false): void {
        if (restoreFocus && this.trigger.isConnected) this.trigger.focus({ preventScroll: true });
        this.onClose();
    }

    onunload(): void {
        this.element?.remove();
        this.trigger.setAttribute('aria-expanded', 'false');
        if (HighlightColorPalette.active === this) HighlightColorPalette.active = undefined;
    }
}

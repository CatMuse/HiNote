import { t } from '../../../i18n';
import type { FlashcardState } from '../../../flashcard/types/FSRSTypes';

let nextEditorId = 0;

/** Local draft only: switching tabs and restoring never write to storage. */
export class HiCardFrontEditor {
    private input: HTMLTextAreaElement;
    private followingSource: boolean;
    private restored = false;

    constructor(container: HTMLElement, private card: FlashcardState, source: string | null, openSource: () => void) {
        this.followingSource = !card.frontCustomized;
        const host = container.createDiv({ cls: 'hicard-front-editor' });
        const tabs = host.createDiv({ cls: 'hicard-front-tabs', attr: { role: 'tablist', 'aria-label': t('Card content') } });
        const id = `hicard-front-${++nextEditorId}`;
        const labels = [t('Card front'), t('Source text')];
        const buttons = labels.map((text, index) => tabs.createEl('button', {
            text, attr: { type: 'button', role: 'tab', id: `${id}-tab-${index}`, 'aria-controls': `${id}-panel-${index}` }
        }));
        const panels = labels.map((_label, index) => host.createDiv({ attr: {
            role: 'tabpanel', id: `${id}-panel-${index}`, 'aria-labelledby': `${id}-tab-${index}`
        } }));
        this.input = panels[0].createEl('textarea', { attr: { rows: '5', 'aria-label': t('Card front') } });
        this.input.value = card.text;
        const restore = panels[0].createEl('button', {
            text: t('Restore source text'), cls: 'hicard-front-restore', attr: { type: 'button' }
        });
        const updateRestoreButton = (): void => {
            restore.hidden = this.followingSource;
            restore.disabled = source === null;
        };
        this.input.addEventListener('input', () => {
            this.followingSource = !card.frontCustomized && !this.restored && this.input.value === card.text;
            updateRestoreButton();
        });
        restore.addEventListener('click', () => {
            if (source === null) return;
            this.input.value = source;
            this.followingSource = true;
            this.restored = true;
            updateRestoreButton();
        });
        panels[1].createDiv({ cls: 'hicard-source-text', text: source ?? t('The source highlight is unavailable. Try again after locating it.') });
        if (source !== null) {
            panels[1].createEl('button', { text: t('Open source'), attr: { type: 'button' } })
                .addEventListener('click', openSource);
        }
        const select = (index: number): void => {
            buttons.forEach((button, i) => {
                button.setAttribute('aria-selected', String(i === index));
                button.tabIndex = i === index ? 0 : -1;
                panels[i].hidden = i !== index;
            });
        };
        buttons.forEach((button, index) => {
            button.addEventListener('click', () => select(index));
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
                select(next);
                buttons[next].focus();
            });
        });
        select(0);
        updateRestoreButton();
    }

    hasChanges(): boolean {
        return this.restored || this.input.value !== this.card.text;
    }

    /** undefined = untouched; null = restore following; string = custom front. */
    getChange(): string | null | undefined {
        if (this.followingSource) return this.restored ? null : undefined;
        if (this.card.frontCustomized && this.input.value === this.card.text) return undefined;
        const text = this.input.value.trim();
        if (!text) throw new Error(t('Card front cannot be empty.'));
        return text;
    }
}

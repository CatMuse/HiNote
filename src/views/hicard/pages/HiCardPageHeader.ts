import { setIcon } from 'obsidian';
import { t } from '../../../i18n';
import type { HiCardManagementViewMode } from '../../../flashcard/types/FSRSTypes';

export function renderHiCardPageHeader(
    container: HTMLElement,
    title: string,
    description: string
): HTMLElement {
    const header = container.createDiv({ cls: 'hicard-page-header' });
    const copy = header.createDiv({ cls: 'hicard-page-heading' });
    copy.createEl('h2', { text: title });
    copy.createEl('p', { text: description });
    return header.createDiv({ cls: 'hicard-page-actions' });
}

export function renderHiCardViewToggle(
    container: HTMLElement,
    mode: HiCardManagementViewMode,
    onChange: (mode: HiCardManagementViewMode) => void
): void {
    const toggle = container.createDiv({
        cls: 'hicard-view-toggle',
        attr: { role: 'group', 'aria-label': t('View') }
    });
    const options: Array<{ mode: HiCardManagementViewMode; icon: string; label: string }> = [
        { mode: 'list', icon: 'list', label: t('List view') },
        { mode: 'grid', icon: 'layout-grid', label: t('Grid view') }
    ];
    for (const option of options) {
        const button = toggle.createEl('button', {
            cls: `clickable-icon hicard-view-toggle-button${option.mode === mode ? ' is-active' : ''}`,
            attr: {
                type: 'button',
                'aria-label': option.label,
                'aria-pressed': String(option.mode === mode),
                'data-tooltip-position': 'top'
            }
        });
        button.setAttribute('data-tooltip', option.label);
        setIcon(button, option.icon);
        button.addEventListener('click', () => onChange(option.mode));
    }
}

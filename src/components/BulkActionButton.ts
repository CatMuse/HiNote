import { setIcon } from 'obsidian';

export interface BulkActionButtonOptions {
    icon: string;
    label: string;
    action: (button: HTMLButtonElement, event: MouseEvent) => void | Promise<void>;
    destructive?: boolean;
    disabled?: boolean;
    hasPopup?: boolean;
}

/** Create an icon-only bulk action button with the same behavior as HiNote's highlight toolbar. */
export function createBulkActionButton(
    container: HTMLElement,
    options: BulkActionButtonOptions
): HTMLButtonElement {
    const button = container.createEl('button', {
        cls: `multi-select-action-button clickable-icon${options.destructive ? ' delete-highlight-button' : ''}`,
        attr: {
            type: 'button',
            'aria-label': options.label,
            'data-tooltip-position': 'top',
            ...(options.hasPopup ? { 'aria-haspopup': 'menu' } : {})
        }
    });
    button.setAttribute('data-tooltip', options.label);
    button.disabled = options.disabled ?? false;
    setIcon(button, options.icon);
    button.addEventListener('click', event => {
        event.stopPropagation();
        if (button.disabled) return;
        void options.action(button, event);
    });
    return button;
}

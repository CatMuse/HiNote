import { Notice, Plugin } from 'obsidian';
import { t } from '../i18n';
import type { WindowManager } from '../plugin/WindowManager';

export async function openHiCard(windowManager: WindowManager): Promise<void> {
    try {
        await windowManager.openHiCard();
    } catch (error) {
        console.error('[HiCard] Could not open view:', error);
        new Notice(t('Unable to open HiCard. Try again.'));
    }
}

export function registerOpenHiCardCommand(plugin: Plugin, windowManager: WindowManager): void {
    plugin.addCommand({
        id: 'open-hicard',
        name: t('Open HiCard'),
        callback: () => openHiCard(windowManager)
    });
}

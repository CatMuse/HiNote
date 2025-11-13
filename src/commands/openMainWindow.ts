import { Plugin } from 'obsidian';
import { t } from '../i18n';
import { WindowManager } from '../services/WindowManager';

/**
 * 在主窗口打开评论面板命令
 */
export async function openMainWindow(
    plugin: Plugin,
    windowManager: WindowManager,
    ensureInitialized: () => Promise<void>
): Promise<void> {
    await ensureInitialized();
    await windowManager.openCommentPanelInMainWindow();
}

/**
 * 注册命令
 */
export function registerOpenMainWindowCommand(
    plugin: Plugin,
    windowManager: WindowManager,
    ensureInitialized: () => Promise<void>
): void {
    plugin.addCommand({
        id: 'open-comment-main-window',
        name: t('Open in main window'),
        callback: () => openMainWindow(plugin, windowManager, ensureInitialized)
    });
}

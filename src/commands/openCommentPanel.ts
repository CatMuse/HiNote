import { Plugin } from 'obsidian';
import { t } from '../i18n';
import { WindowManager } from '../services/WindowManager';

/**
 * 在右侧边栏打开评论面板命令
 */
export async function openCommentPanel(
    plugin: Plugin,
    windowManager: WindowManager,
    ensureInitialized: () => Promise<void>
): Promise<void> {
    await ensureInitialized();
    await windowManager.openCommentPanelInSidebar();
}

/**
 * 注册命令
 */
export function registerOpenCommentPanelCommand(
    plugin: Plugin,
    windowManager: WindowManager,
    ensureInitialized: () => Promise<void>
): void {
    plugin.addCommand({
        id: 'open-comment-window',
        name: t('Open in right sidebar'),
        callback: () => openCommentPanel(plugin, windowManager, ensureInitialized)
    });
}

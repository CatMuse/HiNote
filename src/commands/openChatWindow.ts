import { Plugin } from 'obsidian';
import { t } from '../i18n';
import { ChatViewManager } from '../view/chat/ChatViewManager';

/**
 * 打开 AI 对话窗口命令
 */
export async function openChatWindow(
    plugin: Plugin,
    ensureInitialized: () => Promise<void>
): Promise<void> {
    await ensureInitialized();
    const chatView = ChatViewManager.getInstance(plugin.app, plugin as any);
    chatView.show();
}

/**
 * 注册命令
 */
export function registerOpenChatWindowCommand(
    plugin: Plugin,
    ensureInitialized: () => Promise<void>
): void {
    plugin.addCommand({
        id: 'open-chat-window',
        name: t('Open AI chat window'),
        callback: () => openChatWindow(plugin, ensureInitialized)
    });
}

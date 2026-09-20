import { Plugin } from 'obsidian';
import type CommentPlugin from '../../main';
import { WindowManager } from '../plugin/WindowManager';
import { registerOpenCommentPanelCommand } from './openCommentPanel';
import { registerOpenMainWindowCommand } from './openMainWindow';
import { registerOpenHiCardCommand } from './openHiCard';
import { registerSmartHighlightCommand } from './smartHighlight';

/**
 * 注册所有命令
 * 这是命令注册的统一入口
 */
export function registerCommands(
    plugin: CommentPlugin,
    windowManager: WindowManager,
    ensureInitialized: () => Promise<void>
): void {
    // 注册打开评论面板命令（右侧边栏）
    registerOpenCommentPanelCommand(plugin, windowManager, ensureInitialized);
    
    // 注册在主窗口打开评论面板命令
    registerOpenMainWindowCommand(plugin, windowManager, ensureInitialized);
    registerOpenHiCardCommand(plugin, windowManager);
    registerSmartHighlightCommand(plugin, ensureInitialized);
}

/**
 * 获取窗口管理器实例
 * 用于 main.ts 中的 ribbon 按钮
 */
export function createWindowManager(plugin: Plugin): WindowManager {
    return new WindowManager(plugin.app);
}

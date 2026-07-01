import type { WorkspaceLeaf } from 'obsidian';
import type CommentPlugin from '../../main';
import { createWindowManager, registerCommands } from '../commands';
import { WindowManager } from './WindowManager';
import { HiNoteView, VIEW_TYPE_HINOTE } from '../views/hinote/HiNoteView';

export function createPluginWindowManager(plugin: CommentPlugin): WindowManager {
    return createWindowManager(plugin);
}

export function registerPluginViews(plugin: CommentPlugin): void {
    plugin.registerView(
        VIEW_TYPE_HINOTE,
        (leaf: WorkspaceLeaf) => {
            void plugin.ensureServicesInitialized();
            const services = plugin.requireInitializedServices();
            return new HiNoteView(leaf, plugin, services);
        }
    );
}

export function registerPluginRibbon(plugin: CommentPlugin, windowManager: WindowManager): void {
    plugin.addRibbonIcon(
        'highlighter',
        'HiNote',
        async () => {
            await plugin.ensureServicesInitialized();
            await windowManager.openCommentPanelInSidebar();
        }
    );
}

export function registerPluginCommands(plugin: CommentPlugin, windowManager: WindowManager): void {
    registerCommands(plugin, windowManager, async () => {
        await plugin.ensureServicesInitialized();
    });
}

export function registerPluginVaultEvents(plugin: CommentPlugin): void {
    plugin.registerEvent(
        plugin.app.vault.on('rename', async (file, oldPath) => {
            try {
                const services = await plugin.ensureServicesInitialized();
                await services.highlightManager.handleFileRename(oldPath, file.path);
            } catch (error) {
                console.error('[HiNote] Failed to migrate highlights after file rename:', error);
            }
        })
    );
}

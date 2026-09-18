import { navigationFlashField } from '../editor/NavigationFlash';
import { TFile, type WorkspaceLeaf } from 'obsidian';
import type CommentPlugin from '../../main';
import { createWindowManager, registerCommands } from '../commands';
import { WindowManager } from './WindowManager';
import { HiNoteView, VIEW_TYPE_HINOTE } from '../views/hinote/HiNoteView';
import { HiCardView, VIEW_TYPE_HICARD } from '../views/hicard/HiCardView';
import { openHiCard } from '../commands/openHiCard';

export function createPluginWindowManager(plugin: CommentPlugin): WindowManager {
    return createWindowManager(plugin);
}

export function registerPluginViews(plugin: CommentPlugin): void {
    plugin.registerEditorExtension(navigationFlashField);
    plugin.registerMarkdownPostProcessor((element, context) => {
        const section = context.getSectionInfo(element);
        if (!section) return;
        element.setAttribute('data-hinote-source-path', context.sourcePath);
        element.setAttribute('data-hinote-line-end', String(section.lineEnd));
        element.setAttribute('data-hinote-line-start', String(section.lineStart));
    });
    plugin.registerView(VIEW_TYPE_HICARD, leaf => new HiCardView(leaf, plugin));
    plugin.registerView(
        VIEW_TYPE_HINOTE,
        (leaf: WorkspaceLeaf) => {
            void plugin.ensureServicesInitialized().catch(error => console.error('[HiNote] Initialization failed:', error));
            const services = plugin.requireInitializedServices();
            return new HiNoteView(leaf, plugin, services);
        }
    );
}

export function registerPluginRibbon(plugin: CommentPlugin, windowManager: WindowManager): void {
    plugin.addRibbonIcon('book-heart', 'HiCard', () => openHiCard(windowManager));
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
        plugin.app.vault.on('rename', (file, oldPath) => {
            if (!(file instanceof TFile) || file.extension !== 'md') {
                return;
            }

            void (async () => {
                const services = await plugin.ensureServicesInitialized();
                await services.highlightManager.handleFileRename(oldPath, file.path);
            })().catch(error => {
                console.error('[HiNote] Failed to migrate highlights after file rename:', error);
            });
        })
    );
}

import type CommentPlugin from '../../main';
import { t } from '../i18n';
import { VIEW_TYPE_CONTEXT_MEMORY } from '../views/context-memory';

export function registerContextMemoryCommand(plugin: CommentPlugin, ensureInitialized: () => Promise<void>): void {
    plugin.addCommand({
        id: 'open-context-memory',
        name: t('Open context memory'),
        callback: async () => {
            await ensureInitialized();
            const existing = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_CONTEXT_MEMORY)[0];
            const leaf = existing || plugin.app.workspace.getRightLeaf(false);
            if (!leaf) return;
            if (!existing) await leaf.setViewState({ type: VIEW_TYPE_CONTEXT_MEMORY, active: true });
            await plugin.app.workspace.revealLeaf(leaf);
        }
    });
}

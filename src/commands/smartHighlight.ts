import type { Editor, MarkdownView } from 'obsidian';
import type CommentPlugin from '../../main';
import { t } from '../i18n';
import { SmartHighlightModal } from '../views/smart-highlight';

export function registerSmartHighlightCommand(plugin: CommentPlugin, ensureInitialized: () => Promise<void>): void {
    plugin.addCommand({
        id: 'suggest-smart-highlights',
        name: t('Suggest smart highlights'),
        editorCallback: async (editor: Editor, view: MarkdownView) => {
            await ensureInitialized();
            new SmartHighlightModal(plugin, editor, view).open();
        }
    });
}

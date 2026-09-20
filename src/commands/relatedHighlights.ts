import type { Editor, MarkdownView } from 'obsidian';
import type CommentPlugin from '../../main';
import { t } from '../i18n';
import { RelatedHighlightsModal } from '../views/related-highlights';

export function registerRelatedHighlightsCommand(plugin: CommentPlugin, ensureInitialized: () => Promise<void>): void {
    plugin.addCommand({
        id: 'show-related-highlights',
        name: t('Show related highlights'),
        editorCallback: async (editor: Editor, view: MarkdownView) => {
            await ensureInitialized();
            new RelatedHighlightsModal(plugin, editor, view).open();
        }
    });
}

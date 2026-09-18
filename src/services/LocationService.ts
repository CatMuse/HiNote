import { App, Component, MarkdownView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { HighlightInfo } from '../types/highlight';
import { findHighlightLocation } from './location/HighlightLocation';
import { NavigationFeedback } from './location/NavigationFeedback';
import { t } from '../i18n';

export class LocationService extends Component {
    private request = 0;
    private disposed = false;
    private feedback = new NavigationFeedback();

    constructor(private app: App) { super(); }

    onload(): void {
        this.disposed = false;
        this.register(() => {
            this.disposed = true;
            this.request++;
            this.feedback.clear();
        });
    }

    /** Reveal content without moving the caret, changing mode, or taking keyboard focus. */
    async jumpToHighlight(highlight: HighlightInfo, filePath: string): Promise<void> {
        if (this.disposed) return;
        const token = ++this.request;
        const current = () => !this.disposed && this.request === token;
        this.feedback.clear();
        if (!highlight.text.trim()) return;
        try {
            const leaf = await this.openOrActivateFile(filePath, current);
            if (!leaf || !current() || !(leaf.view instanceof MarkdownView) || leaf.view.file?.path !== filePath) return;
            const view = leaf.view;
            const editor = view.editor;
            const range = findHighlightLocation(editor.getValue(), highlight.text, highlight.position);
            if (!range) { new Notice(t('Could not locate the highlight.')); return; }
            const start = editor.offsetToPos(range.from);
            const end = editor.offsetToPos(range.to);
            if (view.getMode() === 'preview') {
                // startLoc/endLoc would request a selection; scroll alone preserves reading state.
                leaf.setEphemeralState({ scroll: start.line });
                this.feedback.showPreview(view, filePath, start.line, range);
            } else {
                editor.scrollIntoView({ from: start, to: end }, true);
                const cm = (editor as unknown as { cm?: EditorView }).cm;
                if (cm) this.feedback.showEditor(cm, range);
            }
        } catch (error) {
            if (!current()) return;
            console.error('[HiNote] Could not reveal highlight:', error);
            new Notice(t('Could not locate the highlight.'));
        }
    }

    private async openOrActivateFile(filePath: string, current: () => boolean): Promise<WorkspaceLeaf | null> {
        let leaf = this.app.workspace.getLeavesOfType('markdown')
            .find(candidate => (candidate.view as MarkdownView).file?.path === filePath);
        if (!leaf) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) { if (current()) new Notice(t('No corresponding file found.')); return null; }
            leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(file, { active: false });
        } else {
            await leaf.loadIfDeferred();
        }
        if (!current()) return null;
        this.app.workspace.setActiveLeaf(leaf, { focus: false });
        return leaf;
    }
}

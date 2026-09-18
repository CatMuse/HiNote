import { MarkdownView, TFile } from 'obsidian';
import type CommentPlugin from '../../../../main';
import type { HighlightInfo } from '../../../types/highlight';

export class HighlightCardFileNavigator {
    constructor(
        private plugin: CommentPlugin,
        private getHighlight: () => HighlightInfo,
        private getFileName: () => string | undefined
    ) {}

    bindOpenOnDoubleClick(element: HTMLElement): void {
        element.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            void this.openHighlightFile();
        });
    }

    bindPagePreview(element: HTMLElement, filePath: string | undefined): void {
        if (!filePath) return;

        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        let hoverTimeout: number | undefined;

        element.addEventListener('mouseenter', (event) => {
            hoverTimeout = window.setTimeout(() => {
                const target = event.target as HTMLElement;

                this.plugin.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300);
        });

        element.addEventListener('mouseleave', () => {
            if (hoverTimeout !== undefined) {
                window.clearTimeout(hoverTimeout);
            }
        });
    }

    private async openHighlightFile(): Promise<void> {
        const highlight = this.getHighlight();
        const filePath = highlight.filePath || this.getFileName();
        if (!filePath) return;

        const abstractFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(abstractFile instanceof TFile)) return;

        const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
        const activeMarkdownLeaf = this.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
        const targetLeaf = leaves.find(leaf => leaf !== activeMarkdownLeaf)
            || this.plugin.app.workspace.getLeaf('split', 'vertical');

        await targetLeaf.openFile(abstractFile);
        if (!highlight.sourceUnavailable) this.scrollToHighlight(targetLeaf.view, highlight);
    }

    private scrollToHighlight(view: unknown, highlight: HighlightInfo): void {
        if (!(view instanceof MarkdownView) || highlight.position === undefined) {
            return;
        }

        const pos = view.editor.offsetToPos(highlight.position);
        view.editor.setCursor(pos);
        view.editor.scrollIntoView({ from: pos, to: pos }, true);
    }
}

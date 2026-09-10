import { MarkdownView, setIcon, TFile } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import type { HighlightInfo } from '../../../types/highlight';
import { AIButton } from '../../AIButton';
import type { HighlightCardDragController } from './DragController';
import type { HighlightCardFileNavigator } from './FileNavigator';

interface HighlightCardTitleBarRendererOptions {
    plugin: CommentPlugin;
    getHighlight: () => HighlightInfo;
    getFileName: () => string | undefined;
    isInMainView: boolean;
    dragController: HighlightCardDragController;
    fileNavigator: HighlightCardFileNavigator;
    hasFlashcard: () => boolean;
    onAIResponse: (content: string) => Promise<void>;
    onMoreActions: (button: HTMLElement) => void;
}

export class HighlightCardTitleBarRenderer {
    constructor(private options: HighlightCardTitleBarRendererOptions) {}

    render(card: HTMLElement): void {
        const titleBar = card.createDiv({
            cls: 'highlight-card-title-bar'
        });
        const titleBarLeft = titleBar.createDiv({
            cls: 'highlight-card-title-left'
        });
        const titleBarRight = titleBar.createDiv({
            cls: 'highlight-card-title-right'
        });

        this.renderLeftSide(titleBarLeft);
        this.renderRightSide(titleBarRight);
    }

    private renderLeftSide(container: HTMLElement): void {
        const highlight = this.options.getHighlight();
        const fileName = this.options.getFileName();

        if ((this.options.isInMainView || highlight.isGlobalSearch) && fileName) {
            this.renderFileTitle(container, highlight, fileName);
            return;
        }

        this.renderHighlightTitle(container, highlight);
    }

    private renderFileTitle(container: HTMLElement, highlight: HighlightInfo, fileName: string): void {
        const fileIcon = container.createDiv({
            cls: 'highlight-card-icon',
            attr: {
                'aria-label': t('Open (DoubleClick)'),
            }
        });

        this.setTitleIcon(fileIcon, 'file');
        this.options.fileNavigator.bindOpenOnDoubleClick(fileIcon);

        const fileNameText = container.createSpan({
            text: fileName.replace(/\.md$/, ''),
            cls: 'highlight-card-title-text'
        });

        this.options.dragController.setup(container);
        this.options.fileNavigator.bindPagePreview(fileNameText, highlight.filePath || fileName);
    }

    private renderHighlightTitle(container: HTMLElement, highlight: HighlightInfo): void {
        const highlightIcon = container.createDiv({
            cls: 'highlight-card-icon'
        });

        this.setTitleIcon(highlightIcon, 'highlight');
        this.renderLineNumber(container, highlight);
        this.options.dragController.setup(container);
    }

    private renderLineNumber(container: HTMLElement, highlight: HighlightInfo): void {
        if (!highlight.filePath || typeof highlight.position !== 'number' || highlight.isGlobalSearch) {
            return;
        }

        const file = this.options.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
        if (!(file instanceof TFile)) {
            return;
        }

        const cachedLeaf = this.options.plugin.app.workspace.getLeavesOfType('markdown').find(leaf => {
            const view = leaf.view;
            return view instanceof MarkdownView && view.file?.path === file.path;
        });
        if (!cachedLeaf || !(cachedLeaf.view instanceof MarkdownView)) {
            return;
        }

        const pos = cachedLeaf.view.editor.offsetToPos(highlight.position);
        const lineNumberBadge = container.createDiv({
            cls: 'highlight-line-number-badge',
        });
        lineNumberBadge.createSpan({
            text: `L${pos.line + 1}`,
            cls: 'highlight-line-number'
        });
    }

    private renderRightSide(container: HTMLElement): void {
        new AIButton(
            container,
            {
                getText: () => this.options.getHighlight().text,
                getComments: () => (this.options.getHighlight().comments || [])
                    .map(comment => comment.content || '')
                    .join('\n')
            },
            this.options.plugin,
            {
                onResponse: this.options.onAIResponse,
                buttonClass: 'highlight-title-btn highlight-ai-btn',
                buttonIcon: 'sparkles',
                buttonLabel: t('AI comment'),
                position: 'titlebar',
            }
        );

        const moreActionsContainer = container.createDiv({
            cls: 'highlight-more-actions-container'
        });
        const moreActionsBtn = moreActionsContainer.createDiv({
            cls: 'highlight-title-btn highlight-more-btn',
            attr: { 'aria-label': t('More') }
        });
        setIcon(moreActionsBtn, 'ellipsis-vertical');

        moreActionsBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.options.onMoreActions(moreActionsBtn);
        });
    }

    private setTitleIcon(icon: HTMLElement, fallbackType: 'file' | 'highlight'): void {
        if (this.options.hasFlashcard()) {
            setIcon(icon, 'book-heart');
            icon.addClass('has-flashcard');
            return;
        }

        setIcon(icon, fallbackType === 'file' ? 'file-text' : 'highlighter');
    }
}

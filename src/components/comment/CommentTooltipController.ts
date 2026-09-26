import { App, Component, MarkdownRenderer } from 'obsidian';
import { formatDateTime, t } from '../../i18n';
import type { HighlightInfo } from '../../types/highlight';

export interface CommentTooltipBinding {
    hide: () => void;
    destroy: () => void;
}

/** One lazily-created tooltip per document, shared by every comment widget. */
export class CommentTooltipController {
    private static readonly controllers = new WeakMap<Document, CommentTooltipController>();
    private static readonly MAX_COMMENTS = 3;
    private static readonly MARGIN = 8;
    private static readonly GAP = 4;

    static bind(app: App, button: HTMLElement, anchor: HTMLElement, highlight: HighlightInfo): CommentTooltipBinding {
        const doc = button.ownerDocument;
        let controller = this.controllers.get(doc);
        if (!controller) {
            controller = new CommentTooltipController(app, doc);
            this.controllers.set(doc, controller);
        }
        controller.bindingCount++;

        const show = () => controller?.show(anchor, highlight);
        const hide = () => controller?.hide(anchor);
        button.addEventListener('mouseenter', show);
        button.addEventListener('mouseleave', hide);

        let destroyed = false;
        return {
            hide: () => controller?.hide(anchor),
            destroy: () => {
                if (destroyed || !controller) return;
                destroyed = true;
                button.removeEventListener('mouseenter', show);
                button.removeEventListener('mouseleave', hide);
                controller.hide(anchor);
                controller.bindingCount--;
                if (controller.bindingCount === 0) {
                    controller.destroy();
                    this.controllers.delete(doc);
                    controller = undefined;
                }
            }
        };
    }

    private tooltip?: HTMLElement;
    private renderComponent?: Component;
    private currentAnchor?: HTMLElement;
    private currentSignature = '';
    private renderVersion = 0;
    private bindingCount = 0;

    private constructor(private app: App, private doc: Document) {
        this.win.addEventListener('resize', this.reposition);
        this.doc.addEventListener('scroll', this.reposition, true);
    }

    private get win(): Window {
        return this.doc.defaultView || window;
    }

    private ensureTooltip(): HTMLElement {
        if (this.tooltip) return this.tooltip;
        this.tooltip = this.doc.body.createDiv({ cls: 'hi-note-tooltip hi-note-tooltip-hidden' });
        return this.tooltip;
    }

    private show(anchor: HTMLElement, highlight: HighlightInfo): void {
        const tooltip = this.ensureTooltip();
        this.currentAnchor = anchor;
        const signature = this.signature(highlight);
        if (signature !== this.currentSignature) {
            this.currentSignature = signature;
            void this.render(highlight, ++this.renderVersion);
        }
        tooltip.removeClass('hi-note-tooltip-hidden');
        this.updatePosition();
    }

    private hide(anchor?: HTMLElement): void {
        if (anchor && this.currentAnchor !== anchor) return;
        this.tooltip?.addClass('hi-note-tooltip-hidden');
        this.currentAnchor = undefined;
    }

    private async render(highlight: HighlightInfo, version: number): Promise<void> {
        const tooltip = this.ensureTooltip();
        this.renderComponent?.unload();
        this.renderComponent = new Component();
        this.renderComponent.load();
        tooltip.empty();
        if (highlight.id) tooltip.setAttribute('data-highlight-id', highlight.id);
        else tooltip.removeAttribute('data-highlight-id');

        const comments = highlight.comments || [];
        const list = tooltip.createDiv({ cls: 'hi-note-tooltip-list' });
        const renders = comments.slice(0, CommentTooltipController.MAX_COMMENTS).map(async comment => {
            const item = list.createDiv({ cls: 'hi-note-tooltip-item' });
            const content = item.createDiv({ cls: 'hi-note-tooltip-content markdown-rendered' });
            try {
                await MarkdownRenderer.render(this.app, comment.content, content, '', this.renderComponent!);
                content.querySelectorAll('ul, ol').forEach(element => element.addClass('tooltip-markdown-list'));
            } catch (error) {
                console.error('[HiNote] Could not render comment tooltip:', error);
                content.textContent = comment.content;
            }
            item.createDiv({ cls: 'hi-note-tooltip-time', text: formatDateTime(comment.createdAt) });
        });

        if (comments.length > CommentTooltipController.MAX_COMMENTS) {
            tooltip.createDiv({
                cls: 'hi-note-tooltip-more',
                text: t('{count} more comments…', { count: comments.length - CommentTooltipController.MAX_COMMENTS })
            });
        }

        await Promise.all(renders);
        if (version !== this.renderVersion || !this.currentAnchor) return;
        this.updatePosition();
    }

    private signature(highlight: HighlightInfo): string {
        return `${highlight.recordId || highlight.id || highlight.scanKey || highlight.position}:${(highlight.comments || [])
            .map(comment => `${comment.id}:${comment.updatedAt}:${comment.content}`).join('|')}`;
    }

    private reposition = (): void => {
        if (this.currentAnchor && this.tooltip && !this.tooltip.hasClass('hi-note-tooltip-hidden')) {
            this.updatePosition();
        }
    };

    private updatePosition(): void {
        const anchor = this.currentAnchor;
        const tooltip = this.tooltip;
        if (!anchor || !tooltip || !anchor.isConnected) {
            this.hide();
            return;
        }
        const rect = anchor.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const margin = CommentTooltipController.MARGIN;
        tooltip.addClass('hi-note-tooltip-positioned');

        let left = this.win.innerWidth - rect.left - margin >= tooltipRect.width
            ? rect.left
            : rect.right - tooltipRect.width;
        left = Math.min(Math.max(left, margin), Math.max(margin, this.win.innerWidth - tooltipRect.width - margin));

        let top = rect.bottom + CommentTooltipController.GAP;
        if (top + tooltipRect.height + margin > this.win.innerHeight) {
            top = rect.top - tooltipRect.height - CommentTooltipController.GAP;
        }
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(margin, top)}px`;
    }

    private destroy(): void {
        this.renderVersion++;
        this.renderComponent?.unload();
        this.renderComponent = undefined;
        this.tooltip?.remove();
        this.tooltip = undefined;
        this.currentAnchor = undefined;
        this.win.removeEventListener('resize', this.reposition);
        this.doc.removeEventListener('scroll', this.reposition, true);
    }
}

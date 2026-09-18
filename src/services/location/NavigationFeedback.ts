import type { MarkdownView } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { navigationFlashEffect, navigationFlashField, type NavigationRange } from '../../editor/NavigationFlash';

const DURATION = 1500;

/** One hint per sidebar, with explicit cleanup on navigation and view disposal. */
export class NavigationFeedback {
    private cleanup?: () => void;

    clear(): void { this.cleanup?.(); this.cleanup = undefined; }

    showEditor(view: EditorView, range: NavigationRange): void {
        this.clear();
        if (!view.state.field(navigationFlashField, false)) return;
        view.dispatch({ effects: navigationFlashEffect.of(range) });
        const timer = window.setTimeout(() => this.clear(), DURATION);
        this.cleanup = () => {
            window.clearTimeout(timer);
            if (view.dom.isConnected && view.state.field(navigationFlashField, false)) {
                view.dispatch({ effects: navigationFlashEffect.of(null) });
            }
        };
    }

    showPreview(view: MarkdownView, filePath: string, line: number, range: NavigationRange): void {
        this.clear();
        const root = view.previewMode.containerEl;
        let target: HTMLElement | undefined;
        let expiration: number | undefined;
        const current = () => root.isConnected && view.file?.path === filePath && view.getMode() === 'preview';
        const findTarget = (): HTMLElement | undefined => {
            // Exact source spans are supplied by the existing preview highlight renderer.
            const marks = root.querySelectorAll<HTMLElement>('[data-hinote-source-from]');
            for (const mark of Array.from(marks)) {
                if (mark.getAttribute('data-hinote-source-path') === filePath &&
                    Number(mark.getAttribute('data-hinote-source-from')) <= range.from &&
                    Number(mark.getAttribute('data-hinote-source-to')) >= range.to) return mark;
            }
            // Custom syntax or formatted text can fall back to its rendered source section.
            return Array.from(root.querySelectorAll<HTMLElement>('[data-hinote-line-start]'))
                .filter(element => element.getAttribute('data-hinote-source-path') === filePath &&
                    Number(element.getAttribute('data-hinote-line-start')) <= line &&
                    Number(element.getAttribute('data-hinote-line-end')) >= line)
                .sort((a, b) => (Number(a.getAttribute('data-hinote-line-end')) - Number(a.getAttribute('data-hinote-line-start'))) -
                    (Number(b.getAttribute('data-hinote-line-end')) - Number(b.getAttribute('data-hinote-line-start'))))[0];
        };
        const reveal = () => {
            if (!current()) { this.clear(); return; }
            const next = findTarget();
            if (!next || next === target) return;
            target?.removeClass('hinote-navigation-flash');
            target = next;
            target.addClass('hinote-navigation-flash');
            target.scrollIntoView({ block: 'center', behavior: 'auto' });
            if (expiration !== undefined) window.clearTimeout(expiration);
            expiration = window.setTimeout(() => this.clear(), DURATION);
        };
        // Reading view renders distant sections lazily; watch only the target pane.
        const observer = new MutationObserver(reveal);
        observer.observe(root, { childList: true, subtree: true, attributes: true,
            attributeFilter: ['data-hinote-source-from', 'data-hinote-source-to', 'data-hinote-line-start'] });
        const deadline = window.setTimeout(() => this.clear(), 3000);
        this.cleanup = () => {
            observer.disconnect();
            window.clearTimeout(deadline);
            if (expiration !== undefined) window.clearTimeout(expiration);
            target?.removeClass('hinote-navigation-flash');
        };
        reveal();
    }
}

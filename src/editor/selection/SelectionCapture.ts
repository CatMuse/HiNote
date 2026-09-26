import { MarkdownView, editorInfoField, editorLivePreviewField } from 'obsidian';
import { EditorView, type Rect } from '@codemirror/view';
import type { EditorFeatureContext } from '../../types/plugin';
import { HighlightExtractor } from '../../services/highlight/HighlightExtractor';
import {
    readPreviewSection,
    resolvePreviewSelection,
    resolveSourceSelection,
    type SelectionRangePlan
} from './SelectionRangeResolver';

export interface SelectionContext {
    view?: EditorView;
    markdownView: MarkdownView;
    file: import('obsidian').TFile;
    snapshot: string;
    plan: SelectionRangePlan;
}

export interface CapturedSelection {
    context: SelectionContext;
    anchor: Rect;
}

/** Resolves DOM or CodeMirror interactions back to stable source ranges. */
export class SelectionCapture {
    constructor(
        private plugin: EditorFeatureContext,
        private extractor: HighlightExtractor
    ) {}

    getMarkdownView(): MarkdownView | null {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    getEditorView(): EditorView | null {
        const editor = this.getMarkdownView()?.editor as unknown as { cm?: EditorView } | undefined;
        return editor?.cm || null;
    }

    isPreview(): boolean {
        const markdownView = this.getMarkdownView();
        const editor = this.getEditorView();
        return markdownView?.getMode() === 'preview'
            || (!!editor && editor.state.field(editorLivePreviewField, false) === true);
    }

    async captureSelection(): Promise<CapturedSelection | null> {
        const markdownView = this.getMarkdownView();
        const view = this.getEditorView();
        if (!markdownView) return null;
        const file = view?.state.field(editorInfoField, false)?.file || markdownView.file;
        if (!file || !this.extractor.shouldProcessFile(file)) return null;
        const isReadingPreview = markdownView.getMode() === 'preview';
        const snapshot = view && !isReadingPreview
            ? view.state.doc.toString()
            : await this.plugin.app.vault.read(file);
        const scans = this.extractor.extractHighlights(snapshot, file);

        if (isReadingPreview) {
            const selection = activeDocument.getSelection();
            if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
            const range = selection.getRangeAt(0);
            const host = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                ? range.commonAncestorContainer as Element
                : range.commonAncestorContainer.parentElement;
            const sectionElement = host?.closest<HTMLElement>('[data-hinote-source-path]');
            const section = sectionElement ? readPreviewSection(sectionElement) : null;
            if (!section || section.sourcePath !== file.path) return null;
            const plan = resolvePreviewSelection(snapshot, section, selection.toString(), scans);
            const anchor = this.selectionRect(range);
            return plan && anchor
                ? { context: { view: undefined, markdownView, file, snapshot, plan }, anchor }
                : null;
        }

        if (!view || !view.hasFocus) return null;
        const selection = view.state.selection.main;
        if (selection.empty) return null;
        const plan = resolveSourceSelection(snapshot, selection.from, selection.to, scans);
        const anchor = this.editorRangeRect(view, selection.from, selection.to);
        if (!plan || !anchor) return null;
        return { context: { view, markdownView, file, snapshot, plan }, anchor };
    }

    async captureHighlightClick(event: MouseEvent): Promise<CapturedSelection | null> {
        const markdownView = this.getMarkdownView();
        return this.isPreview() && markdownView?.getMode() === 'preview'
            ? this.captureReadingHighlightClick(event)
            : this.captureEditorHighlightClick(event);
    }

    private captureEditorHighlightClick(event: MouseEvent): CapturedSelection | null {
        const markdownView = this.getMarkdownView();
        const view = this.getEditorView();
        const file = view?.state.field(editorInfoField, false)?.file || markdownView?.file;
        if (!markdownView || !view || !file || !this.extractor.shouldProcessFile(file) || !view.dom.isConnected) {
            return null;
        }
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null || position === undefined) return null;
        const snapshot = view.state.doc.toString();
        const scan = this.extractor.extractHighlights(snapshot, file).find(item =>
            item.syntax === 'markdown'
            && item.position <= position
            && position <= item.position + item.originalLength
        );
        if (!scan) return null;
        const anchor = this.editorRangeRect(view, scan.position, scan.position + scan.originalLength);
        if (!anchor) return null;
        return {
            context: {
                view,
                markdownView,
                file,
                snapshot,
                plan: { from: scan.position, to: scan.position + scan.originalLength, source: scan }
            },
            anchor
        };
    }

    private async captureReadingHighlightClick(event: MouseEvent): Promise<CapturedSelection | null> {
        const markdownView = this.getMarkdownView();
        const file = markdownView?.file;
        const target = event.target as HTMLElement | null;
        const mark = target?.closest<HTMLElement>('mark, span.highlight');
        if (!markdownView || !file || !mark || !this.extractor.shouldProcessFile(file)) return null;
        if (mark.dataset.hinoteSourcePath !== file.path) return null;
        const snapshot = await this.plugin.app.vault.read(file);
        const scans = this.extractor.extractHighlights(snapshot, file);
        const sourceFrom = Number(mark.dataset.hinoteSourceFrom);
        const sourceTo = Number(mark.dataset.hinoteSourceTo);
        const exactScan = Number.isInteger(sourceFrom) && Number.isInteger(sourceTo) && sourceTo > sourceFrom
            ? scans.find(scan => scan.position === sourceFrom && scan.position + scan.originalLength === sourceTo)
            : undefined;
        if (!exactScan) return null;
        return {
            context: {
                view: undefined,
                markdownView,
                file,
                snapshot,
                plan: { from: sourceFrom, to: sourceTo, source: exactScan }
            },
            anchor: mark.getBoundingClientRect()
        };
    }

    private selectionRect(range: Range): Rect | null {
        const rects = Array.from(range.getClientRects());
        const rect = rects.length
            ? rects.reduce((merged, current) => ({
                left: Math.min(merged.left, current.left),
                right: Math.max(merged.right, current.right),
                top: Math.min(merged.top, current.top),
                bottom: Math.max(merged.bottom, current.bottom)
            }), {
                left: rects[0].left,
                right: rects[0].right,
                top: rects[0].top,
                bottom: rects[0].bottom
            })
            : range.getBoundingClientRect();
        return rect.right > rect.left && rect.bottom > rect.top ? rect : null;
    }

    private editorRangeRect(view: EditorView, from: number, to: number): Rect | null {
        try {
            const start = view.domAtPos(from);
            const end = view.domAtPos(to);
            const range = view.dom.ownerDocument.createRange();
            range.setStart(start.node, start.offset);
            range.setEnd(end.node, end.offset);
            const rect = this.selectionRect(range);
            if (rect) return rect;
        } catch {
            // Virtualized or replaced content may not have a complete DOM range.
        }
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        return start && end ? {
            left: Math.min(start.left, end.left),
            right: Math.max(start.right, end.right),
            top: Math.min(start.top, end.top),
            bottom: Math.max(start.bottom, end.bottom)
        } : null;
    }
}

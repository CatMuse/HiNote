import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { MarkdownView, TFile } from "obsidian";
import { CommentWidget, CommentWidgetHelper } from "../components/comment";
import { HighlightRepository } from "../repositories/HighlightRepository";
import { HighlightService } from "../services/HighlightService";
import { HighlightCommentResolver } from "../services/highlight";
import { HighlightInfo as HiNote } from "../types/highlight";
import type { HiNotePluginContext } from "../types/plugin";

interface EditorHighlightDecorationOptions {
    plugin: HiNotePluginContext;
    highlightService: HighlightService;
    highlightRepository: HighlightRepository;
}

export function createEditorHighlightDecorations(options: EditorHighlightDecorationOptions) {
    const { plugin, highlightService, highlightRepository } = options;
    const highlightCommentResolver = new HighlightCommentResolver(highlightRepository);

    return ViewPlugin.fromClass(class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
                this.decorations = this.buildDecorations(update.view);
            }
        }

        private buildDecorations(view: EditorView): DecorationSet {
            const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
            const file = activeView?.file;

            if (!file || !highlightService.shouldProcessFile(file)) {
                return Decoration.none;
            }

            const decorations: Range<Decoration>[] = [];
            const highlights = highlightService.extractHighlights(view.state.doc.toString(), file);

            const resolved = highlightCommentResolver.resolveHighlights(file, highlights, {
                onTextChanged: (stored, current) => emitHighlightTextChange(plugin, file, stored, current)
            });
            for (const commentHighlight of resolved) {
                const highlight = commentHighlight;
                if (highlight.position === undefined) continue;

                const highlightEndPos = highlight.position + (highlight.originalLength ?? highlight.text.length + 4);

                if (shouldShowCommentWidget(plugin)) {
                    decorations.push(createCommentWidget(plugin, commentHighlight).range(highlightEndPos));
                }
            }

            return Decoration.set(decorations.sort((a, b) => a.from - b.from));
        }
    }, {
        decorations: value => value.decorations
    });
}

function createCommentWidget(plugin: HiNotePluginContext, highlight: HiNote): Decoration {
    return Decoration.widget({
        widget: new CommentWidget(
            plugin,
            highlight,
            () => {
                void CommentWidgetHelper.openCommentPanel(plugin.app, highlight, plugin.eventManager);
            }
        ),
        side: 2,
        stopEvent: (event: Event) => event.type === 'mousedown' || event.type === 'mouseup'
    });
}

function shouldShowCommentWidget(plugin: HiNotePluginContext): boolean {
    return plugin.settings.showCommentWidget !== false;
}

function emitHighlightTextChange(
    plugin: HiNotePluginContext,
    file: TFile,
    storedHighlight: HiNote,
    currentHighlight: HiNote
): void {
    if (storedHighlight.text === currentHighlight.text) return;

    plugin.eventManager.emitHighlightUpdate(
        file.path,
        storedHighlight.text,
        currentHighlight.text,
        currentHighlight.id ?? storedHighlight.id ?? ''
    );
}

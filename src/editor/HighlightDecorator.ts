import { Plugin, MarkdownView } from "obsidian";
import type { EditorView } from "@codemirror/view";
import { HighlightRepository } from "../repositories/HighlightRepository";
import { HighlightService } from '../services/HighlightService';
import { PreviewWidgetRenderer } from '../views/highlight';
import { createEditorHighlightDecorations } from "./EditorHighlightDecorations";
import type { HighlightEvents } from "../services/EventManager";
import type { EventManager } from "../services/EventManager";
import type { HiNotePluginContext } from "../types/plugin";

interface EditorWithCodeMirror {
    cm?: EditorView;
}

export class HighlightDecorator {
    private plugin: HiNotePluginContext;
    private highlightRepository: HighlightRepository;
    private highlightPlugin: ReturnType<typeof createEditorHighlightDecorations> | null = null;
    private highlightService: HighlightService;
    private previewRenderer: PreviewWidgetRenderer;

    constructor(
        plugin: Plugin,
        highlightRepository: HighlightRepository,
        highlightService: HighlightService,
        private eventManager: EventManager
    ) {
        this.plugin = plugin as HiNotePluginContext;
        this.highlightRepository = highlightRepository;
        this.highlightService = highlightService;
        this.previewRenderer = new PreviewWidgetRenderer(
            this.plugin,
            this.highlightRepository,
            this.highlightService
        );
    }

    /**
     * 强制刷新装饰器
     * 当评论数据发生变化时调用此方法来更新 CommentWidget 的显示
     */
    public refreshDecorations() {
        const view = this.getActiveMarkdownView();
        if (!view?.editor) return;
        
        const editorView = (view.editor as unknown as EditorWithCodeMirror).cm;
        if (!editorView) return;
        
        // 通过触发一个空的文档更新来强制重新构建装饰器
        // 这会导致 ViewPlugin 的 update 方法被调用，进而重新构建装饰器
        editorView.dispatch({
            changes: [],
            effects: []
        });
    }

    /** Refresh every reading-mode leaf showing the affected file. */
    private refreshPreviews(filePath?: string): void {
        for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
            if (!(leaf.view instanceof MarkdownView)) continue;
            const view = leaf.view;
            if (view.getMode() !== 'preview' || (filePath && view.file?.path !== filePath)) continue;
            view.previewMode.rerender(true);
        }
    }


    

    private getActiveMarkdownView() {
        return this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    }

    enable() {
        this.plugin.registerMarkdownPostProcessor((element, context) => {
            void this.previewRenderer.processPreview(element, context);
        });

        this.registerRefreshEvents();

        const highlightPlugin = createEditorHighlightDecorations({
            plugin: this.plugin,
            highlightService: this.highlightService,
            highlightRepository: this.highlightRepository
        });

        this.highlightPlugin = highlightPlugin;
        this.plugin.registerEditorExtension([highlightPlugin]);
    }

    private registerRefreshEvents(): void {
        const fileRefreshEvents: (keyof Pick<HighlightEvents,
            'comment:update' | 'comment:delete' | 'highlight:update' | 'highlight:delete'
        >)[] = [
            'comment:update',
            'comment:delete',
            'highlight:update',
            'highlight:delete'
        ];

        fileRefreshEvents.forEach(eventName => {
            this.plugin.registerEvent(
                this.eventManager.on(eventName, (filePath: string, ..._details: string[]) => {
                    this.refreshDecorations();
                    this.refreshPreviews(filePath);
                })
            );
        });

        this.plugin.registerEvent(
            this.eventManager.on('exclusions:changed', () => {
                this.refreshDecorations();
                this.refreshPreviews();
            })
        );
    }

    disable() {
        // 移除编辑器扩展
        if (this.highlightPlugin) {
            const view = this.getActiveMarkdownView();
            if (view?.editor) {
                // 刷新编辑器以移除所有装饰器
                view.editor.refresh();
            }
        }

        // 移除所有高亮评论按钮
        activeDocument.querySelectorAll('.hi-note-widget').forEach(el => el.remove());
    }
}

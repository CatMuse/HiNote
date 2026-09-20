import { ItemView, MarkdownView, WorkspaceLeaf, type Editor } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { LocationService } from '../../services/LocationService';
import { isFileComment } from '../../types/highlight';
import type { HighlightInfo } from '../../types/highlight';
import { RelatedHighlightRetriever, TypeSafeRelatedHighlightEngine, type RelatedHighlightRelation, type RelatedHighlightResult } from '../../services/related-highlights';

export const VIEW_TYPE_CONTEXT_MEMORY = 'hinote-context-memory';

const RELATION_LABELS: Record<RelatedHighlightRelation, string> = {
    supplement: 'Supplement', evidence: 'Supporting evidence', contrast: 'Contrast', similar: 'Similar idea',
    cause: 'Cause or mechanism', prerequisite: 'Prerequisite', extension: 'Further direction',
    application: 'Application', keyword: 'Keyword overlap', other: 'Other'
};

/** Live, local-first recommendations for the text around the active cursor. */
export class ContextMemoryView extends ItemView {
    private readonly retriever = new RelatedHighlightRetriever();
    private readonly locationService: LocationService;
    private results: RelatedHighlightResult[] = [];
    private resultsEl?: HTMLElement;
    private statusEl?: HTMLElement;
    private aiButton?: HTMLButtonElement;
    private debounceTimer: number | null = null;
    private generation = 0;
    private lastHighlightsAt = 0;
    private cachedHighlights: HighlightInfo[] = [];
    private lastEditor?: Editor;
    private lastMarkdownView?: MarkdownView;

    constructor(leaf: WorkspaceLeaf, private plugin: CommentPlugin) {
        super(leaf);
        this.locationService = new LocationService(plugin.app);
        this.locationService.load();
    }

    getViewType(): string { return VIEW_TYPE_CONTEXT_MEMORY; }
    getDisplayText(): string { return t('Context memory'); }
    getIcon(): string { return 'brain-circuit'; }

    async onOpen(): Promise<void> {
        this.contentEl.addClass('hinote-context-memory-view');
        this.contentEl.empty();
        this.contentEl.createEl('p', { cls: 'hinote-context-memory-disclosure',
            text: t('Local context recommendations update while you type. AI refinement only runs when you select it.') });
        const actions = this.contentEl.createDiv({ cls: 'hinote-context-memory-actions' });
        this.aiButton = actions.createEl('button', { cls: 'mod-cta', text: t('AI refine context') });
        this.aiButton.disabled = true;
        this.registerDomEvent(this.aiButton, 'click', () => { void this.refineWithAI(); });
        this.statusEl = this.contentEl.createDiv({ cls: 'hinote-context-memory-status', attr: { role: 'status' } });
        this.resultsEl = this.contentEl.createDiv({ cls: 'hinote-context-memory-results' });
        this.registerEvent(this.app.workspace.on('editor-change', editor => this.scheduleRefresh(editor)));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            if (this.app.workspace.getActiveViewOfType(MarkdownView)) this.scheduleRefresh();
        }));
        this.scheduleRefresh();
    }

    private scheduleRefresh(editor?: Editor): void {
        const view = this.findMarkdownView();
        if (editor && view) {
            this.lastEditor = editor;
            this.lastMarkdownView = view;
        }
        if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
        this.debounceTimer = window.setTimeout(() => { this.debounceTimer = null; void this.refresh(editor); }, 750);
    }

    private async refresh(editor?: Editor): Promise<void> {
        const view = this.findMarkdownView();
        const activeEditor = editor || this.lastEditor || view?.editor;
        if (!view || !activeEditor || !view.file) {
            this.results = [];
            this.render(t('Open a Markdown note to see contextual highlights.'));
            return;
        }
        const currentRun = ++this.generation;
        this.setStatus(t('Finding context locally…'));
        try {
            await this.plugin.ensureServicesInitialized();
            const now = Date.now();
            if (now - this.lastHighlightsAt > 3000) {
                const groups = await this.plugin.highlightService.getAllHighlights();
                this.cachedHighlights = groups.flatMap(({ file, highlights }) => this.plugin.highlightService
                    .mergeHighlightsWithComments(highlights,
                        this.plugin.highlightRepository.getCachedHighlights(file.path) || [], file))
                    .filter(item => !isFileComment(item));
                this.lastHighlightsAt = now;
            }
            const context = this.contextAroundCursor(activeEditor);
            this.results = this.retriever.search(view.file.path, context, this.cachedHighlights, 20);
            if (currentRun !== this.generation) return;
            this.render(t('Showing {count} local context recommendations.', { count: Math.min(5, this.results.length) }));
        } catch (error) {
            if (currentRun === this.generation) this.render(t('Context recommendations failed: {error}', { error: error instanceof Error ? error.message : String(error) }));
        }
    }

    private contextAroundCursor(editor: Editor): string {
        const cursor = editor.getCursor();
        const lines = editor.getValue().split('\n');
        const start = Math.max(0, cursor.line - 8);
        const end = Math.min(lines.length, cursor.line + 9);
        return lines.slice(start, end).join('\n').slice(0, 5000);
    }

    private findMarkdownView(): MarkdownView | undefined {
        const active = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (active) return active;
        if (this.lastMarkdownView?.file) return this.lastMarkdownView;
        const activePath = this.app.workspace.getActiveFile()?.path;
        const leaf = this.app.workspace.getLeavesOfType('markdown').find(candidate =>
            candidate.view instanceof MarkdownView && (!activePath || candidate.view.file?.path === activePath));
        return leaf?.view instanceof MarkdownView ? leaf.view : undefined;
    }

    private async refineWithAI(): Promise<void> {
        const view = this.findMarkdownView();
        if (!view || !this.results.length) return;
        const currentRun = ++this.generation;
        if (this.aiButton) this.aiButton.disabled = true;
        this.setStatus(t('AI is refining the current context…'));
        try {
            const settings = this.plugin.settings.smartHighlight;
            const engine = new TypeSafeRelatedHighlightEngine(this.plugin.app.secretStorage, settings.apiKeySecretId, settings.model || 'jev-1.13.0');
            const profile = this.retriever.profile(view.file?.path || '', this.contextAroundCursor(view.editor));
            this.results = await engine.rerank(profile, this.results, () => currentRun === this.generation && this.contentEl.isConnected);
            if (currentRun === this.generation) this.render(t('Showing {count} AI context recommendations.', { count: Math.min(5, this.results.length) }));
        } catch (error) {
            if (currentRun === this.generation) this.setStatus(t('AI context refinement failed: {error}', { error: error instanceof Error ? error.message : String(error) }));
        } finally {
            if (currentRun === this.generation && this.aiButton?.isConnected) this.aiButton.disabled = false;
        }
    }

    private render(status: string): void {
        this.setStatus(status);
        if (!this.resultsEl) return;
        this.resultsEl.empty();
        if (this.aiButton) this.aiButton.disabled = !this.results.length;
        for (const item of this.results.slice(0, 5)) {
            const card = this.resultsEl.createEl('button', { cls: 'hinote-context-memory-card', attr: { type: 'button' } });
            const header = card.createDiv({ cls: 'hinote-context-memory-card-header' });
            header.createSpan({ cls: 'hinote-context-memory-source', text: item.highlight.fileName || item.highlight.filePath || '' });
            header.createSpan({ cls: 'hinote-context-memory-score', text: `${Math.round(item.finalScore * 100)}` });
            card.createDiv({ cls: 'hinote-context-memory-text', text: item.highlight.text });
            if (item.relation) card.createDiv({ cls: 'hinote-context-memory-relation', text: t(RELATION_LABELS[item.relation]) });
            card.addEventListener('click', () => void this.locationService.jumpToHighlight(item.highlight, item.highlight.filePath || ''));
        }
    }

    private setStatus(value: string): void { this.statusEl?.setText(value); }

    async onClose(): Promise<void> {
        this.generation++;
        if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
        this.locationService.unload();
        this.contentEl.empty();
    }
}

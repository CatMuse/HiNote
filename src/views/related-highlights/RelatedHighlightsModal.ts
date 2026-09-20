import { MarkdownView, Modal, Notice, type Editor } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { LocationService } from '../../services/LocationService';
import { isFileComment } from '../../types/highlight';
import {
    RelatedHighlightRetriever, TypeSafeRelatedHighlightEngine,
    type RelatedHighlightRelation, type RelatedHighlightResult
} from '../../services/related-highlights';

const RELATION_LABELS: Record<RelatedHighlightRelation, string> = {
    supplement: 'Supplement', evidence: 'Supporting evidence', contrast: 'Contrast', similar: 'Similar idea',
    cause: 'Cause or mechanism', prerequisite: 'Prerequisite', extension: 'Further direction',
    application: 'Application', keyword: 'Keyword overlap', other: 'Other'
};

export class RelatedHighlightsModal extends Modal {
    private results: RelatedHighlightResult[] = [];
    private resultsEl?: HTMLElement;
    private statusEl?: HTMLElement;
    private aiButton?: HTMLButtonElement;
    private runId = 0;
    private retriever = new RelatedHighlightRetriever();
    private locationService: LocationService;

    constructor(private plugin: CommentPlugin, private editor: Editor, private view: MarkdownView) {
        super(plugin.app);
        this.modalEl.addClass('hinote-related-highlights-modal');
        this.locationService = new LocationService(plugin.app);
        this.locationService.load();
    }

    onOpen(): void {
        this.titleEl.setText(t('Related highlights'));
        this.contentEl.empty();
        this.contentEl.createEl('p', { cls: 'hinote-related-disclosure',
            text: t('Local recommendations are free and stay on this device. AI reranking sends only the top 30 candidates and limited current-note context to TypeSafe.') });
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container hinote-related-actions' });
        this.aiButton = actions.createEl('button', { cls: 'mod-cta', text: t('AI rerank') });
        this.aiButton.disabled = true;
        this.aiButton.addEventListener('click', () => { void this.rerank(); });
        this.statusEl = this.contentEl.createDiv({ cls: 'hinote-related-status', attr: { role: 'status' } });
        this.resultsEl = this.contentEl.createDiv({ cls: 'hinote-related-results' });
        void this.loadLocal();
    }

    private async loadLocal(): Promise<void> {
        const currentRun = ++this.runId;
        this.setStatus(t('Finding related highlights locally…'));
        try {
            const groups = await this.plugin.highlightService.getAllHighlights();
            if (currentRun !== this.runId) return;
            const highlights = groups.flatMap(({ file, highlights }) => this.plugin.highlightService
                .mergeHighlightsWithComments(highlights,
                    this.plugin.highlightRepository.getCachedHighlights(file.path) || [], file))
                .filter(item => !isFileComment(item));
            this.results = this.retriever.search(this.view.file?.path || '', this.editor.getValue(), highlights, 40);
            this.render();
        } catch (error) {
            this.setStatus(t('Could not find related highlights: {error}', {
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    private async rerank(): Promise<void> {
        if (!this.results.length) return;
        const currentRun = ++this.runId;
        this.aiButton!.disabled = true;
        this.setStatus(t('AI is reranking the top {count} candidates…', { count: Math.min(30, this.results.length) }));
        try {
            const settings = this.plugin.settings.smartHighlight;
            const engine = new TypeSafeRelatedHighlightEngine(
                this.plugin.app.secretStorage, settings.apiKeySecretId, settings.model || 'jev-1.13.0'
            );
            const profile = this.retriever.profile(this.view.file?.path || '', this.editor.getValue());
            const results = await engine.rerank(profile, this.results, () => currentRun === this.runId && this.contentEl.isConnected);
            if (currentRun !== this.runId) return;
            this.results = results;
            this.render();
        } catch (error) {
            if (currentRun !== this.runId) return;
            this.setStatus(t('AI reranking failed: {error}', { error: error instanceof Error ? error.message : String(error) }));
        } finally {
            if (this.aiButton?.isConnected && currentRun === this.runId) this.aiButton.disabled = false;
        }
    }

    private render(): void {
        if (!this.resultsEl) return;
        this.resultsEl.empty();
        if (!this.results.length) {
            this.setStatus(t('No related highlights were found outside the current note.'));
            if (this.aiButton) this.aiButton.disabled = true;
            return;
        }
        this.setStatus(this.results[0].aiRanked
            ? t('Showing {count} AI-reranked highlights.', { count: Math.min(15, this.results.length) })
            : t('Showing {count} local recommendations.', { count: Math.min(15, this.results.length) }));
        if (this.aiButton) this.aiButton.disabled = this.results[0].aiRanked;
        for (const item of this.results.slice(0, 15)) {
            const card = this.resultsEl.createEl('button', { cls: 'hinote-related-card', attr: { type: 'button' } });
            if (item.aiRanked && typeof item.confidence === 'number' && item.confidence < 0.6) {
                card.addClass('hinote-related-card-uncertain');
            }
            const header = card.createDiv({ cls: 'hinote-related-card-header' });
            header.createDiv({ cls: 'hinote-related-source', text: item.highlight.fileName || item.highlight.filePath || '' });
            header.createDiv({ cls: 'hinote-related-score', text: t('Overall {score}', { score: Math.round(item.finalScore * 100) }) });
            card.createDiv({ cls: 'hinote-related-text', text: item.highlight.text });
            if (item.aiRanked) {
                const metrics = card.createDiv({ cls: 'hinote-related-metrics' });
                metrics.createSpan({ text: t('Match {score}', { score: Math.round(item.relevanceScore * 100) }) });
                metrics.createSpan({ text: t('Novelty {score}', { score: Math.round((item.noveltyScore || 0) * 100) }) });
                if (typeof item.confidence === 'number') {
                    metrics.createSpan({ text: t('Confidence {score}', { score: Math.round(item.confidence * 100) }) });
                }
            }
            if (item.relation) card.createDiv({ cls: 'hinote-related-relation', text: t(RELATION_LABELS[item.relation]) });
            card.addEventListener('click', () => {
                void this.locationService.jumpToHighlight(item.highlight, item.highlight.filePath || '');
            });
        }
    }

    private setStatus(value: string): void { this.statusEl?.setText(value); }
    onClose(): void { this.runId++; this.locationService.unload(); this.contentEl.empty(); }
}

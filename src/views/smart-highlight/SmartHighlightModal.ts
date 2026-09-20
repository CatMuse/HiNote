import { MarkdownView, Modal, Notice, Setting, type Editor } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { HIGHLIGHT_COLOR_CHOICES } from '../../services/highlight/HighlightColorEdit';
import {
    SmartHighlightApplier, SmartHighlightCandidateExtractor, TypeSafeHighlightEngine,
    type HighlightEvaluation, type SmartHighlightCategory
} from '../../services/smart-highlight';
import type { SmartHighlightDensity, SmartHighlightPurpose } from '../../types/settings';

const PURPOSE_OPTIONS: Record<SmartHighlightPurpose, string> = {
    general: 'General reading', study: 'Study and review', research: 'Research and analysis', action: 'Actions and decisions'
};
const DENSITY_OPTIONS: Record<SmartHighlightDensity, string> = {
    concise: 'Concise', balanced: 'Balanced', rich: 'Rich'
};
const CATEGORY_LABELS: Record<SmartHighlightCategory, string> = {
    definition: 'Definition', claim: 'Core claim', evidence: 'Evidence', mechanism: 'Mechanism',
    comparison: 'Comparison', conclusion: 'Conclusion', action: 'Action', question: 'Question',
    expression: 'Memorable expression', other: 'Other'
};

export class SmartHighlightModal extends Modal {
    private evaluations: HighlightEvaluation[] = [];
    private snapshot = '';
    private resultsEl?: HTMLElement;
    private statusEl?: HTMLElement;
    private applyButton?: HTMLButtonElement;
    private analyzeButton?: HTMLButtonElement;
    private runId = 0;

    constructor(private plugin: CommentPlugin, private editor: Editor, private view: MarkdownView) {
        super(plugin.app);
        this.modalEl.addClass('hinote-smart-highlight-modal');
    }

    onOpen(): void {
        this.titleEl.setText(t('Smart highlight'));
        this.contentEl.empty();
        this.contentEl.createEl('p', {
            cls: 'hinote-smart-highlight-disclosure',
            text: t('HiNote sends candidate text, section headings, and nearby lines from the current note to TypeSafe AI only when you analyze. Review every suggestion before applying it.')
        });
        this.renderControls();
        this.statusEl = this.contentEl.createDiv({ cls: 'hinote-smart-highlight-status', attr: { role: 'status' } });
        this.resultsEl = this.contentEl.createDiv({ cls: 'hinote-smart-highlight-results' });
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container hinote-smart-highlight-actions' });
        const selectAll = actions.createEl('button', { text: t('Select all') });
        selectAll.addEventListener('click', () => {
            const select = this.evaluations.some(item => !item.selected);
            this.evaluations.forEach(item => { item.selected = select; });
            this.renderResults();
        });
        this.applyButton = actions.createEl('button', { cls: 'mod-cta', text: t('Apply highlights') });
        this.applyButton.disabled = true;
        this.applyButton.addEventListener('click', () => this.apply());
    }

    private renderControls(): void {
        const settings = this.plugin.settings.smartHighlight;
        new Setting(this.contentEl).setName(t('Reading goal')).addDropdown(dropdown => dropdown
            .addOptions(this.translateOptions(PURPOSE_OPTIONS)).setValue(settings.purpose)
            .onChange(async value => {
                settings.purpose = value as SmartHighlightPurpose;
                await this.plugin.saveSettings(); this.invalidateResults();
            }));
        new Setting(this.contentEl).setName(t('Suggestion density')).addDropdown(dropdown => dropdown
            .addOptions(this.translateOptions(DENSITY_OPTIONS)).setValue(settings.density)
            .onChange(async value => {
                settings.density = value as SmartHighlightDensity;
                await this.plugin.saveSettings(); this.invalidateResults();
            }));
        const colors = Object.fromEntries(HIGHLIGHT_COLOR_CHOICES.map(choice => [choice.color || 'default', t(choice.label)]));
        new Setting(this.contentEl).setName(t('Highlight color')).addDropdown(dropdown => dropdown
            .addOptions(colors).setValue(settings.color || 'default').onChange(async value => {
                settings.color = value === 'default' ? null : value as typeof settings.color;
                await this.plugin.saveSettings();
            }));
        new Setting(this.contentEl).setName(t('Analyze current note'))
            .setDesc(t('Existing highlights, code, formulas, tables, and unsafe Markdown ranges are skipped.'))
            .addButton(button => {
                this.analyzeButton = button.buttonEl;
                button.setButtonText(t('Analyze')).setCta().onClick(() => { void this.analyze(); });
            });
    }

    private async analyze(): Promise<void> {
        const currentRun = ++this.runId;
        this.snapshot = this.editor.getValue();
        const candidates = new SmartHighlightCandidateExtractor().extract(this.snapshot);
        this.evaluations = [];
        this.resultsEl?.empty();
        if (!candidates.length) {
            this.setStatus(t('No safe highlight candidates were found in this note.'));
            return;
        }
        this.analyzeButton!.disabled = true;
        this.applyButton!.disabled = true;
        this.setStatus(t('Analyzing {count} candidate passages…', { count: candidates.length }));
        try {
            const config = this.plugin.settings.smartHighlight;
            const engine = new TypeSafeHighlightEngine(
                this.plugin.app.secretStorage, config.apiKeySecretId, config.model || 'jev-1.13.0'
            );
            const evaluations = await engine.evaluate(candidates, config.purpose, config.density,
                () => currentRun === this.runId && this.contentEl.isConnected);
            if (currentRun !== this.runId || !this.contentEl.isConnected) return;
            this.evaluations = evaluations;
            this.renderResults();
        } catch (error) {
            if (currentRun !== this.runId) return;
            const message = error instanceof Error ? error.message : String(error);
            this.setStatus(t('Smart highlight failed: {error}', { error: message }));
        } finally {
            if (this.analyzeButton?.isConnected && currentRun === this.runId) this.analyzeButton.disabled = false;
        }
    }

    private renderResults(): void {
        if (!this.resultsEl) return;
        this.resultsEl.empty();
        const selected = this.evaluations.filter(item => item.selected).length;
        this.setStatus(t('Recommended {recommended} of {total} candidates. Selected: {selected}.', {
            recommended: selected, total: this.evaluations.length, selected
        }));
        for (const evaluation of this.evaluations) {
            const label = this.resultsEl.createEl('label', { cls: 'hinote-smart-highlight-item' });
            const input = label.createEl('input', { type: 'checkbox' });
            input.checked = evaluation.selected;
            input.addEventListener('change', () => {
                evaluation.selected = input.checked;
                this.updateApplyState();
            });
            const content = label.createDiv({ cls: 'hinote-smart-highlight-item-content' });
            content.createDiv({ cls: 'hinote-smart-highlight-text', text: evaluation.candidate.text });
            const useful = (evaluation.importanceProbabilities['2'] || 0) + (evaluation.importanceProbabilities['3'] || 0);
            content.createDiv({
                cls: 'hinote-smart-highlight-meta',
                text: `${t(CATEGORY_LABELS[evaluation.category])} · ${Math.round(useful * 100)}%`
            });
        }
        this.updateApplyState();
    }

    private updateApplyState(): void {
        const count = this.evaluations.filter(item => item.selected).length;
        if (this.applyButton) {
            this.applyButton.disabled = count === 0;
            this.applyButton.setText(count ? t('Apply {count} highlights', { count }) : t('Apply highlights'));
        }
        if (this.evaluations.length) this.setStatus(t('Selected {count} of {total} suggestions.', {
            count, total: this.evaluations.length
        }));
    }

    private apply(): void {
        if (this.plugin.app.workspace.getActiveViewOfType(MarkdownView) !== this.view) {
            new Notice(t('Return to the analyzed note before applying highlights.'));
            return;
        }
        try {
            const count = new SmartHighlightApplier().apply(this.editor, {
                snapshot: this.snapshot, evaluations: this.evaluations,
                color: this.plugin.settings.smartHighlight.color
            });
            this.plugin.highlightDecorator.refreshDecorations();
            new Notice(t('Applied {count} smart highlights.', { count }));
            this.close();
        } catch (error) {
            new Notice(t('Could not apply smart highlights: {error}', {
                error: error instanceof Error ? error.message : String(error)
            }));
        }
    }

    private invalidateResults(): void {
        this.evaluations = [];
        this.resultsEl?.empty();
        if (this.applyButton) this.applyButton.disabled = true;
        this.setStatus(t('Select Analyze to generate new suggestions.'));
    }

    private setStatus(value: string): void { if (this.statusEl) this.statusEl.setText(value); }
    private translateOptions<T extends string>(options: Record<T, string>): Record<T, string> {
        return Object.fromEntries(Object.entries(options).map(([key, value]) => [key, t(String(value))])) as Record<T, string>;
    }

    onClose(): void { this.runId++; this.contentEl.empty(); }
}

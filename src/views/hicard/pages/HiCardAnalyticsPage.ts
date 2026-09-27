import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import { FlashcardStatsPanel } from '../../../flashcard/components/FlashcardStatsPanel';
import { isSystemCardGroup, PAUSED_CARDS_GROUP } from '../../../flashcard/types/FlashcardGroups';
import { renderHiCardPageHeader } from './HiCardPageHeader';

export class HiCardAnalyticsPage {
    constructor(private plugin: CommentPlugin) {}

    render(container: HTMLElement): void {
        container.empty();
        container.addClass('hicard-page', 'hicard-analytics-page');
        renderHiCardPageHeader(
            container,
            t('Statistics'),
            t('Review today’s progress and long-term learning activity.')
        );
        this.renderToday(container);
        this.renderInsights(container);
        const activity = container.createDiv({ cls: 'hicard-analytics-section' });
        activity.createEl('h3', { text: t('Learning activity') });
        new FlashcardStatsPanel(activity.createDiv(), this.plugin.fsrsManager, { mode: 'year' }).render();
        this.renderGroups(container);
    }

    private renderToday(container: HTMLElement): void {
        const today = this.plugin.fsrsManager.getDailyStats().find(item =>
            new Date(item.date).toDateString() === new Date().toDateString());
        const metrics = container.createDiv({ cls: 'hicard-analytics-metrics' });
        this.renderMetric(metrics, t('Reviewed today'), today?.cardsReviewed ?? 0);
        this.renderMetric(metrics, t('New cards today'), today?.newCardsLearned ?? 0);
        this.renderMetric(metrics, t('Ratings today'), today?.reviewCount ?? 0);
        const total = today?.reviewCount ?? 0;
        const remembered = (today?.hardCount ?? 0) + (today?.goodCount ?? 0) + (today?.easyCount ?? 0);
        this.renderMetric(metrics, t('Recall rate'), total > 0 ? `${Math.round(remembered / total * 100)}%` : '—');
    }

    private renderMetric(container: HTMLElement, label: string, value: string | number): void {
        const metric = container.createDiv({ cls: 'hicard-analytics-metric' });
        metric.createDiv({ cls: 'hicard-analytics-metric-value', text: String(value) });
        metric.createDiv({ cls: 'hicard-analytics-metric-label', text: label });
    }

    private renderInsights(container: HTMLElement): void {
        const grid = container.createDiv({ cls: 'hicard-insight-grid' });
        this.renderTrend(grid.createDiv({ cls: 'hicard-surface hicard-chart-card' }));
        this.renderForecast(grid.createDiv({ cls: 'hicard-surface hicard-chart-card' }));
        this.renderRatingMix(grid.createDiv({ cls: 'hicard-surface hicard-rating-card' }));
    }

    private renderTrend(section: HTMLElement): void {
        section.createEl('h3', { text: t('Last 14 days') });
        section.createEl('p', { cls: 'hicard-chart-description', text: t('Daily cards reviewed') });
        const stats = this.plugin.fsrsManager.getDailyStats();
        const byDay = new Map(stats.map(item => [new Date(item.date).toDateString(), item.cardsReviewed]));
        const values = Array.from({ length: 14 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (13 - index));
            return { date, value: byDay.get(date.toDateString()) ?? 0 };
        });
        this.renderBars(section, values);
    }

    private renderForecast(section: HTMLElement): void {
        section.createEl('h3', { text: t('7-day forecast') });
        section.createEl('p', { cls: 'hicard-chart-description', text: t('Scheduled review workload') });
        const cards = this.plugin.fsrsManager.getAllCards().filter(card => !card.suspended && card.lastReview > 0);
        const values = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + index);
            const end = new Date(date);
            end.setDate(end.getDate() + 1);
            return { date, value: cards.filter(card => card.nextReview >= date.getTime() && card.nextReview < end.getTime()).length };
        });
        this.renderBars(section, values);
    }

    private renderBars(section: HTMLElement, values: Array<{ date: Date; value: number }>): void {
        const max = Math.max(1, ...values.map(item => item.value));
        const chart = section.createDiv({ cls: 'hicard-bar-chart' });
        for (const item of values) {
            const column = chart.createDiv({ cls: 'hicard-bar-column', attr: { 'aria-label': `${item.date.toLocaleDateString()}: ${item.value}` } });
            column.createDiv({ cls: 'hicard-bar-value', text: item.value ? String(item.value) : '' });
            const track = column.createDiv({ cls: 'hicard-bar-track' });
            const bar = track.createDiv({ cls: 'hicard-bar-fill' });
            bar.style.height = `${Math.max(item.value ? 8 : 2, item.value / max * 100)}%`;
            column.createDiv({ cls: 'hicard-bar-label', text: item.date.toLocaleDateString(undefined, { weekday: 'narrow' }) });
        }
    }

    private renderRatingMix(section: HTMLElement): void {
        section.createEl('h3', { text: t('Rating distribution') });
        const stats = this.plugin.fsrsManager.getDailyStats();
        const counts = [
            { label: t('Again'), value: stats.reduce((sum, item) => sum + item.againCount, 0), cls: 'again' },
            { label: t('Hard'), value: stats.reduce((sum, item) => sum + item.hardCount, 0), cls: 'hard' },
            { label: t('Good'), value: stats.reduce((sum, item) => sum + item.goodCount, 0), cls: 'good' },
            { label: t('Easy'), value: stats.reduce((sum, item) => sum + item.easyCount, 0), cls: 'easy' }
        ];
        const total = Math.max(1, counts.reduce((sum, item) => sum + item.value, 0));
        const stack = section.createDiv({ cls: 'hicard-rating-stack' });
        for (const item of counts) {
            const segment = stack.createDiv({ cls: `is-${item.cls}` });
            segment.style.width = `${item.value / total * 100}%`;
        }
        const legend = section.createDiv({ cls: 'hicard-rating-legend' });
        for (const item of counts) {
            const row = legend.createDiv();
            row.createSpan({ cls: `hicard-rating-dot is-${item.cls}` });
            row.createSpan({ text: item.label });
            row.createEl('strong', { text: String(item.value) });
        }
    }

    private renderGroups(container: HTMLElement): void {
        const section = container.createDiv({ cls: 'hicard-analytics-section' });
        section.createEl('h3', { text: t('Group progress') });
        const table = section.createDiv({ cls: 'hicard-management-table hicard-analytics-groups' });
        const header = table.createDiv({ cls: 'hicard-management-row hicard-management-table-header' });
        header.createSpan({ text: t('Group') });
        header.createSpan({ text: t('Cards') });
        header.createSpan({ text: t('Due') });
        header.createSpan({ text: t('Learned') });
        for (const group of this.plugin.fsrsManager.getCardGroups().filter(group => group.id !== PAUSED_CARDS_GROUP)) {
            const progress = this.plugin.fsrsManager.getGroupProgress(group.id);
            const row = table.createDiv({ cls: 'hicard-management-row' });
            row.createSpan({ text: isSystemCardGroup(group.id) ? t(group.name) : group.name });
            row.createSpan({ text: String(this.plugin.fsrsManager.getCardsByGroupId(group.id).length) });
            row.createSpan({ text: String(progress?.due ?? 0) });
            row.createSpan({ text: String(progress?.learned ?? 0) });
        }
    }
}

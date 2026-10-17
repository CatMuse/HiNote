import { setIcon } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t, formatDate } from '../../../i18n';
import type { FlashcardState } from '../../../flashcard';
import type { DailyStats } from '../../../flashcard/types/FSRSTypes';
import { ALL_CARDS_GROUP, isSystemCardGroup } from '../../../flashcard/types/FlashcardGroups';
import { renderHiCardPageHeader } from './HiCardPageHeader';

export class HiCardTodayPage {
    constructor(
        private plugin: CommentPlugin,
        private startStudy: (groupId: string) => Promise<void>,
        private openCards: () => Promise<void>
    ) {}

    render(container: HTMLElement): void {
        container.empty();
        container.addClass('hicard-page', 'hicard-today-page');
        renderHiCardPageHeader(
            container,
            t('Today'),
            t('Keep the queue small, finish what is due, and come back tomorrow.')
        );

        const cards = this.plugin.fsrsManager.getAllCards();
        const active = cards.filter(card => !card.suspended);
        const due = active.filter(card => card.lastReview > 0 && card.nextReview <= Date.now()).length;
        const learning = active.filter(card => card.state === 1 || card.state === 3).length;
        const newCards = active.filter(card => card.lastReview === 0).length;
        const ready = this.plugin.fsrsManager.getCardsForStudy(ALL_CARDS_GROUP).length;
        const todayStats = this.getTodayStats();
        const today = todayStats?.cardsReviewed ?? 0;

        const hero = container.createDiv({ cls: 'hicard-today-hero' });
        const heroCopy = hero.createDiv({ cls: 'hicard-today-hero-copy' });
        heroCopy.createDiv({ cls: 'hicard-eyebrow', text: t('Today’s queue') });
        heroCopy.createEl('h3', { text: ready > 0 ? t('{count} cards are ready', { count: ready }) : t('You’re caught up') });
        heroCopy.createEl('p', { text: ready > 0 ? t('Study due and new cards from all active cards.') : t('There is nothing due right now. Come back when more cards are ready.') });
        const start = hero.createEl('button', { cls: 'mod-cta hicard-primary-action' });
        const startIcon = start.createSpan();
        setIcon(startIcon, 'play');
        start.createSpan({ text: t(active.length === 0 ? 'Card management' : ready > 0 ? 'Start today’s study' : 'Open study') });
        start.addEventListener('click', () => {
            if (active.length === 0) void this.openCards();
            else void this.startStudy(ALL_CARDS_GROUP);
        });

        const metrics = container.createDiv({ cls: 'hicard-overview-grid' });
        this.metric(metrics, 'clock-3', t('Due now'), due, t('Scheduled reviews'));
        this.metric(metrics, 'sparkles', t('New available'), Math.min(newCards, this.plugin.fsrsManager.getRemainingNewCardsToday()), t('{count} remaining today', { count: this.plugin.fsrsManager.getRemainingNewCardsToday() }));
        this.metric(metrics, 'brain', t('In learning'), learning, t('Short learning steps'));
        this.metric(metrics, 'circle-check-big', t('Finished today'), today, t('Cards reviewed'));
        this.renderStudySummary(container, todayStats);

        const insights = container.createDiv({ cls: 'hicard-today-insights' });
        this.renderActivity(insights.createDiv({ cls: 'hicard-surface hicard-today-panel' }));
        this.renderSnapshot(insights.createDiv({ cls: 'hicard-surface hicard-today-panel' }), cards);

        this.renderGroups(container.createDiv({ cls: 'hicard-surface' }));
    }

    private renderActivity(section: HTMLElement): void {
        const heading = section.createDiv({ cls: 'hicard-section-heading' });
        heading.createEl('h3', { text: t('Recent activity') });
        heading.createSpan({ cls: 'hicard-panel-period', text: t('Last 7 days') });
        section.createEl('p', { cls: 'hicard-chart-description', text: t('Study actions completed each day') });

        const stats = this.plugin.fsrsManager.getDailyStats();
        const byDay = new Map(stats.map(item => [new Date(item.date).toDateString(), item.reviewCount ?? 0]));
        const values = Array.from({ length: 7 }, (_, index) => {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() - (6 - index));
            return { date, value: byDay.get(date.toDateString()) ?? 0 };
        });
        const max = Math.max(1, ...values.map(item => item.value));
        const chart = section.createDiv({ cls: 'hicard-today-bar-chart' });
        for (const item of values) {
            const column = chart.createDiv({
                cls: 'hicard-today-bar-column',
                attr: { 'aria-label': `${formatDate(item.date)}: ${item.value}` }
            });
            column.createDiv({ cls: 'hicard-today-bar-value', text: item.value ? String(item.value) : '' });
            const track = column.createDiv({ cls: 'hicard-today-bar-track' });
            const bar = track.createDiv({ cls: 'hicard-today-bar-fill' });
            bar.style.height = `${Math.max(item.value ? 8 : 2, item.value / max * 100)}%`;
            column.createDiv({
                cls: 'hicard-today-bar-label',
                text: formatDate(item.date, { weekday: 'short' })
            });
        }
    }

    private renderSnapshot(section: HTMLElement, cards: FlashcardState[]): void {
        const heading = section.createDiv({ cls: 'hicard-section-heading' });
        heading.createEl('h3', { text: t('Learning snapshot') });
        heading.createSpan({ cls: 'hicard-panel-period', text: t('All time') });

        const stats = this.plugin.fsrsManager.getStats();
        const difficult = cards.filter(card => !card.suspended && card.lapses > 0).length;
        const paused = cards.filter(card => card.suspended).length;
        const retention = Math.round(Math.max(0, Math.min(1, stats.averageRetention)) * 100);
        const items: Array<[string, string, string]> = [
            ['flame', t('Study streak'), t(stats.streakDays === 1 ? '{count} day' : '{count} days', { count: stats.streakDays })],
            ['target', t('Recall rate'), `${retention}%`],
            ['layers', t('Cards in library'), String(cards.length)],
            ['pause-circle', t('Paused cards'), String(paused)],
            ['triangle-alert', t('Difficult cards'), String(difficult)],
            ['history', t('Total reviews'), String(stats.totalReviews)]
        ];
        const grid = section.createDiv({ cls: 'hicard-snapshot-grid' });
        for (const [iconName, label, value] of items) {
            const item = grid.createDiv({ cls: 'hicard-snapshot-item' });
            const icon = item.createSpan({ cls: 'hicard-snapshot-icon' });
            setIcon(icon, iconName);
            const copy = item.createDiv({ cls: 'hicard-snapshot-copy' });
            copy.createDiv({ cls: 'hicard-snapshot-value', text: value });
            copy.createDiv({ cls: 'hicard-snapshot-label', text: label });
        }
    }

    private metric(container: HTMLElement, iconName: string, label: string, value: number, helper: string): void {
        const card = container.createDiv({ cls: 'hicard-overview-card' });
        const icon = card.createSpan({ cls: 'hicard-overview-icon' });
        setIcon(icon, iconName);
        card.createDiv({ cls: 'hicard-overview-value', text: String(value) });
        card.createDiv({ cls: 'hicard-overview-label', text: label });
        card.createDiv({ cls: 'hicard-overview-helper', text: helper });
    }

    private renderGroups(section: HTMLElement): void {
        const heading = section.createDiv({ cls: 'hicard-section-heading' });
        heading.createEl('h3', { text: t('Continue a group') });
        const groups = this.plugin.fsrsManager.getCardGroups()
            .filter(group => !isSystemCardGroup(group.id))
            .map(group => ({ group, progress: this.plugin.fsrsManager.getGroupProgress(group.id) }))
            .sort((a, b) => (b.progress?.due ?? 0) - (a.progress?.due ?? 0))
            .slice(0, 5);
        const list = section.createDiv({ cls: 'hicard-continue-list' });
        if (groups.length === 0) {
            list.createDiv({ cls: 'hicard-management-empty', text: t('No custom study groups yet.') });
            return;
        }
        for (const { group, progress } of groups) {
            const button = list.createEl('button', { cls: 'hicard-continue-row' });
            const icon = button.createSpan({ cls: 'hicard-list-icon' });
            setIcon(icon, 'folder');
            const copy = button.createSpan({ cls: 'hicard-continue-copy' });
            copy.createSpan({ cls: 'hicard-continue-name', text: group.name });
            copy.createSpan({ cls: 'hicard-continue-meta', text: t('{due} due · {new} new', { due: progress?.due ?? 0, new: progress?.newCards ?? 0 }) });
            const arrow = button.createSpan();
            setIcon(arrow, 'chevron-right');
            button.addEventListener('click', () => { void this.startStudy(group.id); });
        }
    }

    private renderStudySummary(container: HTMLElement, stats?: DailyStats): void {
        const studiedCards = stats?.reviewedCardIds?.length
            ?? ((stats?.newCardsLearned ?? 0) + (stats?.cardsReviewed ?? 0));
        const studyTimeMs = stats?.studyTimeMs ?? 0;
        const averageTimeMs = studiedCards > 0 ? studyTimeMs / studiedCards : 0;
        const summary = container.createDiv({ cls: 'hicard-surface hicard-today-study-summary' });
        const icon = summary.createSpan({ cls: 'hicard-today-study-summary-icon' });
        setIcon(icon, 'timer');
        summary.createSpan({
            text: t('Today you studied {cards} cards in {duration} (average {average} per card)', {
                cards: studiedCards,
                duration: this.formatStudyDuration(studyTimeMs),
                average: this.formatStudyDuration(averageTimeMs)
            })
        });
    }

    private formatStudyDuration(milliseconds: number): string {
        const seconds = Math.max(0, Math.round(milliseconds / 1000));
        if (seconds < 60) return t('{count} seconds', { count: seconds });
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return remainingSeconds
            ? t('{minutes}m {seconds}s', { minutes, seconds: remainingSeconds })
            : t('{count} minutes', { count: minutes });
    }

    private getTodayStats(): DailyStats | undefined {
        const key = new Date().toDateString();
        return this.plugin.fsrsManager.getDailyStats().find(item => new Date(item.date).toDateString() === key);
    }
}

import { FSRSManager } from "../services/FSRSManager";
import { DailyStats } from "../types/FSRSTypes";
import { formatDate, getDateLocale, t } from '../../i18n';

type FlashcardStatsPanelMode = 'compact' | 'year';

interface FlashcardStatsPanelOptions {
    mode?: FlashcardStatsPanelMode;
}

interface CalendarDay {
    date: Date;
    stat?: DailyStats;
    value: number;
}

const DAYS_IN_WEEK = 7;
const COMPACT_WEEKS = 12;
const YEAR_WEEKS = 53;

/** Displays flashcard progress and either a compact or year activity calendar. */
export class FlashcardStatsPanel {
    private readonly mode: FlashcardStatsPanelMode;

    constructor(
        private containerEl: HTMLElement,
        private fsrsManager: FSRSManager,
        options: FlashcardStatsPanelOptions = {}
    ) {
        this.mode = options.mode ?? 'compact';
    }

    render(): void {
        this.containerEl.empty();
        this.containerEl.addClass('flashcard-stats-panel', `is-${this.mode}`);

        if (this.mode === 'compact') this.renderStatsArea();
        this.renderHeatmap();
    }

    private renderStatsArea(): void {
        const statsArea = this.containerEl.createDiv('flashcard-stats-area');
        const progress = this.fsrsManager.getProgress();

        this.createStatItem(statsArea, progress.newCards.toString(), 'New', 'flashcard-stat-new');
        this.createStatItem(statsArea, progress.learned.toString(), 'Learned', 'flashcard-stat-learning');
        this.createStatItem(statsArea, progress.due.toString(), 'Review', 'flashcard-stat-due');
    }

    private createStatItem(container: HTMLElement, value: string, label: string, className: string): void {
        const statItem = container.createDiv(`flashcard-stat-item ${className}`);
        statItem.createDiv({ cls: 'flashcard-stat-value', text: value });
        statItem.createDiv({ cls: 'flashcard-stat-label', text: t(label) });
    }

    private renderHeatmap(): void {
        const weeks = this.mode === 'year' ? YEAR_WEEKS : COMPACT_WEEKS;
        const days = this.buildCalendarDays(this.fsrsManager.getDailyStats(), weeks);

        if (this.mode === 'year') {
            this.renderYearCalendar(days);
            return;
        }

        const grid = this.containerEl.createDiv('flashcard-heatmap-grid');
        this.renderCells(grid, days);
    }

    private renderYearCalendar(days: CalendarDay[]): void {
        const scroller = this.containerEl.createDiv('flashcard-year-scroller');
        const calendar = scroller.createDiv('flashcard-year-calendar');
        const months = calendar.createDiv('flashcard-year-months');
        months.createDiv('flashcard-year-axis-spacer');
        const monthGrid = months.createDiv('flashcard-year-month-grid');

        for (let week = 0; week < YEAR_WEEKS; week++) {
            const monday = days[week * DAYS_IN_WEEK].date;
            const previousMonday = week > 0 ? days[(week - 1) * DAYS_IN_WEEK].date : undefined;
            if (week === 0 || monday.getMonth() !== previousMonday?.getMonth()) {
                const label = monthGrid.createSpan({
                    cls: 'flashcard-year-month-label',
                    text: monday.toLocaleDateString(getDateLocale(), { month: 'short' })
                });
                label.style.gridColumn = String(week + 1);
            }
        }

        const body = calendar.createDiv('flashcard-year-body');
        const weekdays = body.createDiv('flashcard-year-weekdays');
        const weekStart = days[0].date;
        for (let row = 0; row < DAYS_IN_WEEK; row++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + row);
            weekdays.createSpan({
                text: row % 2 === 0 ? date.toLocaleDateString(getDateLocale(), { weekday: 'narrow' }) : ''
            });
        }

        const grid = body.createDiv('flashcard-heatmap-grid');
        this.renderCells(grid, days);

        const activeDays = days.filter(day => day.value > 0).length;
        const actions = days.reduce((sum, day) => sum + (day.stat?.reviewCount ?? 0), 0);
        const footer = calendar.createDiv('flashcard-year-footer');
        footer.createSpan({
            cls: 'flashcard-year-summary',
            text: t('{weeks} weeks · {days} active days · {actions} study actions', {
                weeks: YEAR_WEEKS,
                days: activeDays,
                actions
            })
        });
        const legend = footer.createDiv('flashcard-year-legend');
        legend.createSpan({ text: t('Less activity') });
        for (let level = 0; level <= 4; level++) {
            legend.createSpan({ cls: `flashcard-heatmap-cell flashcard-heatmap-level-${level}` });
        }
        legend.createSpan({ text: t('More activity') });

        // Keep the most recent weeks visible first when the pane is narrow.
        scroller.scrollLeft = scroller.scrollWidth;
    }

    private renderCells(grid: HTMLElement, days: CalendarDay[]): void {
        const thresholds = this.getIntensityThresholds(days);
        const todayKey = this.toDateKey(new Date());

        for (const day of days) {
            const cell = grid.createDiv('flashcard-heatmap-cell');
            const level = this.getIntensityLevel(day.value, thresholds);
            cell.addClass(`flashcard-heatmap-level-${level}`);

            const isToday = this.toDateKey(day.date) === todayKey;
            if (isToday) cell.addClass('is-today');
            if (day.date.getTime() > Date.now()) cell.addClass('is-future');

            const newCards = day.stat?.newCardsLearned ?? 0;
            const reviewed = day.stat?.cardsReviewed ?? 0;
            const tooltip = t('{date} · {new} new · {reviewed} reviewed', {
                date: formatDate(day.date),
                new: newCards,
                reviewed
            });
            cell.setAttribute('aria-label', tooltip);
        }
    }

    private buildCalendarDays(dailyStats: DailyStats[], weeks: number): CalendarDay[] {
        const statsByDate = new Map(dailyStats.map(stat => [this.toDateKey(new Date(stat.date)), stat]));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monday = new Date(today);
        const weekday = monday.getDay();
        monday.setDate(monday.getDate() - (weekday === 0 ? 6 : weekday - 1) - (weeks - 1) * DAYS_IN_WEEK);

        return Array.from({ length: weeks * DAYS_IN_WEEK }, (_, index) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + index);
            const stat = statsByDate.get(this.toDateKey(date));
            return {
                date,
                stat,
                value: this.getActivityValue(stat)
            };
        });
    }

    private getActivityValue(stat?: DailyStats): number {
        if (!stat) return 0;

        // Heatmap intensity represents every study action, including learning steps
        // and repeated ratings that are intentionally excluded from cardsReviewed.
        // Keep the legacy aggregate as a fallback for older stored statistics.
        return Math.max(
            stat.reviewCount ?? 0,
            (stat.newCardsLearned ?? 0) + (stat.cardsReviewed ?? 0)
        );
    }

    private getIntensityThresholds(days: CalendarDay[]): number[] {
        const values = days.map(day => day.value).filter(value => value > 0).sort((a, b) => a - b);
        if (!values.length) return [];
        return [0.25, 0.5, 0.75].map(percentile => values[Math.ceil((values.length - 1) * percentile)]);
    }

    private getIntensityLevel(value: number, thresholds: number[]): number {
        if (value <= 0) return 0;
        return 1 + thresholds.filter(threshold => value >= threshold).length;
    }

    private toDateKey(date: Date): string {
        return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    }
}

import { Modal, setIcon } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import type { FlashcardStudySession } from '../../../flashcard/components/FlashcardComponent';
import type { FlashcardState } from '../../../flashcard';
import { ALL_CARDS_GROUP, isSystemCardGroup, PAUSED_CARDS_GROUP } from '../../../flashcard/types/FlashcardGroups';
import { renderHiCardPageHeader } from './HiCardPageHeader';

type StudyMode = 'today' | 'new' | 'difficult' | 'all';

export class HiCardTodayPage {
    constructor(
        private plugin: CommentPlugin,
        private startStudy: (session?: FlashcardStudySession, groupId?: string) => Promise<void>,
        private openCards: () => Promise<void>
    ) {}

    render(container: HTMLElement): void {
        container.empty();
        container.addClass('hicard-page', 'hicard-today-page');
        const actions = renderHiCardPageHeader(
            container,
            t('Today'),
            t('Keep the queue small, finish what is due, and come back tomorrow.')
        );
        const custom = actions.createEl('button', { text: t('Custom study') });
        custom.addEventListener('click', () => this.openStudyPlan());

        const cards = this.plugin.fsrsManager.getAllCards();
        const active = cards.filter(card => !card.suspended);
        const due = active.filter(card => card.lastReview > 0 && card.nextReview <= Date.now()).length;
        const learning = active.filter(card => card.state === 1 || card.state === 3).length;
        const newCards = active.filter(card => card.lastReview === 0).length;
        const today = this.getTodayReviewed();

        const hero = container.createDiv({ cls: 'hicard-today-hero' });
        const heroCopy = hero.createDiv({ cls: 'hicard-today-hero-copy' });
        heroCopy.createDiv({ cls: 'hicard-eyebrow', text: t('Today’s queue') });
        heroCopy.createEl('h3', { text: due + newCards > 0 ? t('{count} cards are ready', { count: due + Math.min(newCards, this.plugin.fsrsManager.getRemainingNewCardsToday()) }) : t('You’re caught up') });
        heroCopy.createEl('p', { text: due + newCards > 0 ? t('Start with reviews, then learn a few new cards.') : t('There is nothing due right now. You can still start a custom session.') });
        const start = hero.createEl('button', { cls: 'mod-cta hicard-primary-action' });
        const startIcon = start.createSpan();
        setIcon(startIcon, 'play');
        start.createSpan({ text: t(active.length === 0 ? 'Create your first card' : due + newCards > 0 ? 'Start today’s study' : 'Open study') });
        start.addEventListener('click', () => {
            if (active.length === 0) void this.openCards();
            else void this.startStudy(undefined, ALL_CARDS_GROUP);
        });

        const metrics = container.createDiv({ cls: 'hicard-overview-grid' });
        this.metric(metrics, 'clock-3', t('Due now'), due, t('Scheduled reviews'));
        this.metric(metrics, 'sparkles', t('New available'), newCards, t('{count} remaining today', { count: this.plugin.fsrsManager.getRemainingNewCardsToday() }));
        this.metric(metrics, 'brain', t('In learning'), learning, t('Short learning steps'));
        this.metric(metrics, 'circle-check-big', t('Finished today'), today, t('Cards reviewed'));

        const lower = container.createDiv({ cls: 'hicard-today-columns' });
        this.renderGroups(lower.createDiv({ cls: 'hicard-surface' }));
        this.renderQuickStudy(lower.createDiv({ cls: 'hicard-surface' }), cards);
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
            .filter(group => group.id !== PAUSED_CARDS_GROUP)
            .map(group => ({ group, progress: this.plugin.fsrsManager.getGroupProgress(group.id) }))
            .sort((a, b) => (b.progress?.due ?? 0) - (a.progress?.due ?? 0))
            .slice(0, 5);
        const list = section.createDiv({ cls: 'hicard-continue-list' });
        for (const { group, progress } of groups) {
            const button = list.createEl('button', { cls: 'hicard-continue-row' });
            const icon = button.createSpan({ cls: 'hicard-list-icon' });
            setIcon(icon, isSystemCardGroup(group.id) ? 'inbox' : 'folder');
            const copy = button.createSpan({ cls: 'hicard-continue-copy' });
            copy.createSpan({ cls: 'hicard-continue-name', text: isSystemCardGroup(group.id) ? t(group.name) : group.name });
            copy.createSpan({ cls: 'hicard-continue-meta', text: t('{due} due · {new} new', { due: progress?.due ?? 0, new: progress?.newCards ?? 0 }) });
            const arrow = button.createSpan();
            setIcon(arrow, 'chevron-right');
            button.addEventListener('click', () => { void this.startStudy(undefined, group.id); });
        }
    }

    private renderQuickStudy(section: HTMLElement, cards: FlashcardState[]): void {
        const heading = section.createDiv({ cls: 'hicard-section-heading' });
        heading.createEl('h3', { text: t('Quick study') });
        const difficult = cards.filter(card => !card.suspended && card.lapses > 0).length;
        const items: Array<[string, string, string, () => void]> = [
            ['target', t('Practice difficult cards'), t('{count} cards with lapses', { count: difficult }), () => this.openStudyPlan('difficult')],
            ['shuffle', t('Choose a custom session'), t('Pick a group, mode, and session size'), () => this.openStudyPlan()],
            ['plus', t('Create a card'), t('Add a card without leaving HiCard'), () => { void this.openCards(); }]
        ];
        for (const [iconName, title, detail, action] of items) {
            const button = section.createEl('button', { cls: 'hicard-quick-action' });
            const icon = button.createSpan({ cls: 'hicard-list-icon' });
            setIcon(icon, iconName);
            const copy = button.createSpan({ cls: 'hicard-continue-copy' });
            copy.createSpan({ cls: 'hicard-continue-name', text: title });
            copy.createSpan({ cls: 'hicard-continue-meta', text: detail });
            button.addEventListener('click', action);
        }
    }

    private openStudyPlan(initialMode: StudyMode = 'today'): void {
        new HiCardStudyPlanModal(this.plugin, initialMode, session => this.startStudy(session)).open();
    }

    private getTodayReviewed(): number {
        const key = new Date().toDateString();
        return this.plugin.fsrsManager.getDailyStats().find(item => new Date(item.date).toDateString() === key)?.cardsReviewed ?? 0;
    }
}

class HiCardStudyPlanModal extends Modal {
    constructor(
        private plugin: CommentPlugin,
        private initialMode: StudyMode,
        private start: (session: FlashcardStudySession) => Promise<void>
    ) { super(plugin.app); }

    onOpen(): void {
        this.modalEl.addClass('hicard-study-plan-modal');
        this.titleEl.setText(t('Custom study'));
        const intro = this.contentEl.createEl('p', { cls: 'hicard-modal-intro', text: t('Build a focused one-time session. Your scheduling data is still updated normally.') });
        intro.setAttr('aria-live', 'polite');
        const form = this.contentEl.createDiv({ cls: 'hicard-study-plan-form' });
        const group = this.field(form, t('Study group')).createEl('select', { cls: 'dropdown' });
        for (const item of this.plugin.fsrsManager.getCardGroups().filter(item => item.id !== PAUSED_CARDS_GROUP)) {
            group.createEl('option', { value: item.id, text: isSystemCardGroup(item.id) ? t(item.name) : item.name });
        }
        group.value = ALL_CARDS_GROUP;
        const mode = this.field(form, t('Study mode')).createEl('select', { cls: 'dropdown' });
        const modes: Array<[StudyMode, string]> = [['today', t('Due and new')], ['new', t('New cards only')], ['difficult', t('Difficult cards')], ['all', t('Review ahead')]];
        for (const [value, label] of modes) mode.createEl('option', { value, text: label });
        mode.value = this.initialMode;
        const limit = this.field(form, t('Session size')).createEl('input', { attr: { type: 'number', min: '1', max: '200', value: '20' } });
        const preview = form.createDiv({ cls: 'hicard-study-plan-preview' });
        const updatePreview = () => preview.setText(t('{count} cards match this session', { count: this.selectCards(group.value, mode.value as StudyMode, Number(limit.value)).length }));
        group.addEventListener('change', updatePreview);
        mode.addEventListener('change', updatePreview);
        limit.addEventListener('input', updatePreview);
        updatePreview();
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        const cancel = actions.createEl('button', { text: t('Cancel') });
        const start = actions.createEl('button', { cls: 'mod-cta', text: t('Start session') });
        cancel.addEventListener('click', () => this.close());
        start.addEventListener('click', () => {
            const selectedMode = mode.value as StudyMode;
            const cards = this.selectCards(group.value, selectedMode, Number(limit.value));
            if (!cards.length) { preview.setText(t('No cards match these choices.')); return; }
            const groupName = this.plugin.fsrsManager.getCardGroups().find(item => item.id === group.value)?.name ?? t('Custom study');
            this.close();
            void this.start({
                id: `custom:${Date.now()}`,
                title: `${isSystemCardGroup(group.value) ? t(groupName) : groupName} · ${mode.options[mode.selectedIndex]?.text ?? ''}`,
                groupId: group.value,
                cardIds: cards.map(card => card.id),
                allowEarlyReview: selectedMode === 'difficult' || selectedMode === 'all'
            });
        });
    }

    private field(container: HTMLElement, label: string): HTMLElement {
        const field = container.createEl('label', { cls: 'hicard-form-field' });
        field.createSpan({ text: label });
        return field;
    }

    private selectCards(groupId: string, mode: StudyMode, rawLimit: number): FlashcardState[] {
        const limit = Math.max(1, Math.min(200, Number.isFinite(rawLimit) ? rawLimit : 20));
        const source = this.plugin.fsrsManager.getCardsByGroupId(groupId).filter(card => !card.suspended);
        const now = Date.now();
        const selected = mode === 'today' ? this.plugin.fsrsManager.getCardsForStudy(groupId)
            : mode === 'new' ? source.filter(card => card.lastReview === 0)
            : mode === 'difficult' ? source.filter(card => card.lapses > 0).sort((a, b) => b.lapses - a.lapses || a.nextReview - b.nextReview)
            : source.sort((a, b) => (a.nextReview <= now ? -1 : 1) - (b.nextReview <= now ? -1 : 1) || a.nextReview - b.nextReview);
        return selected.slice(0, limit);
    }
}

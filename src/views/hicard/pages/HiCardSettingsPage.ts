import { Notice, setIcon } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import { FlashcardSettingsTab } from '../../../flashcard';
import { renderHiCardPageHeader } from './HiCardPageHeader';

export class HiCardSettingsPage {
    private container: HTMLElement | null = null;
    constructor(private plugin: CommentPlugin) {}

    render(container: HTMLElement): void {
        this.container = container;
        container.empty();
        container.addClass('hicard-page', 'hicard-settings-page');
        renderHiCardPageHeader(
            container,
            t('Learning settings'),
            t('Configure global daily limits and FSRS scheduling.')
        );
        new FlashcardSettingsTab(this.plugin, container).display();
        this.renderDataTools(container);
    }

    private renderDataTools(container: HTMLElement): void {
        const section = container.createDiv({ cls: 'hicard-settings-data hicard-surface' });
        section.createEl('h3', { text: t('Data and portability') });
        section.createEl('p', { text: t('Export a local JSON copy or import card content. Nothing is uploaded.') });
        const actions = section.createDiv({ cls: 'hicard-settings-data-actions' });
        this.action(actions, 'download', t('Export cards'), () => this.exportCards());
        this.action(actions, 'upload', t('Import cards'), () => this.importCards());
    }

    private action(container: HTMLElement, iconName: string, label: string, action: () => void): void {
        const button = container.createEl('button');
        const icon = button.createSpan();
        setIcon(icon, iconName);
        button.createSpan({ text: label });
        button.addEventListener('click', action);
    }

    private exportCards(): void {
        const groups = this.plugin.fsrsManager.getCardGroups();
        const payload = {
            format: 'hinote-hicard-export',
            version: 1,
            exportedAt: new Date().toISOString(),
            cards: this.plugin.fsrsManager.getAllCards().map(card => ({
                question: card.text,
                answer: card.answer,
                filePath: card.filePath,
                groups: groups.filter(group => card.groupIds?.includes(group.id)).map(group => group.name)
            }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = this.container?.createEl('a');
        if (!link) return;
        link.href = url;
        link.download = `hicard-export-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        new Notice(t('HiCard export created'));
    }

    private importCards(): void {
        const input = this.container?.createEl('input');
        if (!input) return;
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.hidden = true;
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) { input.remove(); return; }
            void file.text().then(text => this.applyImport(text)).catch(() => new Notice(t('Could not read this import file.')));
            input.remove();
        }, { once: true });
        input.click();
    }

    private applyImport(text: string): void {
        try {
            const parsed = JSON.parse(text) as { cards?: unknown[] };
            if (!Array.isArray(parsed.cards) || parsed.cards.length > 5000) throw new Error('invalid');
            const groups = this.plugin.fsrsManager.getCardGroups();
            let count = 0;
            for (const raw of parsed.cards) {
                if (!raw || typeof raw !== 'object') continue;
                const item = raw as { question?: unknown; text?: unknown; answer?: unknown; filePath?: unknown; groups?: unknown };
                const question = typeof item.question === 'string' ? item.question : typeof item.text === 'string' ? item.text : '';
                if (!question.trim() || typeof item.answer !== 'string' || !item.answer.trim()) continue;
                const card = this.plugin.fsrsManager.addCard(question.trim(), item.answer.trim(), typeof item.filePath === 'string' ? item.filePath : undefined);
                if (Array.isArray(item.groups)) {
                    for (const name of item.groups) {
                        const group = groups.find(candidate => candidate.name === name);
                        if (group) this.plugin.fsrsManager.addCardToGroup(card.id, group.id);
                    }
                }
                count++;
            }
            new Notice(t('Imported {count} cards', { count }));
        } catch {
            new Notice(t('This is not a valid HiCard JSON export.'));
        }
    }
}

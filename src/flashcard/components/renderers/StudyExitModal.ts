import { App, Modal } from 'obsidian';
import { t } from '../../../i18n';

export type StudyExitChoice = 'stay' | 'discard' | 'save';

/** Closing the dialog with Escape or the close button always keeps the draft. */
export class StudyExitModal extends Modal {
    readonly result: Promise<StudyExitChoice>;
    private resolveChoice: (choice: StudyExitChoice) => void = () => {};

    constructor(app: App) {
        super(app);
        this.result = new Promise(resolve => { this.resolveChoice = resolve; });
    }

    onOpen(): void {
        this.titleEl.setText(t('Unsaved answer'));
        this.contentEl.createEl('p', { text: t('Save your answer before leaving this study session?') });
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        const choices: { choice: StudyExitChoice; label: string; cls?: string }[] = [
            { choice: 'stay', label: 'Keep studying' },
            { choice: 'discard', label: 'Discard and exit' },
            { choice: 'save', label: 'Save and exit', cls: 'mod-cta' }
        ];
        for (const { choice, label, cls } of choices) {
            const button = actions.createEl('button', { text: t(label), cls, attr: { type: 'button' } });
            button.addEventListener('click', () => { this.resolveChoice(choice); this.close(); });
        }
    }

    onClose(): void {
        this.resolveChoice('stay');
        this.contentEl.empty();
    }
}

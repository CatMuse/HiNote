import { App } from 'obsidian';
import { FSRSStorage } from '../flashcard';
import { DataValidator } from './DataValidator';
import { FilePathUtils } from './FilePathUtils';

export class FlashcardDataStore {
    constructor(
        private app: App,
        private vaultPath: string
    ) {}

    async load(): Promise<FSRSStorage | null> {
        const path = this.getFlashcardPath();
        if (!await this.app.vault.adapter.exists(path)) return null;
        const data = JSON.parse(await this.app.vault.adapter.read(path));
        if (!DataValidator.validateFlashcardData(data).valid) {
            throw new Error('Invalid HiNote flashcard data. Restore it before saving.');
        }
        return data;
    }

    async save(data: FSRSStorage): Promise<void> {
        const path = this.getFlashcardPath();
        if (await this.app.vault.adapter.exists(path)) {
            const previous = await this.app.vault.adapter.read(path);
            if (!DataValidator.validateFlashcardData(JSON.parse(previous)).valid) {
                throw new Error('Refusing to overwrite invalid HiNote flashcard data.');
            }
            await this.app.vault.adapter.write(`${path}.bak`, previous);
        }
        await this.app.vault.adapter.write(path, JSON.stringify(data, null, 2));
    }

    private getFlashcardPath(): string {
        return `${FilePathUtils.getFlashcardsDir(this.vaultPath)}/cards.json`;
    }
}

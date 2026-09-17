import { App } from 'obsidian';
import type { HighlightRecord as HiNote } from '../types/highlight';
import type { FSRSStorage } from '../flashcard';
import { DataValidator } from './DataValidator';
import { decodeHighlightRecord, encodeHighlightRecord, OptimizedHighlightData } from './HighlightDataFormat';
import { FileMappingStore } from './FileMappingStore';
import { detectHighlightFilesFromStorage, ensureHiNoteDirectoryStructure } from './HiNoteStorageLayout';
import { FlashcardDataStore } from './FlashcardDataStore';
import { StorageQueue } from './StorageQueue';

/** Vault-local storage. All mapping and highlight operations share a write order. */
export class HiNoteDataManager {
    private readonly version = '2.0';
    private readonly fileMappingStore: FileMappingStore;
    private readonly flashcardDataStore: FlashcardDataStore;
    private readonly queue = new StorageQueue();
    private initializePromise: Promise<void> | null = null;

    constructor(private app: App) {
        this.fileMappingStore = new FileMappingStore(app, '', this.version);
        this.flashcardDataStore = new FlashcardDataStore(app, '');
    }

    initialize(): Promise<void> {
        if (!this.initializePromise) {
            this.initializePromise = this.initializeStorage();
        }
        return this.initializePromise;
    }

    private async initializeStorage(): Promise<void> {
        await ensureHiNoteDirectoryStructure(this.app, '');
        await this.fileMappingStore.load();
        if (this.fileMappingStore.getMappedFiles().length === 0) {
            const recovered = await detectHighlightFilesFromStorage(this.app, '', (path, name) => {
                this.fileMappingStore.set(path, name);
            });
            if (recovered.length) await this.fileMappingStore.save();
        }
    }

    async getFileHighlights(filePath: string): Promise<HiNote[]> {
        await this.initialize();
        return this.queue.run(async () => {
            // Reading an unannotated note must not create a mapping.
            if (!this.fileMappingStore.get(filePath)) return [];
            const path = await this.fileMappingStore.getStoragePathForFile(filePath);
            if (!await this.app.vault.adapter.exists(path)) {
                // Older versions created mappings even when a note had no stored comments.
                return [];
            }
            const data: OptimizedHighlightData = JSON.parse(await this.app.vault.adapter.read(path));
            if (!DataValidator.validateHighlightData(data).valid) {
                throw new Error('Invalid HiNote highlight data. Restore it before editing.');
            }
            return Object.entries(data.highlights).map(([id, highlight]) =>
                decodeHighlightRecord(id, highlight, filePath));
        });
    }

    async saveFileHighlights(
        filePath: string, highlights: HiNote[], shouldWrite: () => boolean = () => true
    ): Promise<boolean> {
        // Snapshot before yielding: callers may mutate their array while a write is pending.
        const ids = new Set<string>();
        const data: OptimizedHighlightData = {
            version: this.version,
            lastModified: Date.now(),
            highlights: Object.fromEntries(highlights.map(highlight => {
                if (ids.has(highlight.id)) throw new Error('Duplicate highlight record ID.');
                ids.add(highlight.id);
                return [highlight.id, encodeHighlightRecord(highlight)];
            }))
        };
        const content = JSON.stringify(data, null, 2);
        await this.initialize();
        return this.queue.run(async () => {
            if (!shouldWrite()) return false;
            const existing = this.fileMappingStore.get(filePath);
            const path = await this.fileMappingStore.getStoragePathForFile(filePath);
            if (existing && await this.app.vault.adapter.exists(path)) {
                const previous = await this.app.vault.adapter.read(path);
                if (!DataValidator.validateHighlightData(JSON.parse(previous)).valid) {
                    throw new Error('Refusing to overwrite invalid HiNote highlight data.');
                }
                await this.app.vault.adapter.write(`${path}.bak`, previous);
            }
            // A source change can occur while reading/backing up the previous
            // file in this nested queue. Check again immediately before write.
            if (!shouldWrite()) return false;
            await this.app.vault.adapter.write(path, content);
            return true;
        });
    }

    async deleteFileHighlights(filePath: string): Promise<void> {
        await this.initialize();
        await this.queue.run(async () => {
            if (!this.fileMappingStore.get(filePath)) return;
            const path = await this.fileMappingStore.getStoragePathForFile(filePath);
            const previous = this.fileMappingStore.get(filePath)!;
            // Publish the removal first: failure leaves an orphan, never a dangling mapping.
            this.fileMappingStore.delete(filePath);
            try {
                await this.fileMappingStore.save();
            } catch (error) {
                this.fileMappingStore.set(filePath, previous);
                throw error;
            }
            if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
        });
    }

    async handleFileRename(oldPath: string, newPath: string): Promise<void> {
        await this.initialize();
        await this.queue.run(async () => {
            if (oldPath === newPath || !this.fileMappingStore.get(oldPath)) return;
            // Validate uniqueness before changing ownership; keep the physical file unchanged.
            const path = await this.fileMappingStore.getStoragePathForFile(oldPath);
            if (!await this.app.vault.adapter.exists(path)) throw new Error('HiNote rename source data is missing.');
            if (this.fileMappingStore.get(newPath)) throw new Error('HiNote rename destination already has stored data.');
            const name = this.fileMappingStore.get(oldPath)!;
            this.fileMappingStore.delete(oldPath);
            this.fileMappingStore.set(newPath, name);
            try {
                await this.fileMappingStore.save();
            } catch (error) {
                this.fileMappingStore.delete(newPath);
                this.fileMappingStore.set(oldPath, name);
                throw error;
            }
        });
    }

    async getAllHighlightFiles(): Promise<string[]> {
        await this.initialize();
        return this.queue.run(async () => this.fileMappingStore.getMappedFiles());
    }

    async getFlashcardData(): Promise<FSRSStorage | null> {
        await this.initialize();
        return this.flashcardDataStore.load();
    }

    async saveFlashcardData(data: FSRSStorage): Promise<void> {
        await this.initialize();
        await this.flashcardDataStore.save(data);
    }
}

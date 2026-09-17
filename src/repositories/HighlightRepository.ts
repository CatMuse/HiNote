import { copyHighlightRecord } from '../models/HighlightModels';
import { getHighlightAnchor, sameHighlightAnchor, type HighlightAnchorPatch } from './HighlightAnchorPatch';
import { StorageQueue } from '../storage/StorageQueue';
import { TFile } from 'obsidian';
import { HighlightRecord as HiNote } from '../types/highlight';
import { HiNoteDataManager } from '../storage/HiNoteDataManager';
import { IHighlightRepository } from './IHighlightRepository';

/**
 * 高亮数据仓储实现
 * 职责：
 * 1. 管理高亮数据的内存缓存
 * 2. 协调数据持久化操作
 * 3. 提供统一的数据访问接口
 */
export class HighlightRepository implements IHighlightRepository {
    private readonly mutations = new StorageQueue();
    private cache: Map<string, HiNote[]> = new Map();
    private dataManager: HiNoteDataManager;

    constructor(dataManager: HiNoteDataManager) {
        this.dataManager = dataManager;
    }

    private initialization: Promise<void> | null = null;
    private disposed = false;
    private readonly pathVersions = new Map<string, number>();

    private readonly reads = new Map<string, Promise<HiNote[]>>();

    initialize(): Promise<void> {
        if (!this.initialization) {
            this.initialization = (async () => {
                await this.dataManager.initialize();
                for (const path of await this.dataManager.getAllHighlightFiles()) {
                    await this.getFileHighlights(path);
                }
            })();
        }
        return this.initialization;
    }

    async getFileHighlights(filePath: string): Promise<HiNote[]> {
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath) || [];
        }
        
        let pending = this.reads.get(filePath);
        if (!pending) {
            pending = this.dataManager.getFileHighlights(filePath).then(highlights => {
                this.cache.set(filePath, highlights);
                return highlights;
            }).finally(() => this.reads.delete(filePath));
            this.reads.set(filePath, pending);
        }
        return pending;
    }

    async saveFileHighlights(filePath: string, highlights: HiNote[]): Promise<void> {
        const records = highlights.map(copyHighlightRecord);
        await this.mutations.run(async () => {
            await this.getFileHighlights(filePath);
            await this.dataManager.saveFileHighlights(filePath, records);
            this.cache.set(filePath, records);
        });
    }

    /** Merge only anchors into the latest records inside the existing write queue. */
    async patchHighlightAnchors(
        filePath: string, patches: HighlightAnchorPatch[], isCurrent: () => boolean
    ): Promise<void> {
        const version = this.pathVersions.get(filePath) || 0;
        const valid = () => !this.disposed && version === (this.pathVersions.get(filePath) || 0) && isCurrent();
        await this.mutations.run(async () => {
            if (!valid()) return;
            const latest = await this.getFileHighlights(filePath);
            if (!valid()) return;
            const byId = new Map(patches.map(patch => [patch.id, patch]));
            let changed = false;
            const next = latest.map(record => {
                const patch = record.id ? byId.get(record.id) : undefined;
                if (!patch || record.kind === 'file-comment' || !sameHighlightAnchor(getHighlightAnchor(record), patch.expected)) return record;
                if (sameHighlightAnchor(getHighlightAnchor(record), patch.anchor)) return record;
                changed = true;
                // Whitelist fields at runtime too. Comments and their timestamps
                // are always taken from the current repository record.
                return { ...record, ...getHighlightAnchor(patch.anchor) };
            });
            if (!changed || !valid()) return;
            const written = await this.dataManager.saveFileHighlights(filePath, next, valid);
            if (written !== false) this.cache.set(filePath, next);
        });
    }

    dispose(): void { this.disposed = true; }

    private invalidateAnchorWrites(filePath: string): void {
        this.pathVersions.set(filePath, (this.pathVersions.get(filePath) || 0) + 1);
    }

    async deleteFileHighlights(filePath: string): Promise<void> {
        this.invalidateAnchorWrites(filePath);
        await this.mutations.run(async () => {
            await this.reads.get(filePath);
            await this.dataManager.deleteFileHighlights(filePath);
            this.cache.delete(filePath);
        });
    }

    handleFileRename(oldPath: string, newPath: string): Promise<void> {
        this.invalidateAnchorWrites(oldPath);
        this.invalidateAnchorWrites(newPath);
        return this.mutations.run(() => this.renameFile(oldPath, newPath));
    }

    private async renameFile(oldPath: string, newPath: string): Promise<void> {
        await this.reads.get(oldPath);
        await this.reads.get(newPath);
        await this.dataManager.initialize();

        const cachedHighlights = this.cache.get(oldPath);
        const oldPathHighlights = cachedHighlights && cachedHighlights.length > 0
            ? cachedHighlights
            : await this.dataManager.getFileHighlights(oldPath);

        await this.dataManager.handleFileRename(oldPath, newPath);
        
        oldPathHighlights.forEach(highlight => {
            highlight.filePath = newPath;
        });

        if (oldPathHighlights.length > 0) {
            this.cache.set(newPath, oldPathHighlights);
        } else {
            this.cache.delete(newPath);
        }

        this.cache.delete(oldPath);
    }

    async getAllHighlightFiles(): Promise<string[]> {
        return await this.dataManager.getAllHighlightFiles();
    }

    getCachedHighlights(filePath: string): HiNote[] | null {
        return this.cache.get(filePath) || null;
    }

    invalidateCache(filePath: string): void {
        this.invalidateAnchorWrites(filePath);
        this.cache.delete(filePath);
    }

    getAllCachedHighlights(): Map<string, HiNote[]> {
        return new Map(this.cache);
    }

    findHighlightById(highlightId: string): HiNote | null {
        if (!highlightId) return null;
        
        for (const fileHighlights of this.cache.values()) {
            const highlight = fileHighlights.find(h => h.id === highlightId);
            if (highlight) {
                return highlight;
            }
        }
        
        return null;
    }

    findHighlightsByBlockId(file: TFile, blockId: string): HiNote[] {
        if (!file || !blockId) return [];
        
        const filePath = file.path;
        const fileHighlights = this.cache.get(filePath) || [];
        
        return fileHighlights.filter(highlight => highlight.blockId === blockId);
    }
}

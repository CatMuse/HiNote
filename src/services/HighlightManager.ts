import { copyHighlightRecord, createHighlightRecord, getHighlightSource, recordToHighlightView } from '../models/HighlightModels';
import { findStoredHighlightMatch } from './highlight/HighlightMatchStrategies';
import { matchFileHighlights } from './highlight/HighlightMatchStrategies';
import { StorageQueue } from '../storage/StorageQueue';
import { App, TFile } from 'obsidian';
import { HighlightInfo as HiNote, HighlightRecord } from '../types/highlight';
import { IHighlightRepository } from '../repositories/IHighlightRepository';
import { EventManager } from './EventManager';
import { HighlightService } from './HighlightService';
import { IdGenerator } from '../utils/IdGenerator';

/**
 * 高亮管理器 - 业务逻辑层
 * 职责：
 * 1. 处理高亮的业务逻辑（添加、删除、更新）
 * 2. 数据验证和清理
 * 3. 事件触发协调
 * 4. 协调多个服务和仓储
 */
export class HighlightManager {
    private readonly mutations = new StorageQueue();
    constructor(
        private app: App,
        private repository: IHighlightRepository,
        private eventManager: EventManager,
        private highlightService: HighlightService
    ) {}

    /**
     * 添加或更新高亮
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 添加的高亮
     */
    addHighlight(file: TFile, highlight: HiNote): Promise<HighlightRecord> {
        return this.mutations.run(() => this.persistHighlight(file, highlight, false));
    }

    /** Creating a card must reuse the saved identity without rewriting comments. */
    ensureStoredHighlight(file: TFile, highlight: HiNote): Promise<HighlightRecord> {
        return this.mutations.run(() => this.persistHighlight(file, highlight, true));
    }

    /** Favorite mutations share the identity/write queue with comments and cards. */
    setFavorite(highlight: HiNote, favorite: boolean, timestamp = Date.now()): Promise<void> {
        return this.mutations.run(async () => {
            const filePath = highlight.filePath;
            if (!filePath) throw new Error('No corresponding file found.');
            const records = [...await this.repository.getFileHighlights(filePath)];
            const requestedId = highlight.recordId || highlight.id;
            let previous = records.find(record => record.id === requestedId);
            const source = getHighlightSource(highlight);
            if (!previous && !highlight.recordId && source) previous = findStoredHighlightMatch(source, records)?.highlight;
            if (!previous && !favorite) return;
            // Never resurrect a deleted saved card from a stale view or undo action.
            if (!previous && highlight.recordId) throw new Error('Highlight no longer exists.');
            if (!previous && !(this.app.vault.getAbstractFileByPath(filePath) instanceof TFile)) {
                throw new Error('No corresponding file found.');
            }
            if (previous && !!previous.favoritedAt === favorite) {
                this.publishIdentity(highlight, previous);
                return;
            }
            const record = previous ? copyHighlightRecord(previous) : createHighlightRecord(
                highlight, IdGenerator.generateHighlightRecordId(), filePath, Date.now()
            );
            record.favoritedAt = favorite ? timestamp : undefined;
            record.updatedAt = Date.now();
            const index = previous ? records.indexOf(previous) : -1;
            if (index >= 0) records[index] = record; else records.push(record);
            await this.repository.saveFileHighlights(filePath, records);
            this.publishIdentity(highlight, record);
            this.eventManager.emitFavoritesChanged();
        });
    }

    private async persistHighlight(file: TFile, highlight: HiNote, ensureOnly: boolean): Promise<HighlightRecord> {
        const filePath = file.path;
        const records = [...await this.repository.getFileHighlights(filePath)];
        const requestedId = highlight.recordId || highlight.id;
        let previous = records.find(record => record.id === requestedId);
        // Two views can save the same occurrence before either gets refreshed.
        // Only full-scan provenance allows reusing a newly saved association.
        const source = getHighlightSource(highlight);
        if (!previous && !highlight.recordId && source) {
            previous = findStoredHighlightMatch(source, records)?.highlight;
        }
        if (ensureOnly && previous) {
            this.publishIdentity(highlight, previous);
            return previous;
        }

        let id = previous?.id;
        if (!id) {
            const ids = new Set(records.map(record => record.id));
            do { id = IdGenerator.generateHighlightRecordId(); } while (ids.has(id));
        }
        const record = createHighlightRecord(highlight, id, filePath, Date.now(), previous);
        if (previous && !highlight.recordId && highlight.id !== previous.id) {
            // A second first-save contains only its own draft comments. Merge
            // those by comment ID instead of replacing the first view's save.
            record.comments = [...new Map([...previous.comments, ...record.comments].map(comment => [comment.id, { ...comment }])).values()];
        }
        const index = previous ? records.indexOf(previous) : -1;
        if (index >= 0) records[index] = record; else records.push(record);
        await this.repository.saveFileHighlights(filePath, records);
        // Publish only after successful persistence. A failed save keeps its
        // draft/scan key and can be retried without dangling flashcard links.
        this.publishIdentity(highlight, record);
        if (this.eventManager) {
            const latest = record.comments[record.comments.length - 1];
            if (latest) this.eventManager.emitCommentUpdate(filePath, record.text, latest.content, record.id);
            else this.eventManager.emitHighlightUpdate(filePath, record.text, record.text, record.id);
        }
        return record;
    }

    private publishIdentity(view: HiNote, record: HighlightRecord): void {
        view.id = record.id;
        view.recordId = record.id;
        view.kind = record.kind;
        view.isVirtual = record.kind === 'file-comment';
        view.filePath = record.filePath;
        view.favoritedAt = record.favoritedAt;
        view.createdAt = record.createdAt;
        view.updatedAt = record.updatedAt;
        view.comments = record.comments.map(comment => ({ ...comment }));
    }

    /**
     * 移除高亮
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 是否成功移除
     */
    removeHighlight(file: TFile, highlight: HiNote, preserveFavorite = false): Promise<boolean> {
        return this.mutations.run(() => this.deleteHighlight(file, highlight, preserveFavorite));
    }

    private async deleteHighlight(file: TFile, highlight: HiNote, preserveFavorite = false): Promise<boolean> {
        const filePath = file.path;
        const fileHighlights = [...await this.repository.getFileHighlights(filePath)];

        const saved = fileHighlights.find(h => h.id === (highlight.recordId || highlight.id));
        if (preserveFavorite && saved?.favoritedAt) return false;
        const highlightExists = !!saved;
        if (!highlightExists) {
            return false;
        }

        const updatedHighlights = fileHighlights.filter(h => h.id !== saved?.id);

        if (updatedHighlights.length > 0) {
            await this.repository.saveFileHighlights(filePath, updatedHighlights);
        } else {
            await this.repository.deleteFileHighlights(filePath);
        }

        if (this.eventManager && highlight.id) {
            if (highlight.comments && highlight.comments.length > 0) {
                const latestComment = highlight.comments[highlight.comments.length - 1];
                this.eventManager.emitCommentDelete(filePath, latestComment.content, highlight.id);
            } else {
                this.eventManager.emitHighlightDelete(filePath, highlight.text, highlight.id);
            }
        }

        if (saved?.favoritedAt) this.eventManager.emitFavoritesChanged();
        return true;
    }

    /**
     * 获取文件的所有高亮
     * @param file 文件
     * @returns 高亮数组
     */
    async getFileHighlights(file: TFile): Promise<HiNote[]> {
        if (!file) return [];
        return (await this.repository.getFileHighlights(file.path)).map(recordToHighlightView);
    }

    /**
     * 根据文本和位置查找高亮
     * @param file 文件
     * @param highlight 高亮信息（包含 text 和 position）
     * @returns 匹配的高亮数组
     */
    async findHighlights(file: TFile, highlight: { text: string; position?: number }): Promise<HiNote[]> {
        if (!file) return [];

        const fileHighlights = await this.repository.getFileHighlights(file.path);

        return fileHighlights.filter(c => {
            const textMatch = c.text === highlight.text;
            if (!textMatch) return false;

            if (typeof c.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(c.position - highlight.position) < 1000;
            }
            return true;
        }).map(recordToHighlightView);
    }

    /**
     * 根据 blockId 查找高亮
     * @param file 文件
     * @param blockId 块 ID
     * @returns 高亮数组
     */
    async findHighlightsByBlockId(file: TFile, blockId: string): Promise<HiNote[]> {
        return this.repository.findHighlightsByBlockId(file, blockId).map(recordToHighlightView);
    }

    /**
     * 根据 ID 查找高亮
     * @param highlightId 高亮 ID
     * @returns 高亮信息，如果未找到则返回 null
     */
    findHighlightById(highlightId: string): HiNote | null {
        const record = this.repository.findHighlightById(highlightId);
        return record ? recordToHighlightView(record) : null;
    }

    /** Unlocated is a diagnostic state, never proof that comments may be deleted. */
    async checkOrphanedDataCount(): Promise<{ orphanedHighlights: number; affectedFiles: number; skippedFiles: number }> {
        let orphanedHighlights = 0;
        let affectedFiles = 0;
        let skippedFiles = 0;
        for (const [filePath, highlights] of this.repository.getAllCachedHighlights()) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) {
                // A missing path may be a rename or a sync in progress.
                orphanedHighlights += highlights.length;
                if (highlights.length) affectedFiles++;
                continue;
            }
            if (!this.highlightService.shouldProcessFile(file)) { skippedFiles++; continue; }
            try {
                const content = await this.app.vault.read(file);
                const current = this.highlightService.extractHighlights(content, file);
                const matched = new Set([...matchFileHighlights(current, highlights).values()].map(match => match.highlight));
                const count = highlights.filter(record => record.kind !== 'file-comment' && !matched.has(record)).length;
                orphanedHighlights += count;
                if (count) affectedFiles++;
            } catch (error) {
                skippedFiles++;
                console.error('[HiNote] Could not check highlight associations:', filePath, error);
            }
        }
        return { orphanedHighlights, affectedFiles, skippedFiles };
    }

    /**
     * 处理文件重命名
     * @param oldPath 旧路径
     * @param newPath 新路径
     */
    async handleFileRename(oldPath: string, newPath: string): Promise<void> {
        await this.mutations.run(() => this.repository.handleFileRename(oldPath, newPath));
    }
}

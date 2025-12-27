import { TFile } from 'obsidian';
import { HighlightInfo as HiNote } from '../types';
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
    private cache: Map<string, HiNote[]> = new Map();
    private dataManager: HiNoteDataManager;

    constructor(dataManager: HiNoteDataManager) {
        this.dataManager = dataManager;
    }

    async initialize(): Promise<void> {
        await this.dataManager.initialize();
        await this.loadAllHighlightsToCache();
    }

    /**
     * 从存储层加载所有高亮到缓存
     */
    private async loadAllHighlightsToCache(): Promise<void> {
        try {
            const highlightFiles = await this.dataManager.getAllHighlightFiles();
            
            for (const filePath of highlightFiles) {
                if (!this.cache.has(filePath)) {
                    this.cache.set(filePath, []);
                }
            }
            
            for (const filePath of highlightFiles) {
                this.loadFileHighlightsAsync(filePath);
            }
        } catch (error) {
            console.error('[HighlightRepository] 加载高亮文件列表失败:', error);
        }
    }

    /**
     * 异步加载单个文件的高亮数据
     */
    private async loadFileHighlightsAsync(filePath: string): Promise<void> {
        try {
            const highlights = await this.dataManager.getFileHighlights(filePath);
            if (highlights.length > 0) {
                this.cache.set(filePath, highlights);
            } else {
                this.cache.delete(filePath);
            }
        } catch (error) {
            console.warn(`[HighlightRepository] 加载文件 ${filePath} 的高亮数据失败:`, error);
        }
    }

    async getFileHighlights(filePath: string): Promise<HiNote[]> {
        if (this.cache.has(filePath)) {
            return this.cache.get(filePath) || [];
        }
        
        const highlights = await this.dataManager.getFileHighlights(filePath);
        this.cache.set(filePath, highlights);
        return highlights;
    }

    async saveFileHighlights(filePath: string, highlights: HiNote[]): Promise<void> {
        this.cache.set(filePath, highlights);
        await this.dataManager.saveFileHighlights(filePath, highlights);
    }

    async deleteFileHighlights(filePath: string): Promise<void> {
        this.cache.delete(filePath);
        await this.dataManager.deleteFileHighlights(filePath);
    }

    async handleFileRename(oldPath: string, newPath: string): Promise<void> {
        await this.dataManager.handleFileRename(oldPath, newPath);
        
        const oldPathHighlights = this.cache.get(oldPath) || [];
        oldPathHighlights.forEach(highlight => {
            highlight.filePath = newPath;
        });
        this.cache.set(newPath, oldPathHighlights);
        this.cache.delete(oldPath);
    }

    async getAllHighlightFiles(): Promise<string[]> {
        return await this.dataManager.getAllHighlightFiles();
    }

    getCachedHighlights(filePath: string): HiNote[] | null {
        return this.cache.get(filePath) || null;
    }

    invalidateCache(filePath: string): void {
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

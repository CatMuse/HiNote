import { App, TFile } from 'obsidian';
import { HighlightInfo as HiNote } from '../types';
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
    async addHighlight(file: TFile, highlight: HiNote): Promise<HiNote> {
        if (!highlight.id) {
            highlight.id = IdGenerator.generateHighlightId(
                file.path,
                highlight.position || 0,
                highlight.text
            );
        }

        const now = Date.now();
        if (!highlight.createdAt) {
            highlight.createdAt = now;
        }
        highlight.updatedAt = now;

        const filePath = file.path;
        const fileHighlights = await this.repository.getFileHighlights(filePath);
        const existingIndex = fileHighlights.findIndex(h => h.id === highlight.id);

        if (existingIndex >= 0) {
            fileHighlights[existingIndex] = highlight;
        } else {
            fileHighlights.push(highlight);
        }

        await this.repository.saveFileHighlights(filePath, fileHighlights);

        if (this.eventManager) {
            if (highlight.comments && highlight.comments.length > 0) {
                const latestComment = highlight.comments[highlight.comments.length - 1];
                this.eventManager.emitCommentUpdate(filePath, highlight.text, latestComment.content, highlight.id);
            } else {
                this.eventManager.emitHighlightUpdate(filePath, highlight.text, highlight.text, highlight.id);
            }
        }

        return highlight;
    }

    /**
     * 移除高亮
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 是否成功移除
     */
    async removeHighlight(file: TFile, highlight: HiNote): Promise<boolean> {
        const filePath = file.path;
        const fileHighlights = await this.repository.getFileHighlights(filePath);

        const highlightExists = fileHighlights.some(h => h.id === highlight.id);
        if (!highlightExists) {
            return false;
        }

        const updatedHighlights = fileHighlights.filter(h => h.id !== highlight.id);

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

        return true;
    }

    /**
     * 获取文件的所有高亮
     * @param file 文件
     * @returns 高亮数组
     */
    async getFileHighlights(file: TFile): Promise<HiNote[]> {
        if (!file) return [];
        return await this.repository.getFileHighlights(file.path);
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
            if (textMatch) {
                if (typeof c.position === 'number' && typeof highlight.position === 'number') {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return true;
            }

            if (typeof c.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(c.position - highlight.position) < 30;
            }

            return false;
        });
    }

    /**
     * 根据 blockId 查找高亮
     * @param file 文件
     * @param blockId 块 ID
     * @returns 高亮数组
     */
    async findHighlightsByBlockId(file: TFile, blockId: string): Promise<HiNote[]> {
        return this.repository.findHighlightsByBlockId(file, blockId);
    }

    /**
     * 根据 ID 查找高亮
     * @param highlightId 高亮 ID
     * @returns 高亮信息，如果未找到则返回 null
     */
    findHighlightById(highlightId: string): HiNote | null {
        return this.repository.findHighlightById(highlightId);
    }

    /**
     * 检查孤立数据数量
     * 检查所有存储的高亮和评论，统计那些在文档中找不到对应高亮文本的孤立数据数量
     * @returns 孤立数据数量
     */
    async checkOrphanedDataCount(): Promise<{ orphanedHighlights: number; affectedFiles: number }> {
        let orphanedHighlights = 0;
        let affectedFiles = new Set<string>();

        const allHighlights = this.repository.getAllCachedHighlights();

        for (const [filePath, highlights] of allHighlights.entries()) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                affectedFiles.add(filePath);
                orphanedHighlights += highlights.length;
                continue;
            }

            try {
                const content = await this.app.vault.read(file);
                const extractedHighlights = this.highlightService.extractHighlights(content, file);
                const extractedTexts = new Set(extractedHighlights.map(h => h.text));

                let fileHasOrphans = false;

                for (const highlight of highlights) {
                    if (highlight.isVirtual) continue;

                    if (!extractedTexts.has(highlight.text)) {
                        orphanedHighlights++;
                        fileHasOrphans = true;
                    }
                }

                if (fileHasOrphans) {
                    affectedFiles.add(filePath);
                }
            } catch (error) {
                // 错误处理
            }
        }

        return { orphanedHighlights, affectedFiles: affectedFiles.size };
    }

    /**
     * 清理孤立数据
     * 检查所有存储的高亮和评论，移除那些在文档中找不到对应高亮文本的孤立数据
     * @returns 清理的数据数量
     */
    async cleanOrphanedData(): Promise<{ removedHighlights: number; affectedFiles: number }> {
        let removedHighlights = 0;
        let affectedFiles = new Set<string>();

        const allHighlights = this.repository.getAllCachedHighlights();

        for (const [filePath, highlights] of allHighlights.entries()) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                await this.repository.deleteFileHighlights(filePath);
                affectedFiles.add(filePath);
                removedHighlights += highlights.length;
                continue;
            }

            try {
                const content = await this.app.vault.read(file);
                const extractedHighlights = this.highlightService.extractHighlights(content, file);
                const extractedTexts = new Set(extractedHighlights.map(h => h.text));

                const validHighlights = highlights.filter(highlight => {
                    if (highlight.isVirtual) return true;
                    return extractedTexts.has(highlight.text);
                });

                if (validHighlights.length < highlights.length) {
                    removedHighlights += highlights.length - validHighlights.length;
                    affectedFiles.add(filePath);

                    if (validHighlights.length === 0) {
                        await this.repository.deleteFileHighlights(filePath);
                    } else {
                        await this.repository.saveFileHighlights(filePath, validHighlights);
                    }
                }
            } catch (error) {
                // 错误处理
            }
        }

        return { removedHighlights, affectedFiles: affectedFiles.size };
    }

    /**
     * 处理文件重命名
     * @param oldPath 旧路径
     * @param newPath 新路径
     */
    async handleFileRename(oldPath: string, newPath: string): Promise<void> {
        await this.repository.handleFileRename(oldPath, newPath);
    }
}

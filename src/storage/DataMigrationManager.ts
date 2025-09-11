import { App, Plugin } from 'obsidian';
import { HiNoteDataManager } from './HiNoteDataManager';
import { HiNote, CommentsData } from '../CommentStore';
import { FSRSStorage } from '../flashcard/types/FSRSTypes';

/**
 * 迁移状态
 */
export interface MigrationStatus {
    isCompleted: boolean;
    version: string;
    migratedAt?: number;
    backupPath?: string;
}

/**
 * 迁移统计
 */
export interface MigrationStats {
    totalFiles: number;
    migratedFiles: number;
    totalHighlights: number;
    migratedHighlights: number;
    totalFlashcards: number;
    migratedFlashcards: number;
    errors: string[];
}

/**
 * 数据迁移管理器
 */
export class DataMigrationManager {
    private plugin: Plugin;
    private app: App;
    private dataManager: HiNoteDataManager;
    private readonly MIGRATION_VERSION = '2.0';

    constructor(plugin: Plugin, dataManager: HiNoteDataManager) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.dataManager = dataManager;
    }

    /**
     * 检查是否需要迁移
     */
    async needsMigration(): Promise<boolean> {
        try {
            // 检查迁移状态
            const status = await this.getMigrationStatus();
            if (status.isCompleted && status.version === this.MIGRATION_VERSION) {
                return false;
            }

            // 检查是否有旧数据需要迁移
            const oldData = await this.plugin.loadData();
            return !!(oldData?.comments || oldData?.fsrs);
        } catch (error) {
            console.error('检查迁移状态失败:', error);
            return false;
        }
    }

    /**
     * 执行数据迁移
     */
    async migrate(): Promise<MigrationStats> {
        const stats: MigrationStats = {
            totalFiles: 0,
            migratedFiles: 0,
            totalHighlights: 0,
            migratedHighlights: 0,
            totalFlashcards: 0,
            migratedFlashcards: 0,
            errors: []
        };

        try {
            // 1. 备份原始数据
            const backupPath = await this.backupOriginalData();
            
            // 2. 加载原始数据
            const oldData = await this.plugin.loadData();
            if (!oldData) {
                throw new Error('无法加载原始数据');
            }

            // 3. 初始化新存储结构
            await this.dataManager.initialize();

            // 4. 迁移高亮和评论数据
            if (oldData.comments) {
                await this.migrateHighlightsAndComments(oldData.comments, stats);
            }

            // 5. 迁移闪卡数据
            if (oldData.fsrs) {
                await this.migrateFlashcardData(oldData.fsrs, stats);
            }

            // 6. 清理data.json，只保留设置
            await this.cleanupDataJson(oldData);

            // 7. 标记迁移完成
            await this.markMigrationComplete(backupPath);

            console.log('数据迁移完成:', stats);
            return stats;

        } catch (error) {
            stats.errors.push(`迁移失败: ${error.message}`);
            console.error('数据迁移失败:', error);
            throw error;
        }
    }

    /**
     * 迁移高亮和评论数据
     */
    private async migrateHighlightsAndComments(commentsData: CommentsData, stats: MigrationStats): Promise<void> {
        stats.totalFiles = Object.keys(commentsData).length;

        for (const [filePath, fileHighlights] of Object.entries(commentsData)) {
            try {
                const highlights: HiNote[] = Object.values(fileHighlights).map(highlight => {
                    // 数据清理和标准化
                    const cleanHighlight: HiNote = {
                        id: highlight.id,
                        text: highlight.text,
                        position: highlight.position || 0,
                        createdAt: highlight.createdAt || Date.now(),
                        updatedAt: highlight.updatedAt || Date.now(),
                        filePath: filePath,
                        comments: highlight.comments || []
                    };

                    // 可选字段
                    if (highlight.backgroundColor) {
                        cleanHighlight.backgroundColor = highlight.backgroundColor;
                    }
                    if (highlight.blockId) {
                        cleanHighlight.blockId = highlight.blockId;
                    }
                    if (highlight.isCloze !== undefined) {
                        cleanHighlight.isCloze = highlight.isCloze;
                    }
                    if (highlight.paragraphOffset !== undefined) {
                        cleanHighlight.paragraphOffset = highlight.paragraphOffset;
                    }

                    return cleanHighlight;
                });

                await this.dataManager.saveFileHighlights(filePath, highlights);
                
                stats.migratedFiles++;
                stats.totalHighlights += highlights.length;
                stats.migratedHighlights += highlights.length;

            } catch (error) {
                const errorMsg = `迁移文件 ${filePath} 失败: ${error.message}`;
                stats.errors.push(errorMsg);
                console.error(errorMsg);
            }
        }
    }

    /**
     * 迁移闪卡数据
     */
    private async migrateFlashcardData(fsrsData: FSRSStorage, stats: MigrationStats): Promise<void> {
        try {
            // 直接保存FSRS数据到新位置
            await this.dataManager.saveFlashcardData(fsrsData);
            
            if (fsrsData.cards) {
                stats.totalFlashcards = Object.keys(fsrsData.cards).length;
                stats.migratedFlashcards = stats.totalFlashcards;
            }

        } catch (error) {
            const errorMsg = `迁移闪卡数据失败: ${error.message}`;
            stats.errors.push(errorMsg);
            console.error(errorMsg);
        }
    }

    /**
     * 备份原始数据
     */
    private async backupOriginalData(): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `.hinote/backup/data-backup-${timestamp}.json`;
        
        try {
            // 确保备份目录存在
            await this.app.vault.adapter.mkdir('.hinote/backup');
        } catch (error) {
            // 目录可能已存在
        }

        const originalData = await this.plugin.loadData();
        await this.app.vault.adapter.write(backupPath, JSON.stringify(originalData, null, 2));
        
        return backupPath;
    }

    /**
     * 清理data.json，只保留设置
     */
    private async cleanupDataJson(originalData: any): Promise<void> {
        // 提取设置数据，移除comments和fsrs
        const { comments, fsrs, ...settingsOnly } = originalData;
        
        // 保存纯净的设置数据
        await this.plugin.saveData(settingsOnly);
    }

    /**
     * 标记迁移完成
     */
    private async markMigrationComplete(backupPath: string): Promise<void> {
        const status: MigrationStatus = {
            isCompleted: true,
            version: this.MIGRATION_VERSION,
            migratedAt: Date.now(),
            backupPath
        };

        const statusPath = '.hinote/metadata/migration-status.json';
        await this.app.vault.adapter.write(statusPath, JSON.stringify(status, null, 2));
    }

    /**
     * 获取迁移状态
     */
    async getMigrationStatus(): Promise<MigrationStatus> {
        const statusPath = '.hinote/metadata/migration-status.json';
        
        try {
            const content = await this.app.vault.adapter.read(statusPath);
            return JSON.parse(content);
        } catch (error) {
            return {
                isCompleted: false,
                version: '1.0'
            };
        }
    }

    /**
     * 验证迁移结果
     */
    async validateMigration(): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            // 1. 检查迁移状态
            const status = await this.getMigrationStatus();
            if (!status.isCompleted) {
                issues.push('迁移未完成');
            }

            // 2. 检查数据完整性
            const highlightFiles = await this.dataManager.getAllHighlightFiles();
            if (highlightFiles.length === 0) {
                issues.push('未找到任何高亮数据文件');
            }

            // 3. 检查闪卡数据
            const flashcardData = await this.dataManager.getFlashcardData();
            if (!flashcardData) {
                issues.push('闪卡数据丢失');
            }

            // 4. 检查data.json是否已清理
            const currentData = await this.plugin.loadData();
            if (currentData?.comments || currentData?.fsrs) {
                issues.push('data.json未正确清理');
            }

        } catch (error) {
            issues.push(`验证过程出错: ${error.message}`);
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }

    /**
     * 回滚迁移（紧急情况使用）
     */
    async rollbackMigration(): Promise<void> {
        try {
            const status = await this.getMigrationStatus();
            if (!status.backupPath) {
                throw new Error('未找到备份文件路径');
            }

            // 恢复备份数据
            const backupContent = await this.app.vault.adapter.read(status.backupPath);
            const backupData = JSON.parse(backupContent);
            
            await this.plugin.saveData(backupData);

            // 删除迁移状态标记
            try {
                await this.app.vault.adapter.remove('.hinote/metadata/migration-status.json');
            } catch (error) {
                // 忽略删除错误
            }

            console.log('迁移已回滚');

        } catch (error) {
            console.error('回滚迁移失败:', error);
            throw error;
        }
    }
}

import { Plugin } from 'obsidian';
import { HiNoteDataManager } from './HiNoteDataManager';
import { FilePathUtils } from './FilePathUtils';

/**
 * 数据恢复工具
 * 用于从备份文件恢复丢失的数据
 */
export class DataRecovery {
    private plugin: Plugin;
    private dataManager: HiNoteDataManager;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.dataManager = new HiNoteDataManager(plugin.app);
    }

    /**
     * 从备份文件恢复数据
     */
    async recoverFromBackup(backupFilePath: string): Promise<boolean> {
        try {
            console.log('🔄 开始从备份恢复数据...');

            // 读取备份文件
            const backupContent = await this.plugin.app.vault.adapter.read(backupFilePath);
            const backupData = JSON.parse(backupContent);

            console.log('📁 备份数据:', backupData);

            // 初始化数据管理器
            await this.dataManager.initialize();

            // 恢复高亮和评论数据
            if (backupData.comments) {
                await this.recoverHighlights(backupData.comments);
            }

            // 恢复闪卡数据
            if (backupData.fsrs) {
                await this.recoverFlashcards(backupData.fsrs);
            }

            console.log('✅ 数据恢复完成');
            return true;

        } catch (error) {
            console.error('❌ 数据恢复失败:', error);
            return false;
        }
    }

    /**
     * 恢复高亮和评论数据
     */
    private async recoverHighlights(commentsData: any): Promise<void> {
        console.log('📝 恢复高亮和评论数据...');

        for (const [filePath, highlights] of Object.entries(commentsData)) {
            console.log(`处理文件: ${filePath}`);
            
            // 转换为新格式
            const optimizedData = {
                version: '2.0',
                lastModified: Date.now(),
                highlights: {} as any
            };

            for (const [highlightId, highlight] of Object.entries(highlights as any)) {
                const h = highlight as any;
                
                // 转换高亮数据格式
                optimizedData.highlights[highlightId] = {
                    text: h.text,
                    position: h.position,
                    endPosition: h.position + (h.originalLength || h.text.length),
                    backgroundColor: h.backgroundColor,
                    created: h.createdAt,
                    updated: h.updatedAt,
                    comments: h.comments?.map((c: any) => ({
                        id: c.id,
                        text: c.content,
                        created: c.createdAt,
                        updated: c.updatedAt
                    })) || []
                };
            }

            // 直接保存优化格式的数据
            const storagePath = `.hinote/highlights/${FilePathUtils.toSafeFileName(filePath)}.json`;
            await this.plugin.app.vault.adapter.write(storagePath, JSON.stringify(optimizedData, null, 2));
            console.log(`✅ 已恢复文件 ${filePath} 的数据`);
        }
    }

    /**
     * 恢复闪卡数据
     */
    private async recoverFlashcards(fsrsData: any): Promise<void> {
        console.log('🃏 恢复闪卡数据...');

        const flashcardData = {
            version: '2.0',
            lastModified: Date.now(),
            cards: fsrsData.cards || {},
            globalStats: fsrsData.globalStats || {
                totalCards: 0,
                totalReviews: 0,
                averageRetention: 0
            },
            groups: fsrsData.groups || {},
            dailyStats: fsrsData.dailyStats || {}
        };

        // 直接保存闪卡数据
        const flashcardPath = '.hinote/flashcards/cards.json';
        await this.plugin.app.vault.adapter.write(flashcardPath, JSON.stringify(flashcardData, null, 2));
        console.log('✅ 已恢复闪卡数据');
    }

    /**
     * 列出所有可用的备份文件
     */
    async listBackupFiles(): Promise<string[]> {
        try {
            const backupDir = '.hinote/backup';
            const files = await this.plugin.app.vault.adapter.list(backupDir);
            return files.files.filter(f => f.endsWith('.json'));
        } catch (error) {
            console.error('获取备份文件列表失败:', error);
            return [];
        }
    }

    /**
     * 自动选择最佳备份文件进行恢复
     */
    async autoRecover(): Promise<boolean> {
        try {
            const backupFiles = await this.listBackupFiles();
            console.log('📋 可用备份文件:', backupFiles);

            // 找到包含数据最多的备份文件
            let bestBackup = '';
            let maxDataSize = 0;

            for (const file of backupFiles) {
                try {
                    const content = await this.plugin.app.vault.adapter.read(file);
                    const data = JSON.parse(content);
                    
                    const commentsCount = Object.keys(data.comments || {}).length;
                    const cardsCount = Object.keys(data.fsrs?.cards || {}).length;
                    const totalData = commentsCount + cardsCount;

                    console.log(`备份文件 ${file}: ${commentsCount} 个高亮文件, ${cardsCount} 个闪卡`);

                    if (totalData > maxDataSize) {
                        maxDataSize = totalData;
                        bestBackup = file;
                    }
                } catch (error) {
                    console.warn(`无法读取备份文件 ${file}:`, error);
                }
            }

            if (bestBackup && maxDataSize > 0) {
                console.log(`🎯 选择最佳备份文件: ${bestBackup} (包含 ${maxDataSize} 项数据)`);
                return await this.recoverFromBackup(bestBackup);
            } else {
                console.log('❌ 没有找到有效的备份数据');
                return false;
            }

        } catch (error) {
            console.error('❌ 自动恢复失败:', error);
            return false;
        }
    }

    /**
     * 重置迁移状态，允许重新迁移
     */
    async resetMigrationStatus(): Promise<void> {
        try {
            const statusPath = '.hinote/metadata/migration-status.json';
            await this.plugin.app.vault.adapter.remove(statusPath);
            console.log('✅ 迁移状态已重置');
        } catch (error) {
            console.warn('重置迁移状态失败:', error);
        }
    }
}

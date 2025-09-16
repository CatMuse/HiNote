import { App, TFile } from 'obsidian';
import { HiNote, CommentItem } from '../CommentStore';
import { FlashcardState, FSRSStorage, FSRSGlobalStats } from '../flashcard/types/FSRSTypes';
import { FilePathUtils } from './FilePathUtils';
import { DataValidator } from './DataValidator';

/**
 * 新的优化数据格式
 */
export interface OptimizedHighlightData {
    version: string;
    lastModified: number;
    highlights: {
        [id: string]: OptimizedHighlight;
    };
}

export interface OptimizedHighlight {
    text: string;
    position: number;
    created: number;
    updated: number;
    backgroundColor?: string;
    blockId?: string;
    isCloze?: boolean;
    paragraphOffset?: number;
    comments?: OptimizedComment[];
}

export interface OptimizedComment {
    id: string;
    content: string;
    created: number;
    updated: number;
}

export interface FileMappingData {
    version: string;
    mapping: { [originalPath: string]: string };
    lastUpdated: number;
}

/**
 * HiNote数据管理器 - 新的分离存储实现
 */
export class HiNoteDataManager {
    private app: App;
    private vaultPath: string;
    private fileMapping: Map<string, string> = new Map();
    private readonly CURRENT_VERSION = '2.0';

    constructor(app: App) {
        this.app = app;
        // 对于Obsidian，我们直接使用相对路径，不需要获取绝对路径
        this.vaultPath = '';
    }

    /**
     * 初始化数据管理器
     */
    async initialize(): Promise<void> {
        await this.ensureDirectoryStructure();
        await this.loadFileMapping();
    }

    /**
     * 确保目录结构存在
     */
    private async ensureDirectoryStructure(): Promise<void> {
        const directories = [
            FilePathUtils.getHiNoteDir(this.vaultPath),
            FilePathUtils.getHighlightsDir(this.vaultPath),
            FilePathUtils.getFlashcardsDir(this.vaultPath),
            FilePathUtils.getMetadataDir(this.vaultPath)
        ];

        for (const dir of directories) {
            try {
                await this.app.vault.adapter.mkdir(dir);
            } catch (error) {
                // 目录可能已存在，忽略错误
            }
        }
    }

    /**
     * 加载文件映射
     */
    private async loadFileMapping(): Promise<void> {
        const mappingPath = `${FilePathUtils.getMetadataDir(this.vaultPath)}/file-mapping.json`;
        
        try {
            const content = await this.app.vault.adapter.read(mappingPath);
            const data: FileMappingData = JSON.parse(content);
            
            const validation = DataValidator.validateFileMappingData(data);
            if (!validation.valid) {
                console.warn('文件映射数据验证失败:', validation.errors);
                return;
            }

            this.fileMapping = new Map(Object.entries(data.mapping));
        } catch (error) {
            // 映射文件不存在或损坏，使用空映射
            this.fileMapping = new Map();
        }
    }

    /**
     * 保存文件映射
     */
    private async saveFileMapping(): Promise<void> {
        const mappingPath = `${FilePathUtils.getMetadataDir(this.vaultPath)}/file-mapping.json`;
        
        const data: FileMappingData = {
            version: this.CURRENT_VERSION,
            mapping: Object.fromEntries(this.fileMapping),
            lastUpdated: Date.now()
        };

        await this.app.vault.adapter.write(mappingPath, JSON.stringify(data, null, 2));
    }

    /**
     * 获取文件的安全存储路径
     */
    private getStoragePathForFile(filePath: string): string {
        let safeFileName = this.fileMapping.get(filePath);
        
        if (!safeFileName) {
            safeFileName = FilePathUtils.toSafeFileName(filePath);
            this.fileMapping.set(filePath, safeFileName);
            // 异步保存映射，不阻塞当前操作
            this.saveFileMapping().catch(console.error);
        }

        return `${FilePathUtils.getHighlightsDir(this.vaultPath)}/${safeFileName}`;
    }

    /**
     * 获取文件的所有高亮数据
     * @param filePath 文件路径
     * @returns 高亮数组
     */
    async getFileHighlights(filePath: string): Promise<HiNote[]> {
        const storagePath = this.getStoragePathForFile(filePath);
        
        try {
            const content = await this.app.vault.adapter.read(storagePath);
            const data: OptimizedHighlightData = JSON.parse(content);
            
            // 验证数据格式
            const validation = DataValidator.validateHighlightData(data);
            if (!validation.valid) {
                console.warn(`文件 ${filePath} 的高亮数据验证失败:`, validation.errors);
                return [];
            }

            // 转换为旧格式以保持兼容性
            return Object.entries(data.highlights).map(([id, highlight]) => 
                this.convertToLegacyFormat(id, highlight, filePath)
            );
        } catch (error) {
            // 文件不存在或读取失败
            return [];
        }
    }

    /**
     * 保存文件的高亮数据
     * @param filePath 文件路径
     * @param highlights 高亮数组
     */
    async saveFileHighlights(filePath: string, highlights: HiNote[]): Promise<void> {
        const storagePath = this.getStoragePathForFile(filePath);
        
        // 转换为优化格式
        const optimizedHighlights: { [id: string]: OptimizedHighlight } = {};
        
        for (const highlight of highlights) {
            const optimized = this.convertToOptimizedFormat(highlight);
            optimizedHighlights[highlight.id] = optimized;
        }

        const data: OptimizedHighlightData = {
            version: this.CURRENT_VERSION,
            lastModified: Date.now(),
            highlights: optimizedHighlights
        };

        await this.app.vault.adapter.write(storagePath, JSON.stringify(data, null, 2));
    }

    /**
     * 删除文件的所有高亮数据
     * @param filePath 文件路径
     */
    async deleteFileHighlights(filePath: string): Promise<void> {
        const storagePath = this.getStoragePathForFile(filePath);
        
        try {
            await this.app.vault.adapter.remove(storagePath);
            this.fileMapping.delete(filePath);
            await this.saveFileMapping();
        } catch (error) {
            // 文件可能不存在，忽略错误
        }
    }

    /**
     * 处理文件重命名
     * @param oldPath 旧路径
     * @param newPath 新路径
     */
    async handleFileRename(oldPath: string, newPath: string): Promise<void> {
        const oldStoragePath = this.getStoragePathForFile(oldPath);
        const newStoragePath = this.getStoragePathForFile(newPath);

        try {
            // 检查旧文件是否存在
            const content = await this.app.vault.adapter.read(oldStoragePath);
            
            // 写入新位置
            await this.app.vault.adapter.write(newStoragePath, content);
            
            // 删除旧文件
            await this.app.vault.adapter.remove(oldStoragePath);
            
            // 更新映射
            this.fileMapping.delete(oldPath);
            await this.saveFileMapping();
        } catch (error) {
            // 旧文件可能不存在，忽略错误
        }
    }

    /**
     * 获取所有高亮文件列表
     */
    async getAllHighlightFiles(): Promise<string[]> {
        // 首先从文件映射获取
        const mappedFiles = Array.from(this.fileMapping.keys());
        
        // 如果映射为空，尝试扫描高亮目录
        if (mappedFiles.length === 0) {
            try {
                const highlightsDir = FilePathUtils.getHighlightsDir(this.vaultPath);
                const files = await this.app.vault.adapter.list(highlightsDir);
                
                // 从文件名反推原始路径
                const detectedFiles: string[] = [];
                for (const file of files.files) {
                    if (file.endsWith('.json')) {
                        // 移除.json后缀并转换回原始路径格式
                        const baseName = file.replace(/\.json$/, '').replace(highlightsDir + '/', '');
                        
                        // 尝试从文件内容中获取原始路径信息
                        try {
                            const content = await this.app.vault.adapter.read(file);
                            const data = JSON.parse(content);
                            
                            // 检查是否有高亮数据
                            if (data.highlights && Object.keys(data.highlights).length > 0) {
                                // 通用转换逻辑：将下划线转换为空格
                                const originalPath = baseName.replace(/_/g, ' ');
                                detectedFiles.push(originalPath);
                            }
                        } catch (error) {
                            console.warn(`无法读取高亮文件 ${file}:`, error);
                        }
                    }
                }
                
                // 更新文件映射
                for (const filePath of detectedFiles) {
                    const safeFileName = FilePathUtils.toSafeFileName(filePath);
                    this.fileMapping.set(filePath, safeFileName);
                }
                
                if (detectedFiles.length > 0) {
                    await this.saveFileMapping();
                }
                
                return detectedFiles;
            } catch (error) {
                console.warn('扫描高亮目录失败:', error);
                return [];
            }
        }
        
        return mappedFiles;
    }

    /**
     * 清理孤立的高亮数据
     * @returns 清理统计
     */
    async cleanOrphanedHighlights(): Promise<{ removedFiles: number; totalFiles: number }> {
        const allFiles = await this.getAllHighlightFiles();
        let removedFiles = 0;

        for (const filePath of allFiles) {
            // 检查文件是否还存在于vault中
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                await this.deleteFileHighlights(filePath);
                removedFiles++;
            }
        }

        return { removedFiles, totalFiles: allFiles.length };
    }

    /**
     * 转换为旧格式（保持兼容性）
     */
    private convertToLegacyFormat(id: string, highlight: OptimizedHighlight, filePath: string): HiNote {
        return {
            id,
            text: highlight.text,
            position: highlight.position,
            createdAt: highlight.created,
            updatedAt: highlight.updated,
            filePath,
            backgroundColor: highlight.backgroundColor,
            blockId: highlight.blockId,
            isCloze: highlight.isCloze || false,
            paragraphOffset: highlight.paragraphOffset,
            comments: highlight.comments?.map(comment => ({
                id: comment.id,
                content: comment.content,
                createdAt: comment.created,
                updatedAt: comment.updated
            })) || []
        };
    }

    /**
     * 转换为优化格式
     */
    private convertToOptimizedFormat(highlight: HiNote): OptimizedHighlight {
        const optimized: OptimizedHighlight = {
            text: highlight.text,
            position: highlight.position,
            created: highlight.createdAt,
            updated: highlight.updatedAt
        };

        // 只保存非默认值
        if (highlight.backgroundColor) {
            optimized.backgroundColor = highlight.backgroundColor;
        }
        
        if (highlight.blockId) {
            optimized.blockId = highlight.blockId;
        }
        
        if (highlight.isCloze) {
            optimized.isCloze = highlight.isCloze;
        }
        
        if (highlight.paragraphOffset !== undefined) {
            optimized.paragraphOffset = highlight.paragraphOffset;
        }

        if (highlight.comments && highlight.comments.length > 0) {
            optimized.comments = highlight.comments.map(comment => ({
                id: comment.id,
                content: comment.content,
                created: comment.createdAt,
                updated: comment.updatedAt
            }));
        }

        return optimized;
    }

    /**
     * 获取闪卡数据
     */
    async getFlashcardData(): Promise<FSRSStorage | null> {
        const flashcardPath = `${FilePathUtils.getFlashcardsDir(this.vaultPath)}/cards.json`;
        
        try {
            const content = await this.app.vault.adapter.read(flashcardPath);
            const data = JSON.parse(content);
            
            const validation = DataValidator.validateFlashcardData(data);
            if (!validation.valid) {
                console.warn('闪卡数据验证失败:', validation.errors);
                return null;
            }

            return data;
        } catch (error) {
            return null;
        }
    }

    /**
     * 保存闪卡数据
     */
    async saveFlashcardData(data: FSRSStorage): Promise<void> {
        const flashcardPath = `${FilePathUtils.getFlashcardsDir(this.vaultPath)}/cards.json`;
        await this.app.vault.adapter.write(flashcardPath, JSON.stringify(data, null, 2));
    }
}

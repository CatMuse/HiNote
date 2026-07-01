import { App } from 'obsidian';
import { HighlightInfo as HiNote } from '../types/highlight';
import { FSRSStorage } from '../flashcard';
import { DataValidator } from './DataValidator';
import {
    convertToLegacyHighlight,
    convertToOptimizedHighlight,
    OptimizedHighlight,
    OptimizedHighlightData
} from './HighlightDataFormat';
import { FileMappingStore } from './FileMappingStore';
import {
    detectHighlightFilesFromStorage,
    ensureHiNoteDirectoryStructure
} from './HiNoteStorageLayout';
import { FlashcardDataStore } from './FlashcardDataStore';
import { FilePathUtils } from './FilePathUtils';

/**
 * HiNote数据管理器 - 存储层（已重构）
 * 职责：
 * 1. 纯粹的文件系统操作
 * 2. 数据序列化/反序列化
 * 3. 文件路径映射管理
 * 4. 不包含业务逻辑
 */
export class HiNoteDataManager {
    private app: App;
    private vaultPath: string;
    private fileMappingStore: FileMappingStore;
    private flashcardDataStore: FlashcardDataStore;
    private readonly CURRENT_VERSION = '2.0';

    constructor(app: App) {
        this.app = app;
        // 对于Obsidian，我们直接使用相对路径，不需要获取绝对路径
        this.vaultPath = '';
        this.fileMappingStore = new FileMappingStore(app, this.vaultPath, this.CURRENT_VERSION);
        this.flashcardDataStore = new FlashcardDataStore(app, this.vaultPath);
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
        await ensureHiNoteDirectoryStructure(this.app, this.vaultPath);
    }

    /**
     * 加载文件映射
     */
    private async loadFileMapping(): Promise<void> {
        await this.fileMappingStore.load();
    }

    /**
     * 保存文件映射
     */
    private async saveFileMapping(): Promise<void> {
        await this.fileMappingStore.save();
    }

    /**
     * 获取文件的安全存储路径
     */
    private getStoragePathForFile(filePath: string): string {
        return this.fileMappingStore.getStoragePathForFile(filePath);
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
                convertToLegacyHighlight(id, highlight, filePath)
            );
        } catch {
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
            if (!highlight.id) continue; // 跳过没有 ID 的高亮
            const optimized = convertToOptimizedHighlight(highlight);
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
            this.fileMappingStore.delete(filePath);
            await this.saveFileMapping();
        } catch {
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
        const newSafeFileName = FilePathUtils.toSafeFileName(newPath);
        const newStoragePath = `${FilePathUtils.getHighlightsDir(this.vaultPath)}/${newSafeFileName}`;

        try {
            // 检查旧文件是否存在
            const content = await this.app.vault.adapter.read(oldStoragePath);
            
            // 写入新位置
            await this.app.vault.adapter.write(newStoragePath, content);
            
            // 删除旧文件
            if (oldStoragePath !== newStoragePath) {
                await this.app.vault.adapter.remove(oldStoragePath);
            }
            
            // 更新映射
            this.fileMappingStore.delete(oldPath);
            this.fileMappingStore.set(newPath, newSafeFileName);
            await this.saveFileMapping();
        } catch {
            // 旧文件可能不存在，确保旧路径不会继续指向不存在的数据
            this.fileMappingStore.delete(oldPath);
            await this.saveFileMapping();
        }
    }

    /**
     * 获取所有高亮文件列表
     */
    async getAllHighlightFiles(): Promise<string[]> {
        // 首先从文件映射获取
        const mappedFiles = this.fileMappingStore.getMappedFiles();
        
        // 如果映射为空，尝试扫描高亮目录
        if (mappedFiles.length === 0) {
            const detectedFiles = await detectHighlightFilesFromStorage(
                this.app,
                this.vaultPath,
                (originalPath, baseName) => {
                    this.fileMappingStore.set(originalPath, baseName);
                }
            );
                
            if (detectedFiles.length > 0) {
                this.saveFileMapping().catch(err =>
                    console.warn('保存文件映射失败:', err)
                );
            }

            return detectedFiles;
        }
        
        return mappedFiles;
    }


    /**
     * 获取闪卡数据
     */
    async getFlashcardData(): Promise<FSRSStorage | null> {
        return this.flashcardDataStore.load();
    }

    /**
     * 保存闪卡数据
     */
    async saveFlashcardData(data: FSRSStorage): Promise<void> {
        await this.flashcardDataStore.save(data);
    }
}

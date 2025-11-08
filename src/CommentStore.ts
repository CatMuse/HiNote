import { Plugin, TFile, MarkdownView, Editor, App } from "obsidian";
import { BlockIdService } from './services/BlockIdService';
import { IdGenerator } from './utils/IdGenerator'; // 导入 IdGenerator
import { HiNoteDataManager } from './storage/HiNoteDataManager';
import { DataMigrationManager } from './storage/DataMigrationManager';

export interface CommentItem {
    id: string;           // 评论的唯一ID
    content: string;      // 评论内容
    createdAt: number;    // 创建时间
    updatedAt: number;    // 最后更新时间
}

export interface HiNote {
    id: string;           
    text: string;         
    position: number;     
    paragraphId?: string;  // 兼容旧数据，将被 blockId 替代
    blockId?: string;     // 新增：纯 BlockID，不包含文件路径
    comments: CommentItem[];  
    createdAt: number;    
    updatedAt: number;    
    isVirtual?: boolean;  // 新增：是否是虚拟高亮
    filePath?: string;    // 新增：文件路径
    fileType?: string;    // 新增：文件类型
    displayText?: string; // 新增：显示文本
    paragraphOffset?: number; // 新增：段落偏移量
    backgroundColor?: string; // 新增：背景颜色
    isCloze?: boolean;    // 新增：标记是否为挖空格式
}


import { EventManager } from './services/EventManager';
import { HighlightService } from './services/HighlightService';

export class CommentStore {
    private plugin: Plugin;
    private comments: Map<string, HiNote[]> = new Map();
    private eventManager: EventManager;
    private blockIdService: BlockIdService;
    private highlightService: HighlightService;
    
    // 存储层
    private dataManager: HiNoteDataManager;
    private migrationManager: DataMigrationManager;

    constructor(
        plugin: Plugin,
        eventManager: EventManager,
        dataManager: HiNoteDataManager,
        highlightService: HighlightService
    ) {
        this.plugin = plugin;
        // 使用传入的共享实例，不再创建新实例
        this.eventManager = eventManager;
        this.blockIdService = new BlockIdService(plugin.app);
        this.highlightService = highlightService;
        
        // 使用传入的共享数据管理器实例
        this.dataManager = dataManager;
        this.migrationManager = new DataMigrationManager(plugin, this.dataManager);
    }

    async loadComments() {
        // 检查是否需要数据迁移
        const needsMigration = await this.migrationManager.needsMigration();
        
        if (needsMigration) {
            console.log('[HiNote] 检测到旧数据，开始自动迁移...');
            try {
                const stats = await this.migrationManager.migrate();
                console.log('[HiNote] 数据迁移成功:', stats);
            } catch (error) {
                console.error('[HiNote] 数据迁移失败:', error);
                throw new Error('数据迁移失败，请查看控制台错误信息');
            }
        }
        
        // 初始化并使用新存储层
        await this.dataManager.initialize();
        await this.loadCommentsFromNewStorage();
    }
    
    /**
     * 从新存储层加载数据
     */
    private async loadCommentsFromNewStorage() {
        this.comments = new Map();
        
        const highlightFiles = await this.dataManager.getAllHighlightFiles();
        
        for (const filePath of highlightFiles) {
            const highlights = await this.dataManager.getFileHighlights(filePath);
            if (highlights.length > 0) {
                this.comments.set(filePath, highlights);
            }
        }
    }
    

    async saveComments() {
        // 使用新存储层保存
        for (const [filePath, highlights] of this.comments.entries()) {
            await this.dataManager.saveFileHighlights(filePath, highlights);
        }
    }
    
    /**
     * 检查孤立数据数量
     * 检查所有存储的高亮和评论，统计那些在文档中找不到对应高亮文本的孤立数据数量
     * @returns 孤立数据数量
     */
    async checkOrphanedDataCount(): Promise<{orphanedHighlights: number, affectedFiles: number}> {
        let orphanedHighlights = 0;
        let affectedFiles = new Set<string>();
        
        // 遍历所有文件的高亮数据
        for (const [filePath, highlights] of this.comments.entries()) {
            // 尝试获取文件
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                // 如果文件不存在，计算整个文件的数据
                affectedFiles.add(filePath);
                orphanedHighlights += highlights.length;
                continue;
            }
            
            try {
                // 读取文件内容
                const content = await this.plugin.app.vault.read(file);
                
                // 提取文件中的高亮
                const extractedHighlights = this.highlightService.extractHighlights(content, file);
                const extractedTexts = new Set(extractedHighlights.map(h => h.text));
                
                let fileHasOrphans = false;
                
                // 检查每个存储的高亮是否在文件中存在
                for (const highlight of highlights) {
                    // 如果高亮是虚拟的，跳过它
                    if (highlight.isVirtual) continue;
                    
                    // 检查高亮文本是否在提取的高亮中
                    if (!extractedTexts.has(highlight.text)) {
                        // 高亮文本不在文件中
                        orphanedHighlights++;
                        fileHasOrphans = true;
                    }
                }
                
                // 如果文件有孤立数据，添加到受影响文件列表
                if (fileHasOrphans) {
                    affectedFiles.add(filePath);
                }
            } catch (error) {
                // 错误处理 - 已移除日志输出
            }
        }
        
        return { orphanedHighlights, affectedFiles: affectedFiles.size };
    }
    
    /**
     * 清理孤立数据
     * 检查所有存储的高亮和评论，移除那些在文档中找不到对应高亮文本的孤立数据
     * @returns 清理的数据数量
     */
    async cleanOrphanedData(): Promise<{removedHighlights: number, affectedFiles: number}> {
        let removedHighlights = 0;
        let affectedFiles = new Set<string>();
        
        // 遍历所有文件的高亮数据
        for (const [filePath, highlights] of this.comments.entries()) {
            // 尝试获取文件
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                // 如果文件不存在，移除整个文件的数据
                this.comments.delete(filePath);
                affectedFiles.add(filePath);
                removedHighlights += highlights.length;
                continue;
            }
            
            try {
                // 读取文件内容
                const content = await this.plugin.app.vault.read(file);
                
                // 提取文件中的高亮
                const extractedHighlights = this.highlightService.extractHighlights(content, file);
                const extractedTexts = new Set(extractedHighlights.map(h => h.text));
                
                // 过滤出仍然存在的高亮
                const validHighlights = highlights.filter(highlight => {
                    // 如果高亮是虚拟的，保留它
                    if (highlight.isVirtual) return true;
                    
                    // 检查高亮文本是否在提取的高亮中
                    return extractedTexts.has(highlight.text);
                });
                
                // 如果有高亮被移除
                if (validHighlights.length < highlights.length) {
                    removedHighlights += highlights.length - validHighlights.length;
                    affectedFiles.add(filePath);
                    
                    if (validHighlights.length === 0) {
                        // 如果文件中没有高亮了，移除整个文件的数据
                        this.comments.delete(filePath);
                    } else {
                        // 更新文件的高亮列表
                        this.comments.set(filePath, validHighlights);
                    }
                }
            } catch (error) {
                // 错误处理 - 已移除日志输出
            }
        }
        
        // 保存更新后的数据
        if (removedHighlights > 0) {
            await this.saveComments();
        }
        
        return { removedHighlights, affectedFiles: affectedFiles.size };
    }

    /**
     * 处理文件重命名事件，更新相关的评论数据
     * @param oldPath 文件的原路径
     * @param newPath 文件的新路径
     */
    async updateFilePath(oldPath: string, newPath: string) {
        // 使用新存储层处理文件重命名
        await this.dataManager.handleFileRename(oldPath, newPath);
        
        // 更新内存中的数据
        const oldPathComments = this.comments.get(oldPath) || [];
        // 更新文件路径字段
        oldPathComments.forEach(comment => {
            comment.filePath = newPath;
        });
        this.comments.set(newPath, oldPathComments);
        this.comments.delete(oldPath);
    }

    /**
     * 获取高亮的评论
     * @param highlight 高亮信息
     * @returns 评论数组
     */
    getHiNotes(highlight: { text: string; position?: number }): HiNote[] {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return [];

        const fileHighlights = this.comments.get(activeFile.path) || [];
        
        // 使用更宽松的匹配策略
        return fileHighlights.filter(c => {
            // 1. 精确文本匹配
            const textMatch = c.text === highlight.text;
            if (textMatch) {
                // 如果文本匹配，检查位置是否也接近
                if (typeof c.position === 'number' && typeof highlight.position === 'number') {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return true;
            }
            
            // 2. 如果文本不匹配，尝试位置匹配（允许文本有变化）
            if (typeof c.position === 'number' && typeof highlight.position === 'number') {
                // 位置接近（容差 30 字符），认为是同一个高亮
                return Math.abs(c.position - highlight.position) < 30;
            }
            
            return false;
        });
    }
    
    /**
     * 获取文件中的所有高亮
     * @param file 文件
     * @returns 高亮数组
     */
    getFileComments(file: TFile): HiNote[] {
        if (!file) return [];
        
        // 从 comments Map 中获取文件的高亮
        return this.comments.get(file.path) || [];
    }

    /**
     * 添加或更新高亮批注
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 添加的高亮
     */
    async addComment(file: TFile, highlight: HiNote): Promise<HiNote> {
        // 确保 highlight 有一个唯一的 ID
        if (!highlight.id) {
            // 使用统一的ID生成策略
            highlight.id = IdGenerator.generateHighlightId(
                file.path, 
                highlight.position || 0, 
                highlight.text
            );
        }
        
        // 设置或更新时间戳
        const now = Date.now();
        if (!highlight.createdAt) {
            highlight.createdAt = now;
        }
        highlight.updatedAt = now;
        
        // 更新内存中的评论映射
        const filePath = file.path;
        if (!this.comments.has(filePath)) {
            this.comments.set(filePath, []);
        }
        
        const fileHighlights = this.comments.get(filePath) || [];
        const existingIndex = fileHighlights.findIndex(h => h.id === highlight.id);
        
        if (existingIndex >= 0) {
            fileHighlights[existingIndex] = highlight;
        } else {
            fileHighlights.push(highlight);
        }
        
        // 保存更改
        await this.saveComments();
        
        // 触发事件通知
        if (this.eventManager) {
            // 如果有评论，触发评论更新事件
            if (highlight.comments && highlight.comments.length > 0) {
                const latestComment = highlight.comments[highlight.comments.length - 1];
                this.eventManager.emitCommentUpdate(filePath, highlight.text, latestComment.content, highlight.id);
            } else {
                // 否则触发高亮更新事件
                this.eventManager.emitHighlightUpdate(filePath, highlight.text, highlight.text, highlight.id);
            }
        }
        
        return highlight;
    }

    /**
     * 移除高亮批注
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 是否成功移除
     */
    async removeComment(file: TFile, highlight: HiNote): Promise<boolean> {
        const filePath = file.path;
        
        // 检查文件路径和高亮 ID是否存在
        if (!this.comments.has(filePath)) {
            return false;
        }
        
        const fileHighlights = this.comments.get(filePath) || [];
        const highlightExists = fileHighlights.some(h => h.id === highlight.id);
        
        if (!highlightExists) {
            return false;
        }
        
        // 更新内存中的评论映射
        const updatedHighlights = fileHighlights.filter(h => h.id !== highlight.id);
        
        if (updatedHighlights.length > 0) {
            this.comments.set(filePath, updatedHighlights);
            // 保存更改
            await this.saveComments();
        } else {
            // 如果文件没有高亮了，删除整个文件的数据
            this.comments.delete(filePath);
            // 删除对应的 JSON 文件
            await this.dataManager.deleteFileHighlights(filePath);
        }
        
        // 触发事件通知
        if (this.eventManager) {
            // 如果有评论，触发评论删除事件
            if (highlight.comments && highlight.comments.length > 0) {
                const latestComment = highlight.comments[highlight.comments.length - 1];
                this.eventManager.emitCommentDelete(filePath, latestComment.content, highlight.id);
            } else {
                // 否则触发高亮删除事件
                this.eventManager.emitHighlightDelete(filePath, highlight.text, highlight.id);
            }
        }
        
        return true;
    }

    /**
     * 添加挖空格式的高亮（无需批注）
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 添加的高亮
     */
    /**
     * 根据 blockId 获取评论
     * @param file 文件
     * @param blockId 块ID
     * @returns 与该 blockId 相关的高亮数组
     */
    getCommentsByBlockId(file: TFile, blockId: string): HiNote[] {
        if (!file || !blockId) return [];
        
        const filePath = file.path;
        
        // 从 comments Map 中获取文件的高亮
        const fileHighlights = this.comments.get(filePath) || [];
        
        // 过滤出与指定 blockId 相关的高亮
        return fileHighlights.filter(highlight => highlight.blockId === blockId);
    }

    // addHighlightWithCloze 方法已移除，现在使用 Create HiCard 按钮手动创建闪卡
}

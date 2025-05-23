import { Plugin, TFile, MarkdownView, Editor, App } from "obsidian";
import { BlockIdService } from './services/BlockIdService';
import { IdGenerator } from './utils/IdGenerator'; // 导入 IdGenerator

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

export interface FileComments {
    [highlightId: string]: HiNote;
}

export interface CommentsData {
    [filePath: string]: FileComments;
}

import { EventManager } from './services/EventManager';
import { HighlightService } from './services/HighlightService';

export class CommentStore {
    private plugin: Plugin;
    private data: CommentsData = {};
    private comments: Map<string, HiNote[]> = new Map();
    private eventManager: EventManager;
    private blockIdService: BlockIdService;
    private highlightService: HighlightService;
    private commentCache: Map<string, HiNote[]> = new Map();
    private maxCacheSize: number = 100;
    private readonly PERFORMANCE_THRESHOLD = 100; // 毫秒

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.eventManager = new EventManager(plugin.app);
        this.blockIdService = new BlockIdService(plugin.app);
        this.highlightService = new HighlightService(plugin.app);
    }

    async loadComments() {
        const data = await this.plugin.loadData();

        this.data = data?.comments || {};

        // 数据迁移：将 paragraphId 转换为 blockId
        this.migrateDataToBlockId();

        // 将 data 转换为正确的格式
        this.comments = new Map(
            Object.entries(this.data).map(([key, value]) => [
                key,
                Object.values(value as { [key: string]: HiNote })
            ])
        );
    }

    /**
     * 数据迁移：将 paragraphId 转换为 blockId
     */
    private migrateDataToBlockId() {
        let migrationCount = 0;
        
        // 遍历所有文件的高亮
        for (const filePath in this.data) {
            const fileHighlights = this.data[filePath];
            
            // 遍历文件中的所有高亮
            for (const highlightId in fileHighlights) {
                const highlight = fileHighlights[highlightId];
                
                // 如果有 paragraphId 但没有 blockId
                if (highlight.paragraphId && !highlight.blockId) {
                    // 从 paragraphId 中提取纯 BlockID
                    // 使用与 BlockIdService 一致的正则表达式
                    const blockIdMatch = highlight.paragraphId.match(/#\^([a-zA-Z0-9-]+)/);
                    if (blockIdMatch && blockIdMatch[1]) {
                        // 设置 blockId
                        highlight.blockId = blockIdMatch[1];
                        migrationCount++;
                    }
                }
            }
        }
        
        // 已删除不必要的日志输出
    }

    async saveComments() {
        // 先加载当前的数据
        const currentData = await this.plugin.loadData() || {};

        const dataToSave = {
            ...currentData,  // 保持其他设置不变
            comments: this.data
            // fileComments 字段已移除
        };

        // 更新评论数据，保持其他数据不变
        await this.plugin.saveData(dataToSave);

        // 验证数据是否成功保存
        const verifyData = await this.plugin.loadData();
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
        for (const filePath in this.data) {
            // 尝试获取文件
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                // 如果文件不存在，计算整个文件的数据
                affectedFiles.add(filePath);
                orphanedHighlights += Object.keys(this.data[filePath] || {}).length;
                continue;
            }
            
            try {
                // 读取文件内容
                const content = await this.plugin.app.vault.read(file);
                
                // 提取文件中的高亮
                const extractedHighlights = this.highlightService.extractHighlights(content, file);
                const extractedTexts = new Set(extractedHighlights.map(h => h.text));
                
                // 获取存储的高亮
                const storedHighlights = this.data[filePath] || {};
                let fileHasOrphans = false;
                
                // 检查每个存储的高亮是否在文件中存在
                for (const highlightId in storedHighlights) {
                    const highlight = storedHighlights[highlightId];
                    
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
        for (const filePath in this.data) {
            // 尝试获取文件
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                // 如果文件不存在，移除整个文件的数据
                delete this.data[filePath];
                this.comments.delete(filePath);
                affectedFiles.add(filePath);
                removedHighlights += Object.keys(this.data[filePath] || {}).length;
                continue;
            }
            
            try {
                // 读取文件内容
                const content = await this.plugin.app.vault.read(file);
                
                // 提取文件中的高亮
                const extractedHighlights = this.highlightService.extractHighlights(content, file);
                const extractedTexts = new Set(extractedHighlights.map(h => h.text));
                
                // 获取存储的高亮
                const storedHighlights = this.data[filePath] || {};
                let fileModified = false;
                
                // 检查每个存储的高亮是否在文件中存在
                for (const highlightId in storedHighlights) {
                    const highlight = storedHighlights[highlightId];
                    
                    // 如果高亮是虚拟的，保留它
                    if (highlight.isVirtual) continue;
                    
                    // 检查高亮文本是否在提取的高亮中
                    if (!extractedTexts.has(highlight.text)) {
                        // 高亮文本不在文件中，移除它
                        delete storedHighlights[highlightId];
                        removedHighlights++;
                        fileModified = true;
                    }
                }
                
                // 如果文件被修改，更新 comments Map
                if (fileModified) {
                    affectedFiles.add(filePath);
                    this.comments.set(filePath, Object.values(storedHighlights));
                    
                    // 如果文件中没有高亮了，移除整个文件的数据
                    if (Object.keys(storedHighlights).length === 0) {
                        delete this.data[filePath];
                        this.comments.delete(filePath);
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
        if (this.data[oldPath]) {
            this.data[newPath] = this.data[oldPath];
            delete this.data[oldPath];
        }

        // 更新评论中的文件路径
        const oldPathComments = this.comments.get(oldPath) || [];
        this.comments.set(newPath, oldPathComments);
        this.comments.delete(oldPath);

        // 保存更新后的数据
        await this.saveComments();
    }

    /**
     * 获取高亮的评论
     * @param highlight 高亮信息
     * @returns 评论数组
     */
    getHiNotes(highlight: { text: string; position?: number }): HiNote[] {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return [];

        const fileComments = this.data[activeFile.path] || {};
        return Object.values(fileComments).filter(c => {
            const textMatch = c.text === highlight.text;
            // 如果存储的评论没有 position，则不进行位置匹配
            if (textMatch && typeof c.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(c.position - highlight.position) < 1000;
            }
            return textMatch;
        });
    }
    
    /**
     * 获取文件中的所有高亮
     * @param file 文件
     * @returns 高亮数组
     */
    getFileComments(file: TFile): HiNote[] {
        if (!file) return [];
        
        // 从数据中获取文件的高亮
        const fileHighlights = this.data[file.path] || {};
        return Object.values(fileHighlights);
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
        
        // 确保文件路径存在于数据结构中
        const filePath = file.path;
        if (!this.data[filePath]) {
            this.data[filePath] = {};
        }
        
        // 添加或更新高亮到数据中
        this.data[filePath][highlight.id] = highlight;
        
        // 更新内存中的评论映射
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
        
        // 检查文件路径和高亮ID是否存在
        if (!this.data[filePath] || !this.data[filePath][highlight.id]) {
            return false;
        }
        
        // 从数据中删除高亮
        delete this.data[filePath][highlight.id];
        
        // 如果文件没有高亮了，删除整个文件条目
        if (Object.keys(this.data[filePath]).length === 0) {
            delete this.data[filePath];
        }
        
        // 更新内存中的评论映射
        if (this.comments.has(filePath)) {
            const fileHighlights = this.comments.get(filePath) || [];
            const updatedHighlights = fileHighlights.filter(h => h.id !== highlight.id);
            
            if (updatedHighlights.length > 0) {
                this.comments.set(filePath, updatedHighlights);
            } else {
                this.comments.delete(filePath);
            }
        }
        
        // 保存更改
        await this.saveComments();
        
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
        
        // 如果文件路径不存在于数据中，返回空数组
        if (!this.data[filePath]) return [];
        
        // 获取文件中的所有高亮
        const fileHighlights = Object.values(this.data[filePath]);
        
        // 过滤出与指定 blockId 相关的高亮
        return fileHighlights.filter(highlight => highlight.blockId === blockId);
    }

    // addHighlightWithCloze 方法已移除，现在使用 Create HiCard 按钮手动创建闪卡
}

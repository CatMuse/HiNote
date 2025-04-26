import { Plugin, TFile, MarkdownView, Editor, App } from "obsidian";
import { BlockIdService } from './services/BlockIdService';

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

export interface FileComment {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    filePath: string;
}

export interface FileComments {
    [highlightId: string]: HiNote;
}

export interface CommentsData {
    [filePath: string]: FileComments;
}

export interface FileCommentsData {
    [filePath: string]: FileComment[];
}

import { EventManager } from './services/EventManager';
import { HighlightService } from './services/HighlightService';

export class CommentStore {
    private plugin: Plugin;
    private data: CommentsData = {};
    private fileCommentsData: FileCommentsData = {};
    private comments: Map<string, HiNote[]> = new Map();
    private fileComments: Map<string, FileComment[]> = new Map();
    private eventManager: EventManager;
    private blockIdService: BlockIdService;
    private highlightService: HighlightService;
    private commentCache: Map<string, HiNote[]> = new Map();
    private maxCacheSize: number = 100;
    private readonly PERFORMANCE_THRESHOLD = 100; // 毫秒
    private readonly CLOZE_PATTERN = /\{\{([^{}]+)\}\}/; // 挖空格式的正则表达式

    constructor(plugin: Plugin) {
        this.plugin = plugin;
        this.eventManager = new EventManager(plugin.app);
        this.blockIdService = new BlockIdService(plugin.app);
        this.highlightService = new HighlightService(plugin.app);
    }

    async loadComments() {
        const data = await this.plugin.loadData();

        this.data = data?.comments || {};
        this.fileCommentsData = data?.fileComments || {};

        // 数据迁移：将 paragraphId 转换为 blockId
        this.migrateDataToBlockId();

        // 将 data 转换为正确的格式
        this.comments = new Map(
            Object.entries(this.data).map(([key, value]) => [
                key,
                Object.values(value as { [key: string]: HiNote })
            ])
        );

        this.fileComments = new Map(Object.entries(this.fileCommentsData));
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
            comments: this.data,
            fileComments: Object.fromEntries(this.fileComments)
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
    async handleFileRename(oldPath: string, newPath: string) {
        // 更新高亮评论
        if (this.data[oldPath]) {
            this.data[newPath] = this.data[oldPath];
            delete this.data[oldPath];

            // 更新缓存
            const cachedComments = this.commentCache.get(oldPath);
            if (cachedComments) {
                this.commentCache.delete(oldPath);
                this.commentCache.set(newPath, cachedComments);
            }
        }

        // 更新普通文件评论
        const fileComments = this.fileComments.get(oldPath);
        if (fileComments) {
            this.fileComments.delete(oldPath);
            this.fileComments.set(newPath, fileComments);
        }

        // 更新comments Map
        const commentsForFile = this.comments.get(oldPath);
        if (commentsForFile) {
            this.comments.delete(oldPath);
            this.comments.set(newPath, commentsForFile);
        }

        // 保存更新后的数据
        await this.saveComments();
    }

    getFileComments(file: TFile): HiNote[] {
        const comments = this.data[file.path] || {};
        // 修改排序逻辑，虚拟高亮始终在最前面
        return Object.values(comments).sort((a, b) => {
            const aIsVirtual = 'isVirtual' in a ? a.isVirtual : false;
            const bIsVirtual = 'isVirtual' in b ? b.isVirtual : false;
            if (aIsVirtual && !bIsVirtual) return -1;
            if (!aIsVirtual && bIsVirtual) return 1;
            return a.position - b.position;
        });
    }

    getFileOnlyComments(file: TFile): FileComment[] {
        return this.fileComments.get(file.path) || [];
    }

    async addComment(file: TFile, highlight: HiNote) {
        if (!highlight.id) {
            throw new Error("Highlight ID is required");
        }
        
        if (!this.data[file.path]) {
            this.data[file.path] = {};
        }
        
        // 如果是虚拟高亮，直接使用已有的 paragraphId
        if ('isVirtual' in highlight && highlight.isVirtual) {
            this.data[file.path][highlight.id] = highlight;
            await this.saveComments();
            return;
        }

        // 只确保 highlight 包含 blockId，不再设置 paragraphId
        if (!highlight.blockId) {
            const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            const editor = view?.editor;
            const currentFile = view?.file;
            
            if (editor && currentFile && typeof highlight.position === 'number') {
                try {
                    // 使用 BlockIdService 创建或获取 Block ID
                    const pos = editor.offsetToPos(highlight.position);
                    const blockId = this.blockIdService.getOrCreateBlockId(editor, pos.line);
                    
                    // 只设置 blockId
                    highlight.blockId = blockId;
                    
                    // 确保更改被保存
                    const content = editor.getValue();
                    await this.plugin.app.vault.modify(currentFile, content);
                } catch (error) {
                    // 错误处理 - 已移除日志输出
                    // 如果出错，使用时间戳作为后备
                    const fallbackId = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
                    highlight.blockId = fallbackId;
                }
            } else {
                // 如果无法获取编辑器或文件，使用时间戳作为后备
                const fallbackId = Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 5);
                highlight.blockId = fallbackId;
            }
        }
        
        // 如果有 paragraphId 但没有 blockId，从 paragraphId 提取 blockId
        if (highlight.paragraphId && !highlight.blockId) {
            const blockIdMatch = highlight.paragraphId.match(/#\^([a-zA-Z0-9-]+)/);
            if (blockIdMatch && blockIdMatch[1]) {
                highlight.blockId = blockIdMatch[1];
            }
        }

        this.data[file.path][highlight.id] = highlight;
        await this.saveComments();
    }

    async addFileComment(file: TFile, content: string): Promise<FileComment> {
        const fileComment: FileComment = {
            id: `file-comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            content,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            filePath: file.path
        };

        const comments = this.fileComments.get(file.path) || [];
        comments.push(fileComment);
        this.fileComments.set(file.path, comments);

        await this.saveComments();
        return fileComment;
    }

    async updateComment(file: TFile, highlightId: string, commentContent: string) {
        if (this.data[file.path]?.[highlightId]) {
            const highlight = this.data[file.path][highlightId];
            // 创建新的评论
            const newComment: CommentItem = {
                id: `comment-${Date.now()}`,
                content: commentContent,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            // 初化评论数组（如果不存在）
            if (!highlight.comments) {
                highlight.comments = [];
            }
            
            // 添加新评论
            highlight.comments.push(newComment);
            highlight.updatedAt = Date.now();
            await this.saveComments();
        }
    }

    async updateFileComment(file: TFile, commentId: string, content: string): Promise<void> {
        const comments = this.fileComments.get(file.path) || [];
        const comment = comments.find(c => c.id === commentId);
        if (comment) {
            comment.content = content;
            comment.updatedAt = Date.now();
            await this.saveComments();
        }
    }

    async removeComment(file: TFile, highlight: HiNote) {
        const filePath = file.path;
        if (this.data[filePath]?.[highlight.id]) {
            delete this.data[filePath][highlight.id];
            if (Object.keys(this.data[filePath]).length === 0) {
                delete this.data[filePath];
            }
            await this.saveComments();
        }
    }

    async deleteFileComment(file: TFile, commentId: string): Promise<void> {
        const comments = this.fileComments.get(file.path) || [];
        const index = comments.findIndex(c => c.id === commentId);
        if (index !== -1) {
            comments.splice(index, 1);
            if (comments.length === 0) {
                this.fileComments.delete(file.path);
            } else {
                this.fileComments.set(file.path, comments);
            }
            await this.saveComments();
        }
    }

    // 清理不存在的文件的评论
    async cleanupComments(existingFiles: Set<string>) {
        let changed = false;
        for (const filePath of Object.keys(this.data)) {
            if (!existingFiles.has(filePath)) {
                delete this.data[filePath];
                changed = true;
            }
        }
        for (const filePath of Object.keys(this.fileCommentsData)) {
            if (!existingFiles.has(filePath)) {
                delete this.fileCommentsData[filePath];
                changed = true;
            }
        }
        if (changed) {
            await this.saveComments();
        }
    }

    // 只加载可视区域的评论
    loadVisibleComments(visibleParagraphIds: string[]) {
        const currentFile = this.plugin.app.workspace.getActiveFile();
        if (!currentFile) return;

        visibleParagraphIds.forEach(paragraphId => {
            const comments = this.getCommentsByParagraphId(currentFile, paragraphId);
            this.commentCache.set(paragraphId, comments);
        });

        this.pruneCache();
    }

    private pruneCache() {
        if (this.commentCache.size > this.maxCacheSize) {
            // 删除最早/最少使用的缓存
            const entriesToDelete = Array.from(this.commentCache.keys())
                .slice(0, this.commentCache.size - this.maxCacheSize);
            entriesToDelete.forEach(key => this.commentCache.delete(key));
        }
    }

    // 批量更新评论
    batchUpdateComments(updates: Array<{id: string, comment: HiNote}>) {
        const batch = new Map<string, HiNote[]>();
        updates.forEach(({id, comment}) => {
            if (!batch.has(id)) {
                batch.set(id, []);
            }
            batch.get(id)?.push(comment);
        });
        
        batch.forEach((comments, id) => {
            this.comments.set(id, comments);
        });
    }

    private checkPerformance(operation: () => void) {
        const start = performance.now();
        operation();
        const duration = performance.now() - start;
        
        if (duration > this.PERFORMANCE_THRESHOLD) {

        }
    }

    // 根据段落ID获取评论
    getCommentsByParagraphId(file: TFile, paragraphId: string): HiNote[] {
        const fileComments = this.data[file.path] || {};
        return Object.values(fileComments).filter(
            highlight => highlight.paragraphId === paragraphId
        ).sort((a, b) => a.position - b.position);
    }

    // 根据 Block ID 获取评论
    getCommentsByBlockId(file: TFile, blockId: string): HiNote[] {
        const fileComments = this.data[file.path] || {};
        return Object.values(fileComments).filter(
            highlight => highlight.blockId === blockId
        ).sort((a, b) => a.position - b.position);
    }

    // 检查段落是否有评论
    hasParagraphComments(file: TFile, paragraphId: string): boolean {
        const comments = this.getCommentsByParagraphId(file, paragraphId);
        return comments.length > 0;
    }
    
    // 检查指定 Block ID 是否有评论
    hasBlockComments(file: TFile, blockId: string): boolean {
        const comments = this.getCommentsByBlockId(file, blockId);
        return comments.length > 0;
    }

    async clearAllComments() {
        this.data = {};
        this.fileCommentsData = {};
        await this.saveComments();
    }

    // 获取或生成 block ID
    private getBlockId(editor: Editor, line: number): string {
        return this.blockIdService.getOrCreateBlockId(editor, line);
    }

    /**
     * 获取高亮的评论
     * @param highlight 高亮信息
     * @returns 评论数组
     */
    getHiNotes(highlight: { text: string; position?: number }): HiNote[] {
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (!activeFile) return [];

        const fileComments = this.getFileComments(activeFile);
        return fileComments.filter(c => {
            const textMatch = c.text === highlight.text;
            // 如果存储的评论没有 position，则不进行位置匹配
            if (textMatch && typeof c.position === 'number' && typeof highlight.position === 'number') {
                return Math.abs(c.position - highlight.position) < 1000;
            }
            return textMatch;
        });
    }
    
    /**
     * 添加挖空格式的高亮（无需批注）
     * @param file 文件
     * @param highlight 高亮信息
     * @returns 添加的高亮
     */
    addHighlightWithCloze(file: TFile, highlight: HiNote): HiNote | null {
        // 检查是否为挖空格式
        if (!this.CLOZE_PATTERN.test(highlight.text)) {
            return null; // 不是挖空格式，直接返回
        }
        
        // 检查是否已存在相同内容和位置的高亮
        const filePath = file.path;
        if (this.data[filePath]) {
            const existingHighlights = Object.values(this.data[filePath]);
            const duplicateHighlight = existingHighlights.find(h => 
                h.text === highlight.text && 
                Math.abs(h.position - highlight.position) < 10 && // 位置接近视为相同
                h.isCloze === true
            );
            
            if (duplicateHighlight) {
                // 如果已存在相同高亮，直接返回现有的高亮
                return duplicateHighlight;
            }
        }
        
        // 确保 highlight 有一个唯一的 ID
        if (!highlight.id) {
            highlight.id = `highlight-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }
        
        // 设置创建和更新时间
        const now = Date.now();
        highlight.createdAt = now;
        highlight.updatedAt = now;
        
        // 设置 isCloze 标记
        highlight.isCloze = true;
        
        // 确保文件路径存在
        if (!this.data[filePath]) {
            this.data[filePath] = {};
        }
        
        // 添加高亮到数据中
        this.data[filePath][highlight.id] = highlight;
        
        // 更新缓存
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
        
        // 保存数据
        this.saveComments();
        
        // 触发事件通知
        // 使用类型断言访问 eventManager
        (this.plugin as any).eventManager?.emitHighlightChanged();
        
        return highlight;
    }
}
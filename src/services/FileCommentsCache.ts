import { App, TFile } from 'obsidian';
import { CommentStore, HiNote } from '../CommentStore';

/**
 * 文件评论缓存服务
 * 避免重复遍历所有文件来创建评论映射
 */
export class FileCommentsCache {
    private cache: Map<string, HiNote[]> | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_EXPIRY = 5000; // 5秒缓存过期时间
    
    constructor(
        private app: App,
        private commentStore: CommentStore
    ) {}
    
    /**
     * 获取文件评论映射
     * 使用缓存避免重复遍历
     */
    getFileCommentsMap(forceRefresh: boolean = false): Map<string, HiNote[]> {
        const now = Date.now();
        
        // 如果缓存有效且不强制刷新，直接返回缓存
        if (!forceRefresh && this.cache && (now - this.cacheTimestamp) < this.CACHE_EXPIRY) {
            return this.cache;
        }
        
        // 重新构建缓存
        this.cache = this.buildFileCommentsMap();
        this.cacheTimestamp = now;
        
        return this.cache;
    }
    
    /**
     * 获取单个文件的评论
     */
    getFileComments(filePath: string): HiNote[] {
        const map = this.getFileCommentsMap();
        return map.get(filePath) || [];
    }
    
    /**
     * 构建文件评论映射
     */
    private buildFileCommentsMap(): Map<string, HiNote[]> {
        const fileCommentsMap = new Map<string, HiNote[]>();
        const allFiles = this.app.vault.getMarkdownFiles();
        
        for (const file of allFiles) {
            const fileComments = this.commentStore.getFileComments(file);
            if (fileComments && fileComments.length > 0) {
                fileCommentsMap.set(file.path, fileComments);
            }
        }
        
        return fileCommentsMap;
    }
    
    /**
     * 使缓存失效
     * 当评论发生变化时调用
     */
    invalidate(): void {
        this.cache = null;
        this.cacheTimestamp = 0;
    }
    
    /**
     * 更新单个文件的缓存
     * 当单个文件的评论发生变化时调用
     */
    updateFileCache(filePath: string): void {
        if (!this.cache) {
            return;
        }
        
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
            return;
        }
        
        const fileComments = this.commentStore.getFileComments(file);
        if (fileComments && fileComments.length > 0) {
            this.cache.set(filePath, fileComments);
        } else {
            this.cache.delete(filePath);
        }
    }
    
    /**
     * 清除缓存
     */
    clear(): void {
        this.cache = null;
        this.cacheTimestamp = 0;
    }
}

import { App, TFile } from 'obsidian';

/**
 * 文件内容缓存项
 */
interface CacheItem {
    content: string;
    mtime: number; // 文件修改时间
    timestamp: number; // 缓存时间戳
}

/**
 * 文件内容缓存服务
 * 避免重复读取相同文件的内容
 */
export class FileContentCache {
    private cache: Map<string, CacheItem> = new Map();
    private readonly CACHE_EXPIRY = 10000; // 10秒缓存过期时间
    private readonly MAX_CACHE_SIZE = 100; // 最大缓存文件数
    
    constructor(private app: App) {}
    
    /**
     * 获取文件内容
     * 优先从缓存读取，如果缓存失效则重新读取
     */
    async getFileContent(file: TFile): Promise<string> {
        const filePath = file.path;
        const cached = this.cache.get(filePath);
        const now = Date.now();
        
        // 检查缓存是否有效
        if (cached) {
            // 检查文件是否被修改
            if (cached.mtime === file.stat.mtime) {
                // 检查缓存是否过期
                if (now - cached.timestamp < this.CACHE_EXPIRY) {
                    return cached.content;
                }
            }
        }
        
        // 缓存失效，重新读取文件
        const content = await this.app.vault.read(file);
        
        // 更新缓存
        this.setCache(filePath, content, file.stat.mtime);
        
        return content;
    }
    
    /**
     * 批量获取文件内容
     * 用于优化批量读取场景
     */
    async getMultipleFileContents(files: TFile[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        
        for (const file of files) {
            const content = await this.getFileContent(file);
            result.set(file.path, content);
        }
        
        return result;
    }
    
    /**
     * 设置缓存
     */
    private setCache(filePath: string, content: string, mtime: number): void {
        // 如果缓存已满，删除最旧的条目
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            this.evictOldest();
        }
        
        this.cache.set(filePath, {
            content,
            mtime,
            timestamp: Date.now()
        });
    }
    
    /**
     * 删除最旧的缓存条目
     */
    private evictOldest(): void {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        
        for (const [key, item] of this.cache.entries()) {
            if (item.timestamp < oldestTime) {
                oldestTime = item.timestamp;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
    
    /**
     * 使指定文件的缓存失效
     */
    invalidate(filePath: string): void {
        this.cache.delete(filePath);
    }
    
    /**
     * 批量使缓存失效
     */
    invalidateMultiple(filePaths: string[]): void {
        for (const path of filePaths) {
            this.cache.delete(path);
        }
    }
    
    /**
     * 清空所有缓存
     */
    clear(): void {
        this.cache.clear();
    }
    
    /**
     * 获取缓存统计信息
     */
    getStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.MAX_CACHE_SIZE
        };
    }
    
    /**
     * 预热缓存
     * 提前加载指定文件到缓存中
     */
    async warmup(files: TFile[]): Promise<void> {
        const promises = files.map(file => this.getFileContent(file));
        await Promise.all(promises);
    }
}

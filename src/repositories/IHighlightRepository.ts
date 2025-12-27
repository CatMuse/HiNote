import { TFile } from 'obsidian';
import { HighlightInfo as HiNote } from '../types';

/**
 * 高亮数据仓储接口
 * 负责高亮数据的访问和缓存管理
 */
export interface IHighlightRepository {
    /**
     * 初始化仓储
     */
    initialize(): Promise<void>;

    /**
     * 获取文件的所有高亮
     * @param filePath 文件路径
     * @returns 高亮数组
     */
    getFileHighlights(filePath: string): Promise<HiNote[]>;

    /**
     * 保存文件的高亮
     * @param filePath 文件路径
     * @param highlights 高亮数组
     */
    saveFileHighlights(filePath: string, highlights: HiNote[]): Promise<void>;

    /**
     * 删除文件的所有高亮
     * @param filePath 文件路径
     */
    deleteFileHighlights(filePath: string): Promise<void>;

    /**
     * 处理文件重命名
     * @param oldPath 旧路径
     * @param newPath 新路径
     */
    handleFileRename(oldPath: string, newPath: string): Promise<void>;

    /**
     * 获取所有包含高亮的文件路径
     */
    getAllHighlightFiles(): Promise<string[]>;

    /**
     * 从缓存获取文件高亮（不触发加载）
     * @param filePath 文件路径
     * @returns 高亮数组，如果未缓存则返回 null
     */
    getCachedHighlights(filePath: string): HiNote[] | null;

    /**
     * 使缓存失效
     * @param filePath 文件路径
     */
    invalidateCache(filePath: string): void;

    /**
     * 获取所有缓存的高亮数据
     */
    getAllCachedHighlights(): Map<string, HiNote[]>;

    /**
     * 根据高亮 ID 查找高亮
     * @param highlightId 高亮 ID
     */
    findHighlightById(highlightId: string): HiNote | null;

    /**
     * 根据 blockId 查找高亮
     * @param file 文件
     * @param blockId 块 ID
     */
    findHighlightsByBlockId(file: TFile, blockId: string): HiNote[];
}

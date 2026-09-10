import { normalizePath } from 'obsidian';

/**
 * 文件路径处理工具类
 */
export class FilePathUtils {
    /**
     * 将文件路径转换为安全的文件名
     * @param filePath 原始文件路径
     * @returns 安全的文件名
     */
    static toSafeFileName(filePath: string): string {
        return filePath
            .replace(/[/\\:*?"<>|]/g, '_')  // 替换特殊字符
            .replace(/\s+/g, '_')           // 替换空格
            .toLowerCase()                  // 转小写
            + '.json';
    }

    /**
     * 获取.hinote目录路径
     * @param vaultPath Vault根目录路径
     * @returns .hinote目录路径
     */
    static getHiNoteDir(vaultPath: string): string {
        return normalizePath(`${vaultPath}/.hinote`);
    }

    /**
     * 获取高亮数据目录路径
     * @param vaultPath Vault根目录路径
     * @returns 高亮数据目录路径
     */
    static getHighlightsDir(vaultPath: string): string {
        return `${this.getHiNoteDir(vaultPath)}/highlights`;
    }

    /**
     * 获取闪卡数据目录路径
     * @param vaultPath Vault根目录路径
     * @returns 闪卡数据目录路径
     */
    static getFlashcardsDir(vaultPath: string): string {
        return `${this.getHiNoteDir(vaultPath)}/flashcards`;
    }

    /**
     * 获取元数据目录路径
     * @param vaultPath Vault根目录路径
     * @returns 元数据目录路径
     */
    static getMetadataDir(vaultPath: string): string {
        return `${this.getHiNoteDir(vaultPath)}/metadata`;
    }
}

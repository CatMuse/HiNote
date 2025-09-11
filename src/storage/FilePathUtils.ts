import { createHash } from 'crypto';

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
            .replace(/[\/\\:*?"<>|]/g, '_')  // 替换特殊字符
            .replace(/\s+/g, '_')           // 替换空格
            .toLowerCase()                  // 转小写
            + '.json';
    }

    /**
     * 从安全文件名恢复原始路径（需要配合映射文件）
     * @param safeFileName 安全文件名
     * @returns 去除.json后缀的文件名
     */
    static fromSafeFileName(safeFileName: string): string {
        return safeFileName.replace(/\.json$/, '');
    }

    /**
     * 生成文件路径的哈希值（备用方案）
     * @param filePath 文件路径
     * @returns MD5哈希值
     */
    static generateHash(filePath: string): string {
        return createHash('md5').update(filePath).digest('hex');
    }

    /**
     * 验证文件路径是否安全
     * @param filePath 文件路径
     * @returns 是否安全
     */
    static isSafePath(filePath: string): boolean {
        // 检查是否包含危险字符
        const dangerousChars = /[\/\\:*?"<>|]/;
        return !dangerousChars.test(filePath);
    }

    /**
     * 获取.hinote目录路径
     * @param vaultPath Vault根目录路径
     * @returns .hinote目录路径
     */
    static getHiNoteDir(vaultPath: string): string {
        return `${vaultPath}/.hinote`;
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

import { TFile } from 'obsidian';

export class ExcludePatternMatcher {
    /**
     * 检查文件是否应该被排除
     * @param file 要检查的文件
     * @param patterns 排除模式列表
     * @returns 如果文件应该被排除则返回 true
     */
    static shouldExclude(file: TFile, patternsStr: string): boolean {
        if (!patternsStr || patternsStr.trim().length === 0) {
            return false;
        }

        // 将逗号分隔的字符串分割成数组
        const patterns = patternsStr
            .split(',')
            .map(pattern => pattern.trim())
            .filter(pattern => pattern.length > 0);

        const filePath = file.path;
        const fileName = file.basename;

        return patterns.some(pattern => {
            // 移除前后空格
            pattern = pattern.trim();
            
            // 如果是空字符串，跳过
            if (!pattern) {
                return false;
            }

            // 处理笔记链接格式 [[note]]
            if (pattern.startsWith('[[') && pattern.endsWith(']]')) {
                const noteName = pattern.slice(2, -2);
                return fileName === noteName;
            }

            // 处理文件扩展名格式 *.extension
            if (pattern.startsWith('*.')) {
                const extension = pattern.slice(2);
                return file.extension === extension || filePath.endsWith(extension);
            }

            // 处理文件夹路径
            // 确保路径格式一致（移除开头的 '/'）
            const normalizedPattern = pattern.replace(/^\/+/, '');
            const normalizedPath = filePath.replace(/^\/+/, '');

            // 检查文件是否在指定文件夹中
            return normalizedPath.startsWith(normalizedPattern + '/') || 
                   normalizedPath === normalizedPattern;
        });
    }
}

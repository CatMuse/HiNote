import { TFile } from 'obsidian';
import { HighlightInfo } from '../types';
import { t } from '../i18n';

type RegexMatch = [
    string,      // 完整匹配
    string,      // 双等号匹配
    string,      // mark 背景色
    string,      // mark 文本
    string,      // span 背景色
    string,      // span 文本
] & { index: number };     // 匹配位置

export class HighlightService {
    // 统一的高亮正则表达式
    private static readonly HIGHLIGHT_REGEX = /==\s*(.*?)\s*==|<mark(?:\s+style="[^"]*?background(?:-color)?:\s*(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,8})[^"]*")?\s*>(.*?)<\/mark>|<span\s+style="background(?:-color)?:\s*(rgba\(\d+,\s*\d+,\s*\d+,\s*[0-9.]+\)|#[0-9a-fA-F]{3,8})">\s*(.*?)\s*<\/span>/g;

    // 简单的高亮检测正则表达式（用于快速检查文件是否包含高亮）
    private static readonly SIMPLE_HIGHLIGHT_REGEX = /==.*?==|<mark[^>]*>.*?<\/mark>|<span[^>]*style="[^"]*background[^"]*"[^>]*>.*?<\/span>/g;

    constructor(private app: any) {}

    /**
     * 检查文本是否包含高亮
     * @param content 要检查的文本内容
     * @returns 是否包含高亮
     */
    hasHighlights(content: string): boolean {
        // 使用详细的正则表达式进行检查，确保不会漏掉任何高亮
        const regex = new RegExp(HighlightService.HIGHLIGHT_REGEX);
        const match = regex.exec(content);
        if (match) {
            const [fullMatch, doubleEqual, markBg, markText, spanBg, spanText] = match;
            const text = doubleEqual || markText || spanText;
            return !!text?.trim();
        }
        return false;
    }

    /**
     * 从文本中提取所有高亮
     * @param content 文本内容
     * @returns 高亮信息数组
     */
    extractHighlights(content: string): HighlightInfo[] {
        const highlights: HighlightInfo[] = [];
        const regex = new RegExp(HighlightService.HIGHLIGHT_REGEX);
        
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const matchArray = match as unknown as RegexMatch;
            const [fullMatch, doubleEqual, markBg, markText, spanBg, spanText] = matchArray;
            
            // 提取文本和背景色
            const text = doubleEqual || markText || spanText || '';
            const backgroundColor = markBg || spanBg || undefined;
            
            // 检查是否已存在相同位置的高亮
            const isDuplicate = highlights.some(h => 
                typeof h.position === 'number' && 
                Math.abs(h.position - matchArray.index) < 10 && 
                h.text === text
            );

            if (!isDuplicate && text) {
                highlights.push({
                    text,
                    position: matchArray.index,
                    paragraphOffset: this.getParagraphOffset(content, matchArray.index),
                    backgroundColor,
                    id: `highlight-${Date.now()}-${matchArray.index}`,
                    comments: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    originalLength: fullMatch.length  // 添加原始匹配文本的长度
                });
            }
        }

        // 按位置排序
        return highlights.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    /**
     * 获取段落偏移量
     * @param content 完整文本内容
     * @param position 高亮位置
     * @returns 段落偏移量
     */
    private getParagraphOffset(content: string, position: number): number {
        const beforeText = content.substring(0, position);
        const lastNewline = beforeText.lastIndexOf("\n");
        return lastNewline === -1 ? position : position - lastNewline;
    }

    /**
     * 获取包含高亮的所有文件
     * @returns 包含高亮的文件数组
     */
    async getFilesWithHighlights(): Promise<TFile[]> {
        const files = this.app.vault.getMarkdownFiles();
        const filesWithHighlights: TFile[] = [];
        let totalHighlights = 0;

        for (const file of files) {
            const content = await this.app.vault.read(file);
            const highlights = this.extractHighlights(content);
            if (highlights.length > 0) {
                filesWithHighlights.push(file);
                totalHighlights += highlights.length;
                console.debug(`[HighlightService] Found ${highlights.length} highlights in ${file.path}`);
            }
        }

        console.info(`[HighlightService] Found ${totalHighlights} highlights in ${filesWithHighlights.length} files`);
        return filesWithHighlights;
    }
}

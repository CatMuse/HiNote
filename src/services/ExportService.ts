import { App, TFile } from "obsidian";
import { HighlightInfo, CommentItem } from "../types";
import { CommentStore } from "../CommentStore";
import { t } from "../i18n";

export class ExportService {
    constructor(
        private app: App,
        private commentStore: CommentStore
    ) {}

    /**
     * 导出文件的高亮和评论内容为新的笔记
     * @param sourceFile 源文件
     * @returns 返回创建的新文件
     */
    async exportHighlightsToNote(sourceFile: TFile): Promise<TFile> {
        // 获取文件的所有高亮和评论
        const highlights = await this.getFileHighlights(sourceFile);
        if (!highlights || highlights.length === 0) {
            throw new Error(t("No highlights found in the current file."));
        }

        // 生成导出内容
        const content = await this.generateExportContent(sourceFile, highlights);

        // 获取导出路径
        const exportPath = (this.app as any).plugins.plugins['highlight-comment'].settings.export.exportPath;
        
        // 创建新文件
        const fileName = `${sourceFile.basename} - Highlights ${window.moment().format("YYYYMMDDHHmm")}`;
        
        // 如果设置了导出路径，确保目录存在
        let fullPath = fileName;
        if (exportPath) {
            // 确保目录存在
            const folderPath = this.app.vault.getAbstractFileByPath(exportPath);
            if (!folderPath) {
                await this.app.vault.createFolder(exportPath);
            }
            fullPath = `${exportPath}/${fileName}`;
        }

        // 创建新文件
        const newFile = await this.app.vault.create(
            `${fullPath}.md`,
            content
        );

        return newFile;
    }

    /**
     * 获取文件的所有高亮和评论
     */
    private async getFileHighlights(file: TFile): Promise<HighlightInfo[]> {
        const content = await this.app.vault.read(file);
        const highlights = this.extractHighlights(content);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(file);
        
        // 分离虚拟高亮和普通高亮
        const virtualHighlights = storedComments.filter(c => c.isVirtual && c.comments && c.comments.length > 0);
        const normalHighlights = storedComments.filter(c => !c.isVirtual);
        
        // 处理普通高亮
        const processedHighlights = highlights.map(highlight => {
            const storedComment = normalHighlights.find(c => {
                const textMatch = c.text === highlight.text;
                // 如果存储的评论没有 position，则不进行位置匹配
                if (textMatch && typeof c.position === 'number' && typeof highlight.position === 'number') {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return textMatch;
            });

            if (storedComment) {
                return {
                    ...storedComment,
                    position: highlight.position ?? 0,
                    paragraphOffset: highlight.paragraphOffset ?? 0
                };
            }

            return {
                id: this.generateHighlightId(highlight),
                ...highlight,
                position: highlight.position ?? 0,
                paragraphOffset: highlight.paragraphOffset ?? 0,
                comments: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        });

        // 合并虚拟高亮和普通高亮，虚拟高亮放在前面
        return [...virtualHighlights, ...processedHighlights];
    }

    /**
     * 生成导出内容
     */
    private async generateExportContent(file: TFile, highlights: HighlightInfo[]): Promise<string> {
        const lines: string[] = [];
        
        // 添加标题 - 使用双链接格式
        lines.push(`[[${file.basename}]] - HighlightsNotes`);
        lines.push("");

        // 添加高亮和评论内容
        for (const highlight of highlights) {
            if (highlight.isVirtual) {
                // 虚拟高亮使用不同的格式
                lines.push("> [!note] File Comment");
                lines.push("> ");
            } else {
                // 普通高亮
                lines.push("> [!quote] Highlight");
                lines.push(`> ${highlight.text}`);
                lines.push("> ");
            }
            
            // 如果有评论内容，添加分割线
            if (highlight.comments && highlight.comments.length > 0) {
                if (!highlight.isVirtual) {
                    lines.push("> ---");
                    lines.push("> ");
                }
                
                // 添加评论内容
                for (const comment of highlight.comments) {
                    if (highlight.isVirtual) {
                        // 虚拟高亮的评论直接显示，不需要额外的缩进
                        lines.push(`> ${comment.content}`);
                    } else {
                        // 普通高亮的评论使用双层缩进
                        lines.push(">> [!note] Comment");
                        lines.push(`>> ${comment.content}`);
                    }
                    
                    if (comment.updatedAt) {
                        const date = window.moment(comment.updatedAt);
                        if (highlight.isVirtual) {
                            lines.push(`> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                        } else {
                            lines.push(`>> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                        }
                    }
                    lines.push(highlight.isVirtual ? ">" : ">");
                }
            }
            lines.push("");
        }

        return lines.join("\n");
    }

    /**
     * 从文本内容中提取高亮
     */
    private extractHighlights(content: string): HighlightInfo[] {
        const highlights: HighlightInfo[] = [];
        
        // 匹配所有格式的高亮
        const patterns = [
            /==(.*?)==/g,                          // ==text== 格式
            /<mark[^>]*style="background:\s*#[0-9A-Fa-f]{6,8};?">(.*?)<\/mark>/g,                // <mark>text</mark> 格式
            /<span[^>]*style="background:\s*rgba\(\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*\d?\.?\d+\)">(.+?)<\/span>/g,
            /<span[^>]*style="background:\s*#[0-9A-Fa-f]{6,8};?">(.*?)<\/span>/g  // <span>text</span> 格式
        ];

        for (const regex of patterns) {
            let match: RegExpExecArray | null;
            while ((match = regex.exec(content)) !== null) {
                // 使用类型断言明确告诉 TypeScript match 不为 null
                const nonNullMatch = match as RegExpExecArray;
                
                const isDuplicate = highlights.some(h => 
                    typeof h.position === 'number' && Math.abs(h.position - nonNullMatch.index) < 10 && h.text === nonNullMatch[1]
                );

                if (!isDuplicate) {
                    highlights.push({
                        text: nonNullMatch[1],
                        position: nonNullMatch.index,
                        paragraphOffset: this.getParagraphOffset(content, nonNullMatch.index)
                    });
                }
            }
        }

        // 按位置排序
        return highlights.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    }

    /**
     * 获取段落偏移量
     */
    private getParagraphOffset(content: string, position: number): number {
        const beforeText = content.substring(0, position);
        const lastNewline = beforeText.lastIndexOf("\n");
        return lastNewline === -1 ? position : position - lastNewline;
    }

    /**
     * 生成高亮ID
     */
    private generateHighlightId(highlight: HighlightInfo): string {
        return `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

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

        // 创建新文件
        const fileName = `${sourceFile.basename} - Highlights ${window.moment().format("YYYY-MM-DD-HHmm")}`;
        const newFile = await this.app.vault.create(
            `${fileName}.md`,
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
        
        // 合并高亮和评论数据
        return highlights.map(highlight => {
            const storedComment = storedComments.find(c => {
                const textMatch = c.text === highlight.text;
                if (textMatch) {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return false;
            });

            if (storedComment) {
                return {
                    ...storedComment,
                    position: highlight.position,
                    paragraphOffset: highlight.paragraphOffset
                };
            }

            return {
                id: this.generateHighlightId(highlight),
                ...highlight,
                comments: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        });
    }

    /**
     * 生成导出内容
     */
    private async generateExportContent(file: TFile, highlights: HighlightInfo[]): Promise<string> {
        const lines: string[] = [];
        
        // 添加标题
        lines.push(`# ${file.basename} - Highlights`);
        lines.push("");
        lines.push(`> [!info] Source`);
        lines.push(`> File: ${file.path}`);
        lines.push(`> Created: ${window.moment().format("YYYY-MM-DD HH:mm:ss")}`);
        lines.push("");

        // 添加高亮和评论内容
        for (const highlight of highlights) {
            lines.push("> [!quote] Highlight");
            lines.push(`> ${highlight.text}`);
            
            if (highlight.comments && highlight.comments.length > 0) {
                lines.push("");
                lines.push("> [!note] Comments");
                for (const comment of highlight.comments) {
                    lines.push(`> ${comment.content}`);
                    if (comment.updatedAt) {
                        const date = window.moment(comment.updatedAt);
                        lines.push(`> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                    }
                    lines.push(">");
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
        const regex = /==(.*?)==/g;
        let match;
        let position = 0;

        while ((match = regex.exec(content)) !== null) {
            highlights.push({
                text: match[1],
                position: match.index,
                paragraphOffset: this.getParagraphOffset(content, match.index)
            });
            position = regex.lastIndex;
        }

        return highlights;
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

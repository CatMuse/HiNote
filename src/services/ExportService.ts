import { App, TFile } from "obsidian";
import { HighlightInfo, CommentItem } from "../types";
import { CommentStore } from "../CommentStore";
import { t } from "../i18n";
import { HighlightService } from "./HighlightService";

export class ExportService {
    private highlightService: HighlightService;

    constructor(
        private app: App,
        private commentStore: CommentStore
    ) {
        this.highlightService = new HighlightService(app);
    }

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
        // 使用类型安全的方式获取导出路径
        // 通过类型断言访问内部属性
        const plugins = (this.app as any).plugins;
        const hiNotePlugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        const exportPath = hiNotePlugin?.settings?.export?.exportPath || '';
        
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
        const highlights = this.highlightService.extractHighlights(content);
        
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
                
                // 尝试使用或创建 Block ID
                if (typeof highlight.position === 'number') {
                    try {
                        // 尝试获取或创建 Block ID
                        const blockIdRef = await this.highlightService.createBlockIdForHighlight(file, highlight.position);
                        if (blockIdRef) {
                            // 使用 Block ID 引用
                            lines.push(`> ![[${blockIdRef}]]`);
                        } else {
                            // 如果没有成功创建 Block ID，使用原文本
                            lines.push(`> ${highlight.text}`);
                        }
                    } catch (error) {
                        console.error('[ExportService] Error creating block ID:', error);
                        // 如果创建 Block ID 失败，使用原文本
                        lines.push(`> ${highlight.text}`);
                    }
                } else {
                    // 如果没有位置信息，使用原文本
                    lines.push(`> ${highlight.text}`);
                }
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
                        // 处理多行内容，确保每行都有正确的缩进
                        const commentLines = comment.content
                            .split('\n')
                            .map(line => {
                                line = line.trim();
                                // 如果是空行，返回带缩进的空行
                                if (!line) return '>';
                                return `> ${line}`;
                            })
                            .join('\n');
                        lines.push(commentLines);
                    } else {
                        // 普通高亮的评论使用双层缩进
                        lines.push(">> [!note] Comment");
                        // 处理多行内容，确保每行都有正确的缩进
                        const commentLines = comment.content
                            .split('\n')
                            .map(line => {
                                line = line.trim();
                                // 如果是空行，返回带缩进的空行
                                if (!line) return '>>';
                                return `>> ${line}`;
                            })
                            .join('\n');
                        lines.push(commentLines);
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

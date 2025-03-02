import { HighlightInfo, CommentItem } from "../../types";
import { TFile } from "obsidian";
import type CommentPlugin from "../../../main";

export class DragContentGenerator {
    constructor(
        private highlight: HighlightInfo,
        private plugin: CommentPlugin
    ) {}

    /**
     * 同步生成拖拽时的格式化内容
     */
    public generateSync(): string {
        const lines: string[] = [];

        // 使用与 ExportService 相同的格式
        if (this.highlight.isVirtual) {
            const fileName = this.highlight.filePath?.split('/').pop()?.replace('.md', '') || 'File';
            lines.push(`> [!note] [[${fileName}]]`);
            lines.push("> ");
        } else {
            lines.push("> [!quote] Highlight");
            
            let hasAddedContent = false;
            
            // 如果有 blockId，尝试创建引用
            if (this.highlight.blockId) {
                // 优先使用高亮中的 filePath
                let filePath = this.highlight.filePath;
                
                // 如果高亮中没有 filePath，尝试获取当前文件的路径
                if (!filePath) {
                    const currentFile = this.plugin.app.workspace.getActiveFile();
                    if (currentFile) {
                        filePath = currentFile.path;
                    }
                }
                
                if (filePath) {
                    const fileName = filePath.split('/').pop()?.replace('.md', '');
                    if (fileName) {
                        const reference = `> ![[${fileName}#^${this.highlight.blockId}]]`;
                        lines.push(reference);
                        lines.push("> ");
                        hasAddedContent = true;
                    }
                }
            } else if (this.highlight.filePath && typeof this.highlight.position === 'number') {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    const cache = this.plugin.app.metadataCache.getFileCache(file);
                    if (cache?.sections) {
                        const position = this.highlight.position;
                        const section = cache.sections.find(section => 
                            section.position.start.offset <= position &&
                            section.position.end.offset >= position
                        );

                        if (section?.id) {
                            const fileName = this.highlight.filePath.split('/').pop()?.replace('.md', '');
                            if (fileName) {
                                const reference = `> ![[${fileName}#^${section.id}]]`;
                                lines.push(reference);
                                lines.push("> ");
                                hasAddedContent = true;
                            }
                        }
                    }
                }
            }
            
            // 如果没有成功添加块引用，使用原文本
            if (!hasAddedContent && this.highlight.text) {
                lines.push(`> ${this.highlight.text}`);
                lines.push("> ");
            }
        }

        // 添加评论
        if (this.highlight.comments && this.highlight.comments.length > 0) {
            for (const comment of this.highlight.comments) {
                lines.push(...this.formatComment(comment, false));
            }
        }

        return lines.join("\n");
    }

    /**
     * 异步生成完整的格式化内容，只使用已有的 Block ID
     */
    public async generate(): Promise<string> {
        // 简化后的实现与同步方法相同，不再尝试创建 Block ID
        return this.generateSync();
    }

    /**
     * 格式化评论内容
     */
    private formatComment(comment: CommentItem, isVirtual: boolean): string[] {
        const lines: string[] = [];
        const indentation = isVirtual ? '>' : '>>';

        if (!isVirtual) {
            lines.push(">> [!note] Comment");
        }

        // 处理多行内容，确保每行都有正确的缩进
        const commentLines = comment.content
            .split('\n')
            .map(line => {
                line = line.trim();
                return line ? `${indentation} ${line}` : indentation;
            })
            .join('\n');
        lines.push(commentLines);

        // 添加时间戳
        if (comment.updatedAt) {
            const date = window.moment(comment.updatedAt);
            lines.push(`${indentation} *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
        }
        lines.push(isVirtual ? ">" : ">");

        return lines;
    }
}

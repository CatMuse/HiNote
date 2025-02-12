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
            
            // 如果有文件路径和位置信息，尝试查找对应的 Block ID
            if (this.highlight.filePath && typeof this.highlight.position === 'number') {
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
                            }
                        }
                    }
                }
            }
            lines.push("> ");
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
     * 异步生成完整的格式化内容，包含 Block ID 的生成和更新
     */
    public async generate(): Promise<string> {
        const lines: string[] = [];
        
        // 使用与 ExportService 相同的格式
        if (this.highlight.isVirtual) {
            const fileName = this.highlight.filePath?.split('/').pop()?.replace('.md', '') || 'File';
            lines.push(`> [!note] [[${fileName}]]`);
            lines.push("> ");
        } else {
            lines.push("> [!quote] Highlight");
            
            // 尝试获取 Block ID
            if (this.highlight.filePath && typeof this.highlight.position === 'number') {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    const cache = this.plugin.app.metadataCache.getFileCache(file);
                    if (cache?.sections) {
                        const position = this.highlight.position;
                        const section = cache.sections.find(section => 
                            typeof position === 'number' &&
                            section.position.start.offset <= position &&
                            section.position.end.offset >= position
                        );
                        
                        if (section) {
                            let blockId = section.id;
                            
                            // 如果没有 Block ID，生成一个并添加到文档
                            if (!blockId) {
                                blockId = await this.generateBlockId(file, section);
                            }
                            
                            const reference = `> ![[${file.basename}#^${blockId}]]`;
                            console.log('Generated reference:', reference);
                            lines.push(reference);
                            lines.push("> ");
                            
                            // 添加评论
                            if (this.highlight.comments && this.highlight.comments.length > 0) {
                                for (const comment of this.highlight.comments) {
                                    lines.push(...this.formatComment(comment, false));
                                }
                            }
                            
                            return lines.join("\n");
                        }
                    }
                }
            }
            
            // 如果没有 paragraphId 或者解析失败，使用原文本
            lines.push(`> ${this.highlight.text}`);
            lines.push("> ");
            
            // 添加评论
            if (this.highlight.comments && this.highlight.comments.length > 0) {
                for (const comment of this.highlight.comments) {
                    lines.push(...this.formatComment(comment, this.highlight.isVirtual || false));
                }
            }
        }
        
        // 添加评论（如果有）
        const comments = this.highlight.comments || [];
        if (comments.length > 0) {
            if (!this.highlight.isVirtual) {
                lines.push("> ---");
                lines.push("> ");
            }
            
            for (const comment of comments) {
                lines.push(...this.formatComment(comment, this.highlight.isVirtual || false));
            }
        }
        
        return lines.join("\n");
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

    /**
     * 生成并添加 Block ID 到文档
     */
    private async generateBlockId(file: TFile, section: { position: { end: { line: number } } }): Promise<string> {
        // 使用 Obsidian 的 API 生成唯一的 Block ID
        // @ts-ignore Obsidian API 类型定义中未包含 uniqueId 方法
        const blockId = (this.plugin.app.metadataCache as any).uniqueId('block');
        
        // 获取文件内容
        const content = await this.plugin.app.vault.read(file);
        const lines = content.split('\n');
        
        // 找到段落的最后一行
        const endLine = section.position.end.line;
        
        // 在段落末尾添加 Block ID
        lines[endLine] = lines[endLine] + ` ^${blockId}`;
        
        // 更新文件内容
        await this.plugin.app.vault.modify(file, lines.join('\n'));
        
        // 更新高亮的 paragraphId
        this.highlight.paragraphId = `${file.path}#^${blockId}`;
        
        // 更新存储
        const commentStore = (this.plugin as any).commentStore;
        if (commentStore) {
            await commentStore.updateHighlight(file.path, this.highlight.id, this.highlight);
        }
        
        // 等待元数据缓存更新
        await new Promise(resolve => setTimeout(resolve, 100));

        return blockId;
    }
}

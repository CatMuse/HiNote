import { App, TFile } from "obsidian";
import { HighlightInfo, CommentItem } from "../types";
import { CommentStore } from "../CommentStore";
import { t } from "../i18n";
import { HighlightService } from "./HighlightService";
import { IdGenerator } from '../utils/IdGenerator';

export class ExportService {
    private highlightService: HighlightService;

    constructor(
        private app: App,
        private commentStore: CommentStore
    ) {
        this.highlightService = new HighlightService(app);
    }
    
    /**
     * 导出选中的多个高亮为 Markdown 文件
     * @param highlights 要导出的高亮数组
     * @returns 返回创建的新文件
     */
    async exportHighlightsAsMarkdown(highlights: HighlightInfo[]): Promise<TFile | null> {
        if (!highlights || highlights.length === 0) {
            return null;
        }
        
        // 生成导出内容
        const content = await this.generateContentForMultipleHighlights(highlights);
        
        // 获取导出路径
        const plugins = (this.app as any).plugins;
        const hiNotePlugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        const exportPath = hiNotePlugin?.settings?.export?.exportPath || '';
        
        // 创建新文件
        const fileName = `Selected Highlights ${window.moment().format("YYYYMMDDHHmm")}`;
        
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
     * 为多个高亮生成导出内容
     * @param highlights 高亮数组
     * @returns 生成的内容
     */
    private async generateContentForMultipleHighlights(highlights: HighlightInfo[]): Promise<string> {
        const lines: string[] = [];
        
        // 添加标题
        lines.push(`# ${t("Selected Highlights")}`);
        lines.push("");
        lines.push(`*${t("Exported on")} ${window.moment().format("YYYY-MM-DD HH:mm:ss")}*`);
        lines.push("");
        
        // 按文件分组高亮
        const highlightsByFile: Record<string, HighlightInfo[]> = {};
        
        for (const highlight of highlights) {
            if (!highlight.filePath) continue;
            
            if (!highlightsByFile[highlight.filePath]) {
                highlightsByFile[highlight.filePath] = [];
            }
            
            highlightsByFile[highlight.filePath].push(highlight);
        }
        
        // 为每个文件生成内容
        for (const filePath in highlightsByFile) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) continue;
            
            lines.push(`## ${file.basename}`);
            lines.push("");
            
            // 为文件中的每个高亮生成内容
            const fileHighlights = highlightsByFile[filePath];
            for (const highlight of fileHighlights) {
                // 添加高亮文本
                lines.push(`> ${highlight.text}`);
                lines.push("> ");
                
                // 如果有评论内容，添加分割线
                if (highlight.comments && highlight.comments.length > 0) {
                    lines.push("> ---");
                    lines.push("> ");
                    
                    // 添加评论内容
                    for (const comment of highlight.comments) {
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
                        
                        if (comment.updatedAt) {
                            const date = window.moment(comment.updatedAt);
                            lines.push(`>> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                        }
                        lines.push(">");
                    }
                }
                lines.push("");
            }
        }
        
        return lines.join("\n");
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
        const highlights = this.highlightService.extractHighlights(content, file);
        
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
                id: IdGenerator.generateHighlightId(
                    file.path, 
                    highlight.position || 0, 
                    highlight.text
                ),
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
        // 获取插件实例和设置
        const plugins = (this.app as any).plugins;
        const hiNotePlugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        
        // 检查是否有自定义模板
        const customTemplate = hiNotePlugin?.settings?.export?.exportTemplate;
        
        // 如果有自定义模板且不为空，使用模板解析方式
        if (customTemplate && customTemplate.trim() !== '') {
            return this.generateContentFromTemplate(file, highlights, customTemplate);
        }
        
        // 如果没有自定义模板或模板为空，使用原来的方式
        return this.generateDefaultContent(file, highlights);
    }
    
    /**
     * 使用模板生成导出内容
     */
    private async generateContentFromTemplate(file: TFile, highlights: HighlightInfo[], template: string): Promise<string> {
        const content: string[] = [];
        
        // 处理文档头部（只处理一次）
        let documentHeader = template.split('\n\n')[0] || '';
        documentHeader = this.replaceVariables(documentHeader, {
            sourceFile: file.basename,
            exportDate: window.moment().format("YYYY-MM-DD HH:mm:ss")
        });
        content.push(documentHeader);
        
        // 提取高亮和评论模板
        const templateParts = template.split('\n\n');
        const highlightTemplate = templateParts.length > 1 ? templateParts.slice(1).join('\n\n') : template;
        
        // 处理每个高亮和评论
        for (const highlight of highlights) {
            // 如果是虚拟高亮，只处理评论部分
            if (highlight.isVirtual) {
                if (highlight.comments && highlight.comments.length > 0) {
                    // 虚拟高亮只包含评论部分
                    for (const comment of highlight.comments) {
                        // 创建一个简化的虚拟高亮模板
                        let virtualCommentTemplate = "> [!note] File Comment\n> {{commentContent}}\n> *{{commentDate}}*";
                        
                        // 替换评论变量
                        let commentContent = virtualCommentTemplate;
                        commentContent = this.replaceVariables(commentContent, {
                            sourceFile: file.basename,
                            commentContent: comment.content || '',
                            commentDate: window.moment(comment.updatedAt || Date.now()).format("YYYY-MM-DD HH:mm:ss")
                        });
                        content.push(commentContent);
                    }
                }
            } else {
                // 普通高亮的处理
                let blockIdRef = '';
                let highlightText = highlight.text || '';
                
                // 获取 BlockID 引用（如果可能）
                if (typeof highlight.position === 'number') {
                    try {
                        const highlightLength = highlight.originalLength || highlight.text.length;
                        blockIdRef = await this.highlightService.createBlockIdForHighlight(
                            file, 
                            highlight.position, 
                            highlightLength
                        ) || '';
                    } catch (error) {
                        console.error('[ExportService] Error creating block ID:', error);
                    }
                }
                
                // 处理高亮部分
                let highlightContent = highlightTemplate;
                highlightContent = this.replaceVariables(highlightContent, {
                    sourceFile: file.basename,
                    highlightText: highlightText,
                    highlightBlockRef: blockIdRef,
                    highlightType: 'Highlight'
                });
                
                // 如果有评论，处理评论
                if (highlight.comments && highlight.comments.length > 0) {
                    // 先提取高亮部分和评论部分
                    const templateParts = highlightTemplate.split('---');
                    let highlightPart = templateParts[0] || '';
                    let commentPart = templateParts.length > 1 ? templateParts[1] : '';
                    
                    // 替换高亮部分的变量
                    highlightPart = this.replaceVariables(highlightPart, {
                        sourceFile: file.basename,
                        highlightText: highlightText,
                        highlightBlockRef: blockIdRef,
                        highlightType: 'Highlight'
                    });
                    
                    // 添加高亮部分（只添加一次）
                    content.push(highlightPart.trim());
                    content.push('> ---'); // 添加分隔线
                    
                    // 处理每个评论
                    for (let i = 0; i < highlight.comments.length; i++) {
                        const comment = highlight.comments[i];
                        
                        // 替换评论变量
                        let processedComment = commentPart;
                        processedComment = this.replaceVariables(processedComment, {
                            commentContent: comment.content || '',
                            commentDate: window.moment(comment.updatedAt || Date.now()).format("YYYY-MM-DD HH:mm:ss")
                        });
                        
                        // 添加评论
                        content.push(processedComment.trim());
                        
                        // 如果不是最后一个评论，添加分隔线
                        if (i < highlight.comments.length - 1) {
                            content.push('> ---');
                        }
                    }
                } else {
                    // 如果没有评论，删除模板中与评论相关的部分
                    let cleanedTemplate = highlightContent;
                    
                    // 删除所有包含评论变量的行
                    cleanedTemplate = cleanedTemplate.replace(/.*\{\{commentContent\}\}.*\n?/g, '');
                    cleanedTemplate = cleanedTemplate.replace(/.*\{\{commentDate\}\}.*\n?/g, '');
                    
                    // 删除评论相关的标记，如 [!note] Comment
                    cleanedTemplate = cleanedTemplate.replace(/.*\[!note\]\s*Comment.*\n?/g, '');
                    
                    // 删除分隔线（如果有）
                    cleanedTemplate = cleanedTemplate.replace(/.*---.*\n?/g, '');
                    
                    // 删除过多的空行
                    cleanedTemplate = cleanedTemplate.replace(/\n{3,}/g, '\n\n');
                    
                    // 添加处理后的高亮内容
                    content.push(cleanedTemplate);
                }
            }
            
            content.push(""); // 添加空行分隔
        }
        
        return content.join("\n");
    }
    
    /**
     * 替换模板中的变量
     */
    private replaceVariables(template: string, variables: Record<string, string>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
        }
        return result;
    }
    
    /**
     * 使用默认方式生成导出内容（保持原有功能）
     */
    private async generateDefaultContent(file: TFile, highlights: HighlightInfo[]): Promise<string> {
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
                        // 获取高亮长度（如果有）
                        const highlightLength = highlight.originalLength || highlight.text.length;
                        
                        // 尝试获取或创建 Block ID，传递高亮的起始位置和长度
                        const blockIdRef = await this.highlightService.createBlockIdForHighlight(
                            file, 
                            highlight.position, 
                            highlightLength
                        );
                        
                        if (blockIdRef) {
                            // 使用 Block ID 引用
                            lines.push(`> ![[${blockIdRef}]]`);
                            console.debug(`[ExportService] 使用 Block ID 引用: ${blockIdRef}`);
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
    private generateHighlightId(highlight: HighlightInfo, filePath: string): string {
        return IdGenerator.generateHighlightId(
            filePath, 
            highlight.position || 0, 
            highlight.text
        );
    }
}

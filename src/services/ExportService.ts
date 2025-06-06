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
        
        // 获取插件实例和设置
        const plugins = (this.app as any).plugins;
        const hiNotePlugin = plugins && plugins.plugins ? 
            plugins.plugins['hi-note'] : undefined;
        
        // 按文件分组高亮
        const highlightsByFile: Record<string, HighlightInfo[]> = {};
        
        for (const highlight of highlights) {
            if (!highlight.filePath) continue;
            
            if (!highlightsByFile[highlight.filePath]) {
                highlightsByFile[highlight.filePath] = [];
            }
            
            highlightsByFile[highlight.filePath].push(highlight);
        }
        
        // 生成内容
        const contentParts: string[] = [];
        
        // 为每个文件生成内容
        for (const filePath in highlightsByFile) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) continue;
            
            contentParts.push(`## ${file.basename}`);
            contentParts.push("");
            
            // 使用模板或默认方式生成内容
            const fileHighlights = highlightsByFile[filePath];
            
            // 获取插件实例和设置
            const customTemplate = hiNotePlugin?.settings?.export?.exportTemplate;
            
            // 如果有自定义模板且不为空，使用模板解析方式
            if (customTemplate && customTemplate.trim() !== '') {
                const templateContent = await this.generateContentFromTemplate(file, fileHighlights, customTemplate);
                if (templateContent.trim() !== '') {
                    contentParts.push(templateContent);
                }
            } else {
                // 如果没有自定义模板或模板为空，使用原来的方式
                const defaultContent = await this.generateDefaultContent(file, fileHighlights);
                contentParts.push(defaultContent);
            }
        }
        
        const content = contentParts.join("\n");
        
        // 获取导出路径
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
        const fileName = `${sourceFile.basename} - HiNote ${window.moment().format("YYYYMMDDHHmm")}`;
        
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
        
        // 检查模板中是否包含高亮和评论变量
        const hasHighlightVars = template.includes('{{highlightText}}') || template.includes('{{highlightBlockRef}}');
        const hasCommentVars = template.includes('{{commentContent}}') || template.includes('{{commentDate}}');
        
        // 处理每个高亮和评论
        for (const highlight of highlights) {
            // 如果是虚拟高亮（文件评论），使用特殊处理
            if (highlight.isVirtual) {
                if (highlight.comments && highlight.comments.length > 0) {
                    for (const comment of highlight.comments) {
                        // 虚拟高亮只处理评论变量
                        if (hasCommentVars) {
                            let processedTemplate = this.replaceVariables(template, {
                                sourceFile: file.basename,
                                commentContent: comment.content || '',
                                commentDate: window.moment(comment.updatedAt || Date.now()).format("YYYY-MM-DD HH:mm:ss"),
                                // 空的高亮变量
                                highlightText: '',
                                highlightBlockRef: '',
                                highlightType: 'HiNote'
                            });
                            content.push(processedTemplate.trim());
                        } else {
                            // 如果模板中没有评论变量，使用默认格式
                            let virtualCommentTemplate = "> [!note] File Comment\n> {{commentContent}}\n> *{{commentDate}}*";
                            let commentContent = this.replaceVariables(virtualCommentTemplate, {
                                commentContent: comment.content || '',
                                commentDate: window.moment(comment.updatedAt || Date.now()).format("YYYY-MM-DD HH:mm:ss")
                            });
                            content.push(commentContent);
                        }
                    }
                }
            } else {
                // 普通高亮的处理
                // 准备变量值
                let blockIdRef = '';
                let highlightText = highlight.text || '';
                
                // 获取 BlockID 引用（如果可能）
                // 只有当模板中包含 highlightBlockRef 变量时，才创建 BlockID
                if (typeof highlight.position === 'number' && template.includes('{{highlightBlockRef}}')) {
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
                
                // 如果没有评论
                if (!highlight.comments || highlight.comments.length === 0) {
                    // 如果模板只包含评论变量，没有高亮变量，则跳过该高亮
                    if (hasCommentVars && !hasHighlightVars) {
                        // 跳过该高亮，因为模板只包含评论变量但该高亮没有评论
                        continue;
                    }
                    
                    // 如果模板包含高亮变量，则处理高亮部分
                    if (hasHighlightVars) {
                        // 只处理高亮部分，移除评论相关的部分
                        let highlightOnlyTemplate = template;
                        
                        // 如果模板中包含评论变量，移除这些部分
                        if (hasCommentVars) {
                            // 查找并移除所有与批注相关的部分
                            
                            // 先尝试匹配并移除带有分隔线的批注部分
                            const commentWithSeparatorRegex = /\n>\s*\n>\s*---[\s\S]*?(?=\n\s*$|$)/g;
                            highlightOnlyTemplate = highlightOnlyTemplate.replace(commentWithSeparatorRegex, '');
                            
                            // 匹配并移除所有的批注块
                            const commentBlockRegex = /\n>>\s*\[!note\]\s*Comment[\s\S]*?(?=\n>\s*$|\n\s*$|$)/g;
                            highlightOnlyTemplate = highlightOnlyTemplate.replace(commentBlockRegex, '');
                            
                            // 移除所有的批注变量
                            highlightOnlyTemplate = highlightOnlyTemplate.replace(/\{\{commentContent\}\}/g, '');
                            highlightOnlyTemplate = highlightOnlyTemplate.replace(/\{\{commentDate\}\}/g, '');
                            
                            // 清理多余的空行和尾部空行
                            highlightOnlyTemplate = highlightOnlyTemplate.replace(/\n{3,}/g, '\n\n');
                            highlightOnlyTemplate = highlightOnlyTemplate.replace(/\n>\s*\n\s*$/g, '\n');
                        }
                        
                        // 替换高亮变量
                        let processedTemplate = this.replaceVariables(highlightOnlyTemplate, {
                            sourceFile: file.basename,
                            highlightText: highlightText,
                            highlightBlockRef: blockIdRef,
                            highlightType: 'HiNote',
                            // 空的评论变量
                            commentContent: '',
                            commentDate: ''
                        });
                        content.push(processedTemplate.trim());
                    }
                }
                // 如果有评论
                else if (highlight.comments && highlight.comments.length > 0) {
                    // 如果模板只包含评论变量（没有高亮变量）
                    if (hasCommentVars && !hasHighlightVars) {
                        // 对每个评论，使用完整的模板进行处理
                        for (const comment of highlight.comments) {
                            let processedTemplate = this.replaceVariables(template, {
                                sourceFile: file.basename,
                                commentContent: comment.content || '',
                                commentDate: window.moment(comment.updatedAt || Date.now()).format("YYYY-MM-DD HH:mm:ss"),
                                // 空的高亮变量
                                highlightText: '',
                                highlightBlockRef: '',
                                highlightType: 'HiNote'
                            });
                            content.push(processedTemplate.trim());
                        }
                    }
                    // 如果模板同时包含高亮和评论变量
                    else if (hasHighlightVars && hasCommentVars) {
                        // 对每个评论，使用完整的模板进行处理
                        for (const comment of highlight.comments) {
                            // 使用用户自定义的模板格式，直接替换所有变量
                            let processedTemplate = this.replaceVariables(template, {
                                sourceFile: file.basename,
                                highlightText: highlightText,
                                highlightBlockRef: blockIdRef,
                                highlightType: 'HiNote',
                                commentContent: comment.content || '',
                                commentDate: window.moment(comment.updatedAt || Date.now()).format("YYYY-MM-DD HH:mm:ss")
                            });
                            content.push(processedTemplate.trim());
                        }
                    }
                    // 如果模板只包含高亮变量（没有评论变量）
                    else if (hasHighlightVars && !hasCommentVars) {
                        // 只处理高亮部分
                        let processedTemplate = this.replaceVariables(template, {
                            sourceFile: file.basename,
                            highlightText: highlightText,
                            highlightBlockRef: blockIdRef,
                            highlightType: 'HiNote',
                            // 空的评论变量
                            commentContent: '',
                            commentDate: ''
                        });
                        content.push(processedTemplate.trim());
                    }
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
     * 使用默认方式生成导出内容
     */
    private async generateDefaultContent(file: TFile, highlights: HighlightInfo[]): Promise<string> {
        // 使用用户提供的模板作为默认模板
        const defaultTemplate = `> [!quote] HiNote
> {{highlightText}}
> 
>> [!note] Comment
>> {{commentContent}}
>> *{{commentDate}}*`;
        
        // 调用模板生成方法
        return this.generateContentFromTemplate(file, highlights, defaultTemplate);
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

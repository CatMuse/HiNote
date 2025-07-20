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
        
        // 使用新的结构化方法处理每个高亮
        for (const highlight of highlights) {
            // 为每个高亮生成结构化内容
            const structuredLines = await this.generateStructuredContent(highlight, file, template);
            content.push(...structuredLines);
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
     * 格式化批注内容 - 借鉴 DragContentGenerator 的优秀设计
     */
    private formatComment(comment: CommentItem, isVirtual: boolean = false): string[] {
        const lines: string[] = [];
        const indentation = isVirtual ? '>' : '>>';

        if (!isVirtual) {
            // 使用新的模板格式：时间戳在标题中
            const date = comment.updatedAt ? window.moment(comment.updatedAt).format("YYYY-MM-DD HH:mm:ss") : '';
            lines.push(`>> [!note]+ ${date}`);
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
        lines.push(isVirtual ? ">" : ">");

        return lines;
    }

    /**
     * 为单个高亮生成结构化内容 - 借鉴 DragContentGenerator 的设计
     */
    private async generateStructuredContent(highlight: HighlightInfo, file: TFile, template?: string): Promise<string[]> {
        const lines: string[] = [];

        // 处理主体内容（高亮部分）
        if (highlight.isVirtual) {
            // 虚拟高亮（文件评论）
            lines.push(`> [!note] [[${file.basename}]]`);
            lines.push("> ");
        } else {
            // 普通高亮
            if (template && (template.includes('{{highlightText}}') || template.includes('{{highlightBlockRef}}'))) {
                // 使用模板处理高亮部分
                const highlightTemplate = this.extractHighlightTemplate(template);
                
                // 获取 BlockID 引用（如果需要）
                let blockIdRef = '';
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
                
                const processedTemplate = this.replaceVariables(highlightTemplate, {
                    sourceFile: file.basename,
                    highlightText: highlight.text || '',
                    highlightBlockRef: blockIdRef,
                    highlightType: 'HiNote',
                    commentContent: '',
                    commentDate: ''
                });
                lines.push(...processedTemplate.split('\n'));
            } else {
                // 使用默认格式
                lines.push("> [!quote] HiNote");
                lines.push(`> ${highlight.text || ''}`);
                lines.push("> ");
            }
        }

        // 统一处理所有批注
        if (highlight.comments && highlight.comments.length > 0) {
            for (const comment of highlight.comments) {
                lines.push(...this.formatComment(comment, highlight.isVirtual));
            }
        }

        return lines;
    }

    /**
     * 从模板中提取高亮部分（移除批注相关内容）
     */
    private extractHighlightTemplate(template: string): string {
        let highlightTemplate = template;
        
        // 移除批注块（>> [!note]+ 时间戳 及其后续内容）
        const commentBlockRegex = /\n>>\s*\[!note\]\+[\s\S]*?(?=\n>\s*$|\n\s*$|$)/g;
        highlightTemplate = highlightTemplate.replace(commentBlockRegex, '');
        
        // 移除批注变量
        highlightTemplate = highlightTemplate.replace(/\{\{commentContent\}\}/g, '');
        highlightTemplate = highlightTemplate.replace(/\{\{commentDate\}\}/g, '');
        
        // 清理多余的空行
        highlightTemplate = highlightTemplate.replace(/\n{3,}/g, '\n\n');
        highlightTemplate = highlightTemplate.replace(/\n>\s*\n\s*$/g, '\n');
        
        return highlightTemplate.trim();
    }
    
    /**
     * 使用默认方式生成导出内容
     */
    private async generateDefaultContent(file: TFile, highlights: HighlightInfo[]): Promise<string> {
        // 使用用户提供的模板作为默认模板
        const defaultTemplate = `> [!quote] HiNote
> {{highlightText}}
> 
>> [!note]+ {{commentDate}}
>> {{commentContent}}`;
        
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

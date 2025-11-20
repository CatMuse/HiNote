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
     * 获取插件实例
     */
    private getPluginInstance(): any {
        const plugins = (this.app as any).plugins;
        return plugins && plugins.plugins ? plugins.plugins['hi-note'] : undefined;
    }
    
    /**
     * 创建导出文件
     * @param fileName 文件名（不含扩展名）
     * @param content 文件内容
     * @param exportPath 导出路径
     */
    private async createExportFile(fileName: string, content: string, exportPath: string): Promise<TFile> {
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
        try {
            const newFile = await this.app.vault.create(
                `${fullPath}.md`,
                content
            );
            return newFile;
        } catch (error) {
            // 处理文件已存在的情况
            if (error.message && error.message.includes("already exists")) {
                throw new Error(t("Export file already exists. Please try again in a moment."));
            }
            // 处理其他文件创建错误
            throw new Error(t("Failed to create export file: ") + error.message);
        }
    }
    
    /**
     * 导出选中的多个高亮为 Markdown 文件
     * @param highlights 要导出的高亮数组
     * @returns 返回创建的新文件
     * @throws 如果没有高亮或创建文件失败
     */
    async exportHighlightsAsMarkdown(highlights: HighlightInfo[]): Promise<TFile> {
        if (!highlights || highlights.length === 0) {
            throw new Error(t("No highlights to export."));
        }
        
        // 获取插件实例和设置
        const hiNotePlugin = this.getPluginInstance();
        
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
        
        // 获取导出路径并创建文件
        const exportPath = hiNotePlugin?.settings?.export?.exportPath || '';
        const fileName = `Selected Highlights ${window.moment().format("YYYYMMDDHHmmss")}`;
        
        return await this.createExportFile(fileName, content, exportPath);
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

        // 获取导出路径并创建文件
        const hiNotePlugin = this.getPluginInstance();
        const exportPath = hiNotePlugin?.settings?.export?.exportPath || '';
        const fileName = `${sourceFile.basename} - HiNote ${window.moment().format("YYYYMMDDHHmmss")}`;
        
        return await this.createExportFile(fileName, content, exportPath);
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
                ...highlight,
                id: highlight.id || IdGenerator.generateHighlightId(
                    file.path, 
                    highlight.position || 0, 
                    highlight.text
                ),
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
        const hiNotePlugin = this.getPluginInstance();
        
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
}

import { TFile } from "obsidian";
import { CommentItem, HighlightInfo, isFileComment } from "../../types/highlight";
import { HighlightService } from "../HighlightService";

export class ExportContentRenderer {
    constructor(private highlightService: HighlightService) {}

    async generateExportContent(
        file: TFile,
        highlights: HighlightInfo[],
        customTemplate?: string
    ): Promise<string> {
        if (customTemplate && customTemplate.trim() !== '') {
            return this.generateContentFromTemplate(file, highlights, customTemplate);
        }

        return this.generateDefaultContent(file, highlights);
    }

    async generateContentFromTemplate(
        file: TFile,
        highlights: HighlightInfo[],
        template: string
    ): Promise<string> {
        const content: string[] = [];

        for (const highlight of highlights) {
            const structuredLines = await this.generateStructuredContent(highlight, file, template);
            content.push(...structuredLines);
            content.push("");
        }

        return content.join("\n");
    }

    async generateDefaultContent(file: TFile, highlights: HighlightInfo[]): Promise<string> {
        const defaultTemplate = `> [!quote] HiNote
> {{highlightText}}
> 
>> [!note]+ {{commentDate}}
>> {{commentContent}}`;

        return this.generateContentFromTemplate(file, highlights, defaultTemplate);
    }

    private replaceVariables(template: string, variables: Record<string, string>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
        }
        return result;
    }

    private formatComment(comment: CommentItem, fileLevel: boolean = false): string[] {
        const lines: string[] = [];
        const indentation = fileLevel ? '>' : '>>';

        if (!fileLevel) {
            const date = comment.updatedAt ? window.moment(comment.updatedAt).format("YYYY-MM-DD HH:mm:ss") : '';
            lines.push(`>> [!note]+ ${date}`);
        }

        const commentLines = comment.content
            .split('\n')
            .map(line => {
                line = line.trim();
                return line ? `${indentation} ${line}` : indentation;
            })
            .join('\n');
        lines.push(commentLines);
        lines.push(">");

        return lines;
    }

    private async generateStructuredContent(
        highlight: HighlightInfo,
        file: TFile,
        template?: string
    ): Promise<string[]> {
        const lines: string[] = [];

        if (isFileComment(highlight)) {
            lines.push(`> [!note] File comment`);
            lines.push(`> Source: [[${file.path}|${file.basename}]]`);
            lines.push("> ");
            if (highlight.comments && highlight.comments.length > 0) {
                for (const comment of highlight.comments) {
                    lines.push(...this.formatComment(comment, true));
                }
            }
            return lines;
        }

        if (template && (template.includes('{{highlightText}}') || template.includes('{{highlightBlockRef}}'))) {
                const highlightTemplate = this.extractHighlightTemplate(template);
                const blockIdRef = await this.createBlockIdRef(file, highlight, template);

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
            lines.push("> [!quote] HiNote");
            lines.push(`> ${highlight.text || ''}`);
            lines.push("> ");
        }

        if (highlight.comments && highlight.comments.length > 0) {
            for (const comment of highlight.comments) {
                lines.push(...this.formatComment(comment, false));
            }
        }

        return lines;
    }

    private async createBlockIdRef(
        file: TFile,
        highlight: HighlightInfo,
        template: string
    ): Promise<string> {
        if (typeof highlight.position !== 'number' || !template.includes('{{highlightBlockRef}}')) {
            return '';
        }

        try {
            const highlightLength = highlight.originalLength || highlight.text.length;
            return await this.highlightService.createBlockIdForHighlight(
                file,
                highlight.position,
                highlightLength
            ) || '';
        } catch (error) {
            console.error('[ExportService] Error creating block ID:', error);
            return '';
        }
    }

    private extractHighlightTemplate(template: string): string {
        let highlightTemplate = template;

        const commentBlockRegex = /\n>>\s*\[!note\]\+[\s\S]*?(?=\n>\s*$|\n\s*$|$)/g;
        highlightTemplate = highlightTemplate.replace(commentBlockRegex, '');

        highlightTemplate = highlightTemplate.replace(/\{\{commentContent\}\}/g, '');
        highlightTemplate = highlightTemplate.replace(/\{\{commentDate\}\}/g, '');

        highlightTemplate = highlightTemplate.replace(/\n{3,}/g, '\n\n');
        highlightTemplate = highlightTemplate.replace(/\n>\s*\n\s*$/g, '\n');

        return highlightTemplate.trim();
    }
}

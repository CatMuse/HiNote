import { App, TFile, CachedMetadata } from 'obsidian';
import { HighlightInfo } from '../types';

export interface ContextInfo {
    beforeContext: string;
    afterContext: string;
    sectionTitle?: string;
    filePath: string;
    fileName: string;
    fullContext: string;
}

export interface ContextOptions {
    // 上下文获取策略
    strategy: 'paragraph' | 'section' | 'surrounding' | 'smart';
    // 前后文行数（仅对 surrounding 策略有效）
    surroundingLines?: number;
    // 是否包含章节标题
    includeTitle?: boolean;
    // 最大上下文长度（字符数）
    maxLength?: number;
}

export class ContextService {
    constructor(private app: App) {}

    /**
     * 为高亮内容获取上下文信息
     */
    async getContextForHighlight(highlight: HighlightInfo, options: ContextOptions = {
        strategy: 'paragraph',
        includeTitle: true,
        maxLength: 2000
    }): Promise<ContextInfo | null> {
        if (!highlight.filePath) {
            return null;
        }

        const file = this.app.vault.getAbstractFileByPath(highlight.filePath);
        if (!file || !(file instanceof TFile)) {
            return null;
        }

        const content = await this.app.vault.read(file);
        const cache = this.app.metadataCache.getFileCache(file);

        switch (options.strategy) {
            case 'paragraph':
                return this.getParagraphContext(content, highlight, file, cache, options);
            case 'section':
                return this.getSectionContext(content, highlight, file, cache, options);
            case 'surrounding':
                return this.getSurroundingContext(content, highlight, file, options);
            case 'smart':
                return this.getSmartContext(content, highlight, file, cache, options);
            default:
                return this.getParagraphContext(content, highlight, file, cache, options);
        }
    }

    /**
     * 获取段落级别的上下文
     */
    private getParagraphContext(
        content: string, 
        highlight: HighlightInfo, 
        file: TFile, 
        cache: CachedMetadata | null,
        options: ContextOptions
    ): ContextInfo {
        const lines = content.split('\n');
        const highlightText = highlight.text;
        
        // 找到高亮文本所在的行
        let highlightLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(highlightText)) {
                highlightLineIndex = i;
                break;
            }
        }

        if (highlightLineIndex === -1) {
            return this.createContextInfo('', '', file, content);
        }

        // 找到段落边界（空行分隔）
        let paragraphStart = highlightLineIndex;
        let paragraphEnd = highlightLineIndex;

        // 向上找段落开始
        while (paragraphStart > 0 && lines[paragraphStart - 1].trim() !== '') {
            paragraphStart--;
        }

        // 向下找段落结束
        while (paragraphEnd < lines.length - 1 && lines[paragraphEnd + 1].trim() !== '') {
            paragraphEnd++;
        }

        const beforeContext = lines.slice(paragraphStart, highlightLineIndex).join('\n');
        const afterContext = lines.slice(highlightLineIndex + 1, paragraphEnd + 1).join('\n');
        const fullContext = lines.slice(paragraphStart, paragraphEnd + 1).join('\n');

        // 获取章节标题
        const sectionTitle = this.findSectionTitle(lines, highlightLineIndex);

        return this.createContextInfo(
            beforeContext, 
            afterContext, 
            file, 
            fullContext, 
            sectionTitle,
            options.maxLength
        );
    }

    /**
     * 获取章节级别的上下文
     */
    private getSectionContext(
        content: string, 
        highlight: HighlightInfo, 
        file: TFile, 
        cache: CachedMetadata | null,
        options: ContextOptions
    ): ContextInfo {
        if (!cache?.sections) {
            return this.getParagraphContext(content, highlight, file, cache, options);
        }

        const lines = content.split('\n');
        const highlightText = highlight.text;
        
        // 找到高亮文本的位置
        const highlightPosition = content.indexOf(highlightText);
        if (highlightPosition === -1) {
            return this.createContextInfo('', '', file, content);
        }

        // 找到包含高亮的章节
        const section = cache.sections.find(section => 
            section.position.start.offset <= highlightPosition &&
            section.position.end.offset >= highlightPosition
        );

        if (!section) {
            return this.getParagraphContext(content, highlight, file, cache, options);
        }

        // 获取章节内容
        const sectionContent = content.substring(
            section.position.start.offset,
            section.position.end.offset
        );

        const beforeContext = content.substring(
            section.position.start.offset,
            highlightPosition
        );

        const afterContext = content.substring(
            highlightPosition + highlightText.length,
            section.position.end.offset
        );

        // 获取章节标题
        const sectionTitle = this.findSectionTitle(lines, 
            this.getLineFromOffset(content, highlightPosition));

        return this.createContextInfo(
            beforeContext, 
            afterContext, 
            file, 
            sectionContent, 
            sectionTitle,
            options.maxLength
        );
    }

    /**
     * 获取指定行数的前后文
     */
    private getSurroundingContext(
        content: string, 
        highlight: HighlightInfo, 
        file: TFile, 
        options: ContextOptions
    ): ContextInfo {
        const lines = content.split('\n');
        const highlightText = highlight.text;
        const surroundingLines = options.surroundingLines || 3;
        
        // 找到高亮文本所在的行
        let highlightLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(highlightText)) {
                highlightLineIndex = i;
                break;
            }
        }

        if (highlightLineIndex === -1) {
            return this.createContextInfo('', '', file, content);
        }

        const startLine = Math.max(0, highlightLineIndex - surroundingLines);
        const endLine = Math.min(lines.length - 1, highlightLineIndex + surroundingLines);

        const beforeContext = lines.slice(startLine, highlightLineIndex).join('\n');
        const afterContext = lines.slice(highlightLineIndex + 1, endLine + 1).join('\n');
        const fullContext = lines.slice(startLine, endLine + 1).join('\n');

        const sectionTitle = this.findSectionTitle(lines, highlightLineIndex);

        return this.createContextInfo(
            beforeContext, 
            afterContext, 
            file, 
            fullContext, 
            sectionTitle,
            options.maxLength
        );
    }

    /**
     * 智能上下文获取（结合多种策略）
     */
    private getSmartContext(
        content: string, 
        highlight: HighlightInfo, 
        file: TFile, 
        cache: CachedMetadata | null,
        options: ContextOptions
    ): ContextInfo {
        // 首先尝试获取章节上下文
        const sectionContext = this.getSectionContext(content, highlight, file, cache, options);
        
        // 如果章节上下文太长，回退到段落上下文
        if (sectionContext.fullContext.length > (options.maxLength || 2000)) {
            return this.getParagraphContext(content, highlight, file, cache, options);
        }

        return sectionContext;
    }

    /**
     * 查找章节标题
     */
    private findSectionTitle(lines: string[], currentLine: number): string | undefined {
        // 向上查找最近的标题
        for (let i = currentLine; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('#')) {
                return line;
            }
        }
        return undefined;
    }

    /**
     * 从字符偏移量获取行号
     */
    private getLineFromOffset(content: string, offset: number): number {
        return content.substring(0, offset).split('\n').length - 1;
    }

    /**
     * 创建上下文信息对象
     */
    private createContextInfo(
        beforeContext: string, 
        afterContext: string, 
        file: TFile, 
        fullContext: string, 
        sectionTitle?: string,
        maxLength?: number
    ): ContextInfo {
        let finalFullContext = fullContext;
        
        // 如果上下文太长，进行截断
        if (maxLength && fullContext.length > maxLength) {
            const halfLength = Math.floor(maxLength / 2);
            const start = fullContext.substring(0, halfLength);
            const end = fullContext.substring(fullContext.length - halfLength);
            finalFullContext = `${start}\n\n... [内容已截断] ...\n\n${end}`;
        }

        return {
            beforeContext,
            afterContext,
            sectionTitle,
            filePath: file.path,
            fileName: file.name,
            fullContext: finalFullContext
        };
    }

    /**
     * 批量获取多个高亮的上下文
     */
    async getContextForMultipleHighlights(
        highlights: HighlightInfo[], 
        options: ContextOptions = { strategy: 'paragraph' }
    ): Promise<ContextInfo[]> {
        const contexts: ContextInfo[] = [];
        
        for (const highlight of highlights) {
            const context = await this.getContextForHighlight(highlight, options);
            if (context) {
                contexts.push(context);
            }
        }
        
        return contexts;
    }
}

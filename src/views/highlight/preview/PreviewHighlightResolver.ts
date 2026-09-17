import { MarkdownPostProcessorContext, TFile } from "obsidian";
import { HighlightInfo as HiNote, ScannedHighlight } from "../../../types/highlight";
import { HighlightRepository } from "../../../repositories/HighlightRepository";
import { HighlightCommentResolver } from "../../../services/highlight";
import { highlightColorStyle, isHighlightColor } from "../../../services/highlight/HighlightColor";

export type PreviewHighlight = HiNote & { line: number };

const BLOCK_TAGS = new Set([
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'div',
    'blockquote',
    'pre',
    'td',
    'th'
]);

/**
 * 解析阅读模式下可渲染的高亮数据。
 *
 * Preview renderer 只应该关心 DOM 渲染；这里集中处理存储匹配、评论补全和行号计算。
 */
export class PreviewHighlightResolver {
    private commentResolver: HighlightCommentResolver;

    constructor(highlightRepository: HighlightRepository) {
        this.commentResolver = new HighlightCommentResolver(highlightRepository);
    }

    enrichHighlightsWithComments(
        rawHighlights: ScannedHighlight[],
        file: TFile,
        content: string
    ): PreviewHighlight[] {
        return this.commentResolver.resolveHighlights(file, rawHighlights)
            .map(highlight => ({
                ...highlight,
                line: this.getLineForPosition(content, highlight.position)
            }));
    }

    findMatchingHighlight(
        text: string,
        mark: Element,
        rootElement: HTMLElement,
        context: MarkdownPostProcessorContext,
        highlightsWithComments: PreviewHighlight[]
    ): PreviewHighlight | null {
        const sectionInfo = this.getSectionInfo(mark, rootElement, context);
        const color = mark.getAttribute('data-highlight');
        const candidates = highlightsWithComments.filter(highlight =>
            highlight.text === text &&
            (!isHighlightColor(color) || highlight.syntax !== 'markdown' ||
                highlight.backgroundColor === highlightColorStyle(color))
        );

        if (!sectionInfo) {
            return candidates[0] || null;
        }

        return candidates.find(highlight =>
            highlight.line >= sectionInfo.lineStart &&
            highlight.line <= sectionInfo.lineEnd
        ) || null;
    }

    private getSectionInfo(
        mark: Element,
        rootElement: HTMLElement,
        context: MarkdownPostProcessorContext
    ): { lineStart: number; lineEnd: number } | null {
        let block = mark.parentElement;

        while (block && !this.isBlockElement(block) && block !== rootElement) {
            block = block.parentElement;
        }

        return block ? context.getSectionInfo(block) : null;
    }

    private isBlockElement(element: Element): boolean {
        return BLOCK_TAGS.has(element.tagName.toLowerCase());
    }

    private getLineForPosition(content: string, position: number): number {
        return content.substring(0, position).split('\n').length - 1;
    }

}

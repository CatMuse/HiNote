import { Plugin, TFile, MarkdownPostProcessorContext } from "obsidian";
import { CommentStore, HiNote, CommentItem } from "../../CommentStore";
import { HighlightService } from '../../services/HighlightService';
import { HighlightMatcher } from '../../utils/HighlightMatcher';
import { CommentWidgetHelper } from '../../components/comment/CommentWidgetHelper';

/**
 * 阅读模式下的批注小部件渲染器
 * 负责在阅读模式（Preview Mode）中渲染批注图标和工具提示
 */
export class PreviewWidgetRenderer {
    constructor(
        private plugin: Plugin,
        private commentStore: CommentStore,
        private highlightService: HighlightService
    ) {}

    /**
     * 处理阅读模式下的高亮渲染
     * 在 Markdown Post Processor 中调用
     */
    async processPreview(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
        const file = this.plugin.app.vault.getAbstractFileByPath(context.sourcePath);
        if (!(file instanceof TFile)) return;

        // 检查是否应该处理该文件
        if (!this.highlightService.shouldProcessFile(file)) return;

        // 查找高亮元素
        const marks = element.querySelectorAll('mark, span.highlight');
        if (marks.length === 0) return;

        // 获取该文件的所有高亮数据
        const content = await this.plugin.app.vault.cachedRead(file);
        const rawHighlights = this.highlightService.extractHighlights(content, file);

        if (rawHighlights.length === 0) return;

        // 预处理高亮：获取评论并计算行号
        const highlightsWithComments = this.enrichHighlightsWithComments(rawHighlights, file, content);

        if (highlightsWithComments.length === 0) return;

        // 遍历 DOM 元素进行匹配
        marks.forEach((mark) => {
            if (mark.hasAttribute('data-hi-note-processed')) return;
            
            const text = mark.textContent;
            if (!text) return;

            // 查找匹配的高亮
            const match = this.findMatchingHighlight(
                text, 
                mark, 
                element, 
                context, 
                highlightsWithComments
            );

            if (match) {
                mark.setAttribute('data-hi-note-processed', 'true');
                this.renderPreviewWidget(mark as HTMLElement, match);
            }
        });
    }

    /**
     * 为高亮添加评论信息和行号
     */
    private enrichHighlightsWithComments(
        rawHighlights: any[], 
        file: TFile, 
        content: string
    ): (HiNote & { line: number })[] {
        return rawHighlights
            .map(h => {
                // 创建 HiNote 对象
                const hiNote: HiNote = {
                    ...h,
                    id: h.id || `highlight-${Date.now()}-${h.position}`,
                    comments: h.comments || [],
                    position: h.position,
                    paragraphOffset: h.paragraphOffset || 0,
                    blockId: h.blockId,
                    paragraphId: h.paragraphId || `p-${h.paragraphOffset || 0}`,
                    createdAt: h.createdAt || Date.now(),
                    updatedAt: h.updatedAt || Date.now(),
                    text: h.text
                };
                
                // 获取评论，并使用存储中的高亮对象（包含正确的 ID）
                let storedHighlight: HiNote | null = null;
                let comments: CommentItem[] = [];
                
                if (hiNote.blockId) {
                    const blockComments = this.commentStore.getCommentsByBlockId(file, hiNote.blockId);
                    if (blockComments && blockComments.length > 0) {
                         const bestMatch = HighlightMatcher.findMatch(hiNote, blockComments);
                         if (bestMatch) {
                             storedHighlight = bestMatch;
                             comments = bestMatch.comments || [];
                         }
                    }
                } else {
                    const storedHighlights = this.commentStore.getHiNotes(hiNote);
                    if (storedHighlights && storedHighlights.length > 0) {
                        storedHighlight = storedHighlights[0];
                        comments = storedHighlight.comments || [];
                    }
                }
                
                // 使用存储中的 ID（如果存在），确保与侧边栏中的卡片 ID 一致
                return { 
                    ...hiNote, 
                    id: storedHighlight?.id || hiNote.id,
                    comments 
                };
            })
            .filter(h => h.comments && h.comments.length > 0)
            .map(h => {
                 // 计算行号
                 // @ts-ignore
                 const line = content.substring(0, h.position).split('\n').length - 1;
                 return { ...h, line };
            });
    }

    /**
     * 查找与 DOM 元素匹配的高亮
     */
    private findMatchingHighlight(
        text: string,
        mark: Element,
        element: HTMLElement,
        context: MarkdownPostProcessorContext,
        highlightsWithComments: (HiNote & { line: number })[]
    ): (HiNote & { line: number }) | null {
        // 查找包含该 mark 的块级元素
        let block = mark.parentElement;
        while (block && !this.isBlockElement(block) && block !== element) {
            block = block.parentElement;
        }
        
        let sectionInfo: { lineStart: number; lineEnd: number } | null = null;
        if (block) {
            sectionInfo = context.getSectionInfo(block);
        }

        // 根据是否有 section 信息进行匹配
        if (sectionInfo) {
            const section = sectionInfo; // 保存到常量以便在回调中使用
            return highlightsWithComments.find(h => 
                h.text === text && 
                h.line >= section.lineStart && 
                h.line <= section.lineEnd
            ) || null;
        } else {
            return highlightsWithComments.find(h => h.text === text) || null;
        }
    }

    /**
     * 判断元素是否为块级元素
     */
    private isBlockElement(el: Element): boolean {
        const tagName = el.tagName.toLowerCase();
        return ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div', 'blockquote', 'pre', 'td', 'th'].includes(tagName);
    }

    /**
     * 渲染阅读模式下的批注小部件
     */
    private renderPreviewWidget(mark: HTMLElement, highlight: HiNote): void {
        const widget = mark.createSpan({ cls: 'hi-note-widget hi-note-preview-widget' });
        const hasComments = !!(highlight.comments && highlight.comments.length > 0);
        
        // 使用辅助类创建按钮
        const button = CommentWidgetHelper.createButton(widget, hasComments);
        const iconContainer = button.querySelector('.hi-note-icon-container') as HTMLElement;
        
        if (hasComments && highlight.comments) {
            // 添加评论数量
            CommentWidgetHelper.addCommentCount(iconContainer, highlight.comments.length);

            // 创建工具提示
            const tooltip = CommentWidgetHelper.createTooltip(this.plugin.app, highlight);
            
            // 设置工具提示事件
            CommentWidgetHelper.setupTooltipEvents(button, widget, tooltip);
            
            // 设置点击事件
            CommentWidgetHelper.setupClickEvent(button, tooltip, () => 
                CommentWidgetHelper.openCommentPanel(this.plugin.app, highlight)
            );
            
            // 创建清理观察器
            CommentWidgetHelper.createCleanupObserver(widget, tooltip);
        }
    }
}

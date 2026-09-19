import { t } from '../../../i18n';
import { Notice } from 'obsidian';
import { isFileComment, type CommentItem, type HighlightInfo } from '../../../types/highlight';

export class HighlightCardClipboard {
    static copyHighlightContent(highlight: HighlightInfo, fileName?: string): void {
        try {
            const content = this.formatHighlightContent(highlight, fileName);

            navigator.clipboard.writeText(content).then(() => {
                new Notice(t('Copied'));
            }).catch(error => {
                console.error('复制内容失败:', error);
                new Notice(t('Failed to copy content'));
            });
        } catch (error) {
            console.error('复制高亮内容时出错:', error);
            new Notice(t('Failed to copy content'));
        }
    }

    private static formatHighlightContent(highlight: HighlightInfo, fileName?: string): string {
        const lines: string[] = [];
        const source = this.formatSourceLink(highlight, fileName);

        if (isFileComment(highlight)) {
            lines.push('> [!note] File comment');
            if (source) lines.push(`> Source: ${source}`);
            lines.push('>');
            for (const [index, comment] of (highlight.comments || []).entries()) {
                if (index > 0) lines.push('>');
                lines.push(...this.formatFileComment(comment));
            }
        } else {
            lines.push('> [!quote] HiNote');
            lines.push(...this.prefixLines(highlight.text || ''));
            if (source) {
                lines.push('>');
                lines.push(`> From: ${source}`);
            }
            for (const comment of highlight.comments || []) {
                lines.push('>');
                lines.push('>> [!note]+');
                lines.push(...this.prefixLines(comment.content, '>>'));
            }
        }

        return `${lines.join('\n')}\n\n`;
    }

    private static formatSourceLink(highlight: HighlightInfo, fileName?: string): string {
        if (!highlight.filePath) return '';
        const path = highlight.filePath.replace(/\.md$/i, '');
        const displayName = (fileName || path.split('/').pop() || path).replace(/\.md$/i, '');
        return `[[${path}|${displayName}]]`;
    }

    private static formatFileComment(comment: CommentItem): string[] {
        return this.prefixLines(comment.content, '>');
    }

    private static prefixLines(value: string, prefix: string = '>'): string[] {
        const lines = value.split('\n');
        return lines.length ? lines.map(line => line ? `${prefix} ${line}` : prefix) : [prefix];
    }
}

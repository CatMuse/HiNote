import { t } from '../../../i18n';
import { Notice } from 'obsidian';
import type { HighlightInfo } from '../../../types/highlight';

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
        let content = '> [!quote] HiNote\n';
        content += `> ${highlight.text}`;

        if (highlight.filePath) {
            const displayName = fileName || highlight.filePath.split('/').pop() || highlight.filePath;
            content += '\n> \n';
            content += `> From: [[${displayName}]]`;
        }

        return `${content}\n\n`;
    }
}

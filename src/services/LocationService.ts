import { MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import { HighlightInfo } from "../types";

export class LocationService {
    constructor(private app: any) {}

    /**
     * 跳转到指定的高亮位置
     */
    public async jumpToHighlight(highlight: HighlightInfo, currentFilePath: string) {
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        
        if (markdownLeaves.length === 0) {
            new Notice("未找到文档视图");
            return;
        }

        // 找到当前文件对应的编辑器视图
        const targetLeaf = this.findTargetLeaf(markdownLeaves, currentFilePath);
        if (!targetLeaf) {
            new Notice("未找到对应的编辑器视图");
            return;
        }

        try {
            await this.scrollToHighlight(targetLeaf, highlight);
        } catch (error) {
            console.error("定位失败:", error);
            new Notice("定位失败，请重试");
        }
    }

    private findTargetLeaf(leaves: WorkspaceLeaf[], filePath: string): WorkspaceLeaf | undefined {
        return leaves.find(leaf => {
            const view = leaf.view as MarkdownView;
            return view.file?.path === filePath;
        });
    }

    private async scrollToHighlight(leaf: WorkspaceLeaf, highlight: HighlightInfo) {
        // 先激活编辑器视图
        await this.app.workspace.setActiveLeaf(leaf, { focus: true });

        // 等待编辑器准备就绪
        await new Promise(resolve => setTimeout(resolve, 50));

        const markdownView = leaf.view as MarkdownView;
        const editor = markdownView.editor;
        const content = editor.getValue();
        
        const position = this.findHighlightPosition(content, highlight);
        
        if (position !== -1) {
            await this.scrollToPosition(editor, position);
        } else {
            new Notice("未找到高亮内容");
        }
    }

    private findHighlightPosition(content: string, highlight: HighlightInfo): number {
        // 尝试所有可能的高亮格式，允许文本前后有空格
        const highlightFormats = [
            new RegExp(`==\\s*${this.escapeRegExp(highlight.text)}\\s*==`),
            new RegExp(`<mark>\\s*${this.escapeRegExp(highlight.text)}\\s*</mark>`),
            new RegExp(`<span style="background:rgba\\(\\d+,\\s*\\d+,\\s*\\d+,\\s*[0-9.]+\\)">\\s*${this.escapeRegExp(highlight.text)}\\s*</span>`),
            new RegExp(`<span style="background:#[0-9a-fA-F]{3,6}">\\s*${this.escapeRegExp(highlight.text)}\\s*</span>`)
        ];

        // 如果有背景色，优先使用对应的格式
        if (highlight.backgroundColor) {
            highlightFormats.unshift(
                new RegExp(`<span style="background:${this.escapeRegExp(highlight.backgroundColor)}">\\s*${this.escapeRegExp(highlight.text)}\\s*</span>`)
            );
        }

        // 依次尝试每种格式
        for (const format of highlightFormats) {
            const match = format.exec(content);
            if (match) {
                return match.index;
            }
        }

        return -1;
    }

    private async scrollToPosition(editor: any, position: number) {
        const pos = editor.offsetToPos(position);
        
        // 1. 确保编辑器已准备就绪
        await new Promise(resolve => setTimeout(resolve, 50));

        // 2. 先将目标行滚动到视图中央
        editor.scrollIntoView({
            from: { line: pos.line, ch: 0 },
            to: { line: pos.line + 1, ch: 0 }
        }, true);  // 居中对齐

        // 3. 等待滚动完成
        await new Promise(resolve => setTimeout(resolve, 50));

        // 4. 调整位置，确保有足够上下文
        editor.scrollIntoView({
            from: { line: Math.max(0, pos.line - 3), ch: 0 },
            to: { line: Math.min(editor.lineCount() - 1, pos.line + 3), ch: 0 }
        }, true);

        // 5. 查找段落末尾并设置光标位置
        const nextLineNumber = this.findParagraphEnd(editor, pos.line);
        editor.setCursor({
            line: nextLineNumber + 1,
            ch: 0
        });
    }

    private findParagraphEnd(editor: any, startLine: number): number {
        let nextLineNumber = startLine;
        const totalLines = editor.lineCount();
        
        while (nextLineNumber < totalLines - 1) {
            const currentLine = editor.getLine(nextLineNumber);
            const nextLine = editor.getLine(nextLineNumber + 1);
            
            if (currentLine.trim() !== '' && nextLine.trim() === '') {
                break;
            }
            nextLineNumber++;
        }

        return nextLineNumber;
    }

    private escapeRegExp(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
} 
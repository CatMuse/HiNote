import { MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import { HighlightInfo } from "../types";

export class LocationService {
    constructor(private app: any) {}

    /**
     * 跳转到指定的高亮位置
     */
    public async jumpToHighlight(highlight: HighlightInfo, currentFilePath: string) {
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        
        // 找到当前文件对应的编辑器视图
        let targetLeaf: WorkspaceLeaf | null = this.findTargetLeaf(markdownLeaves, currentFilePath);
        
        // 如果没有找到对应的视图，尝试打开文件
        if (!targetLeaf) {
            try {
                // 先获取文件对象
                const file = this.app.vault.getAbstractFileByPath(currentFilePath);
                if (!file) {
                    new Notice("未找到文件");
                    return;
                }
                // 在新标签页中打开文件
                const newLeaf = await this.app.workspace.getLeaf('tab');
                if (!newLeaf) {
                    new Notice("无法创建新标签页");
                    return;
                }
                await newLeaf.openFile(file);
                targetLeaf = newLeaf;
            } catch (error) {
                console.error("打开文件失败:", error);
                new Notice("打开文件失败");
                return;
            }
        }

        // 再次检查确保 targetLeaf 不为 null
        if (!targetLeaf) {
            new Notice("无法打开文件视图");
            return;
        }

        try {
            await this.scrollToHighlight(targetLeaf, highlight);
        } catch (error) {
            console.error("定位失败:", error);
            new Notice("定位失败，请重试");
        }
    }

    private findTargetLeaf(leaves: WorkspaceLeaf[], filePath: string): WorkspaceLeaf | null {
        const leaf = leaves.find(leaf => {
            const view = leaf.view as MarkdownView;
            return view.file?.path === filePath;
        });
        return leaf || null;
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
            new RegExp(`<mark\\s+style="[^"]*?background(?:-color)?:\\s*(?:rgba\\(\\d+,\\s*\\d+,\\s*\\d+,\\s*[0-9.]+\\)|#[0-9a-fA-F]{3,8})[^"]*">\\s*${this.escapeRegExp(highlight.text)}\\s*</mark>`),
            new RegExp(`<span\\s+style="[^"]*?background(?:-color)?:\\s*(?:rgba\\(\\d+,\\s*\\d+,\\s*\\d+,\\s*[0-9.]+\\)|#[0-9a-fA-F]{3,8})[^"]*">\\s*${this.escapeRegExp(highlight.text)}\\s*</span>`)
        ];

        // 如果有背景色，优先使用对应的格式
        if (highlight.backgroundColor) {
            highlightFormats.unshift(
                new RegExp(`<(?:mark|span)\\s+style="[^"]*?background(?:-color)?:\\s*${this.escapeRegExp(highlight.backgroundColor)}[^"]*">\\s*${this.escapeRegExp(highlight.text)}\\s*</(?:mark|span)>`)
            );
        }

        // 依次尝试每种格式
        for (const format of highlightFormats) {
            const match = format.exec(content);
            if (match) {
                return match.index;
            }
        }

        // 如果上面的格式都没找到，尝试更宽松的匹配
        const looseFormat = new RegExp(`<mark[^>]*>\\s*${this.escapeRegExp(highlight.text)}\\s*</mark>`);
        const looseMatch = looseFormat.exec(content);
        if (looseMatch) {
            return looseMatch.index;
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
import { MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import { HighlightInfo } from "../types";
import { HighlightService } from "./HighlightService";

export class LocationService {
    private highlightService: HighlightService;

    constructor(private app: any) {
        this.highlightService = new HighlightService(app);
    }

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
        // 使用 HighlightService 的提取逻辑来定位高亮
        const highlights = this.highlightService.extractHighlights(content);
        
        // 找到与目标高亮匹配的项
        const matchedHighlight = highlights.find(h => {
            // 基本文本匹配
            if (h.text !== highlight.text) return false;
            
            // 如果有位置信息，检查位置是否在合理范围内
            if (highlight.position !== undefined && h.position !== undefined) {
                return Math.abs(h.position - highlight.position) < 10;
            }
            
            // 如果没有位置信息，只比较文本
            return true;
        });

        return matchedHighlight?.position ?? -1;
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
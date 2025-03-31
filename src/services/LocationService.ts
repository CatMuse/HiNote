import { MarkdownView, Notice, WorkspaceLeaf, EditorSelection } from "obsidian";
import { HighlightInfo } from "../types";

export class LocationService {
    constructor(private app: any) {}

    /**
     * 跳转到指定的高亮位置
     */
    public async jumpToHighlight(highlight: HighlightInfo, currentFilePath: string) {
        // 1. 打开或激活文件
        const targetLeaf = await this.openOrActivateFile(currentFilePath);
        if (!targetLeaf) return;

        // 2. 定位高亮内容，传递 position 参数
        await this.locateAndHighlightText(targetLeaf, highlight.text, highlight.position);
    }

    /**
     * 打开或激活指定文件，但不聚焦
     */
    private async openOrActivateFile(filePath: string): Promise<WorkspaceLeaf | null> {
        // 先查找已打开的文件
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");
        let targetLeaf = markdownLeaves.find((leaf: WorkspaceLeaf) => {
            const view = leaf.view as MarkdownView;
            return view.file?.path === filePath;
        });
        
        // 如果文件未打开，则打开它
        if (!targetLeaf) {
            try {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (!file) {
                    new Notice("未找到文件");
                    return null;
                }
                
                targetLeaf = await this.app.workspace.getLeaf('tab');
                await targetLeaf.openFile(file);
            } catch (error) {
                new Notice("打开文件失败");
                return null;
            }
        }
        
        // 激活编辑器视图，但不聚焦
        await this.app.workspace.setActiveLeaf(targetLeaf, { focus: false });
        return targetLeaf;
    }

    /**
     * 在编辑器中定位并高亮文本
     */
    private async locateAndHighlightText(leaf: WorkspaceLeaf, text: string, position?: number) {
        // 确保编辑器已准备就绪
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const markdownView = leaf.view as MarkdownView;
        const editor = markdownView.editor;
        const content = editor.getValue();
        

        
        let textPosition = -1;
        let allMatches: number[] = [];
        
        // 找出所有匹配项
        let searchPos = 0;
        let foundPos = -1;
        while ((foundPos = content.indexOf(text, searchPos)) !== -1) {
            allMatches.push(foundPos);
            searchPos = foundPos + 1;
        }
        

        
        // 如果提供了 position，则优先使用它
        if (position !== undefined && position >= 0) {

            
            // 首先检查精确匹配
            if (content.substring(position, position + text.length) === text) {

                textPosition = position;
            } else {
                // 如果没有精确匹配，则找最接近的匹配项
                if (allMatches.length > 0) {
                    // 找到与指定位置最接近的匹配项
                    let closestMatch = allMatches[0];
                    let minDistance = Math.abs(position - closestMatch);
                    
                    for (const match of allMatches) {
                        const distance = Math.abs(position - match);
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestMatch = match;
                        }
                    }
                    

                    textPosition = closestMatch;
                }
            }
        }
        
        // 如果没有找到匹配项，则使用第一个匹配项
        if (textPosition === -1) {
            if (allMatches.length > 0) {

                textPosition = allMatches[0];
            } else {

                new Notice("未找到高亮内容");
                return;
            }
        }
        
        // 将文本位置转换为编辑器位置
        const start = editor.offsetToPos(textPosition);
        const end = editor.offsetToPos(textPosition + text.length);
        

        
        // 1. 选中文本
        editor.setSelection(start, end);
        
        // 2. 滚动到目标位置，并确保选中内容在编辑器中间位置显示
        editor.scrollIntoView({from: start, to: end}, true);
        
        // 3. 聚焦编辑器，确保用户可以看到选中内容
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
    }

} 
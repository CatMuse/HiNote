import { Editor, TFile, App, MarkdownView } from 'obsidian';

/**
 * 处理 Block ID 相关操作的服务
 */
export class BlockIdService {
    constructor(private app: App) {}

    /**
     * 获取或生成 Block ID
     * 如果行尾已有 Block ID，则返回现有的
     * 如果没有，则生成一个新的并添加到行尾
     * 
     * @param editor 编辑器实例
     * @param line 行号
     * @returns 块ID字符串
     */
    public getOrCreateBlockId(editor: Editor, line: number): string {
        const lineText = editor.getLine(line);
        const blockIdMatch = lineText.match(/\^([a-zA-Z0-9-]+)$/);
        
        if (blockIdMatch) {
            return blockIdMatch[1];
        }
        
        // 如果没有 Block ID，生成一个并添加到行尾
        // 使用时间戳+随机字符的组合确保唯一性
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substr(2, 5);
        const newBlockId = `${timestamp}-${randomPart}`;
        
        // 处理行尾空格，先去除所有行尾空格，然后只添加一个空格
        const trimmedLineText = lineText.trimEnd();
        editor.setLine(line, `${trimmedLineText} ^${newBlockId}`);
        return newBlockId;
    }

    /**
     * 从文本中提取 Block ID
     * 
     * @param text 包含 Block ID 的文本
     * @returns Block ID 或 undefined
     */
    public extractBlockId(text: string): string | undefined {
        const blockIdMatch = text.match(/\^([a-zA-Z0-9-]+)$/);
        return blockIdMatch ? blockIdMatch[1] : undefined;
    }

    /**
     * 根据位置获取段落的 Block ID
     * 
     * @param file 文件
     * @param position 文本位置
     * @returns 完整的段落引用 (filePath#^blockId) 或 undefined
     */
    public getParagraphBlockId(file: TFile, position: number): string | undefined {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.sections) return undefined;
        
        // 找到包含该位置的段落
        const section = cache.sections.find(section => 
            section.position.start.offset <= position &&
            section.position.end.offset >= position
        );
        
        // 如果找到段落且段落有 ID，返回完整引用
        return section?.id ? `${file.path}#^${section.id}` : undefined;
    }

    /**
     * 为指定位置的段落创建 Block ID（如果不存在）
     * 
     * @param file 文件
     * @param startPosition 高亮起始位置
     * @param endPosition 高亮结束位置（可选）
     * @returns 完整的段落引用 (filePath#^blockId)
     */
    public async createParagraphBlockId(file: TFile, startPosition: number, endPosition?: number): Promise<string> {
        // 先检查是否已有 Block ID
        const existingId = this.getParagraphBlockId(file, startPosition);
        if (existingId) return existingId;
        
        // 打开文件并获取编辑器
        const leaf = this.app.workspace.getLeaf();
        await leaf.openFile(file, { active: false });
        const view = leaf.view as MarkdownView;
        const editor = view.editor;
        
        // 获取位置对应的行号
        const startPos = editor.offsetToPos(startPosition);
        
        // 找到包含高亮内容的段落的结束行
        let endLine = startPos.line;
        const cache = this.app.metadataCache.getFileCache(file);
        
        if (cache?.sections) {
            // 如果提供了结束位置，则找到包含整个高亮的段落
            const position = endPosition || startPosition;
            
            // 先尝试找到包含结束位置的段落
            const section = cache.sections.find(section => 
                section.position.start.offset <= position &&
                section.position.end.offset >= position
            );
            
            if (section) {
                // 使用段落的结束位置
                const endPos = editor.offsetToPos(section.position.end.offset);
                endLine = endPos.line;
                
                // 记录调试信息
                console.debug(`[BlockIdService] 找到包含高亮的段落，结束行: ${endLine}`);
            }
        }
        
        // 创建 Block ID 在段落的结束行
        const blockId = this.getOrCreateBlockId(editor, endLine);
        
        // 保存文件
        await this.app.vault.modify(file, editor.getValue());
        
        return `${file.path}#^${blockId}`;
    }

    /**
     * 检查文本是否包含有效的 Block ID
     * 
     * @param text 要检查的文本
     * @returns 是否包含有效的 Block ID
     */
    public hasValidBlockId(text: string): boolean {
        return /\^[a-zA-Z0-9-]+$/.test(text);
    }
}

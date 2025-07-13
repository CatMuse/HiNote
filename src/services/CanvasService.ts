import { TFile, Vault } from 'obsidian';

/**
 * Canvas 文件服务，用于解析 Canvas 文件并提取文件节点
 */
export class CanvasService {
    private vault: Vault;

    constructor(vault: Vault) {
        this.vault = vault;
    }

    /**
     * 解析 Canvas 文件，提取所有文件节点的路径
     * @param file Canvas 文件
     * @returns 文件路径数组
     */
    async parseCanvasFile(file: TFile): Promise<string[]> {
        try {
            // 读取 Canvas 文件内容
            const content = await this.vault.read(file);
            
            // 解析 JSON 内容
            const canvasData = JSON.parse(content);
            
            // 提取所有文件节点
            const filePaths: string[] = [];
            
            if (canvasData && canvasData.nodes) {
                for (const node of canvasData.nodes) {
                    // 检查是否是文件节点
                    if (node.type === 'file' && node.file) {
                        filePaths.push(node.file);
                    }
                }
            }
            
            return filePaths;
        } catch (error) {
            console.error('解析 Canvas 文件失败:', error);
            return [];
        }
    }
}

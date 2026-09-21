import { App, TFile, Notice } from "obsidian";
import { HighlightInfo, CommentItem } from "../../../types/highlight";
import { ExportService } from "../../../services/ExportService";
import { t } from "../../../i18n";

/**
 * 导出管理器
 * 职责：
 * 1. 管理导出按钮的创建和事件
 * 2. 处理导出为笔记的逻辑
 * 3. 处理导出为图片的逻辑
 */
export class ExportManager {
    constructor(
        private app: App,
        private exportService: ExportService
    ) {}

    /**
     * 处理导出按钮点击
     * @param currentFile 当前文件
     */
    async exportCurrentFile(currentFile: TFile | null): Promise<void> {
        if (!currentFile) {
            new Notice(t("Please open a file first."));
            return;
        }

        try {
            const newFile = await this.exportService.exportHighlightsToNote(currentFile);
            new Notice(t("Successfully exported highlights to: ") + newFile.path);
            
            // 打开新创建的文件
            const leaf = this.app.workspace.getLeaf();
            await leaf.openFile(newFile);
        } catch (error) {
            new Notice(t("Failed to export highlights: ") + error.message);
        }
    }

    /**
     * 导出高亮为图片
     * @param highlight 要导出的高亮
     */
    async exportHighlightAsImage(highlight: HighlightInfo & { comments?: CommentItem[] }): Promise<void> {
        try {
            // 动态导入 html2canvas
            const html2canvas = (await import('html2canvas')).default;
            const { ExportPreviewModal } = await import('../../../templates/ExportModal');
            new ExportPreviewModal(this.app, highlight, html2canvas).open();
        } catch (error) {
            console.error('[ExportManager] Error exporting as image:', error);
            new Notice(t("Export failed: Failed to load necessary components."));
        }
    }

    /**
     * 销毁导出管理器
     */
    destroy(): void {
        // Toolbar buttons are owned by the view Component lifecycle.
    }
}

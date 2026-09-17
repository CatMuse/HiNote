import { TFile, App } from 'obsidian';
import { HighlightInfo } from '../../../types/highlight';
import { CanvasService } from '../../../services/CanvasService';
import { HighlightDataService } from '../../../services/highlight';

/**
 * Canvas 高亮处理器
 * 负责处理 Canvas 文件中的高亮显示
 */
export class CanvasHighlightProcessor {
    private app: App;
    private canvasService: CanvasService;
    private highlightDataService: HighlightDataService;
    
    constructor(
        app: App,
        canvasService: CanvasService,
        highlightDataService: HighlightDataService
    ) {
        this.app = app;
        this.canvasService = canvasService;
        this.highlightDataService = highlightDataService;
    }
    
    async processCanvasFile(file: TFile): Promise<HighlightInfo[]> {
        const paths = await this.canvasService.parseCanvasFile(file);
        const highlights: HighlightInfo[] = [];
        for (const path of paths) {
            const source = this.app.vault.getAbstractFileByPath(path);
            if (source instanceof TFile) highlights.push(...await this.highlightDataService.loadFileHighlights(source));
        }
        return this.markAsCanvasHighlights(highlights, file);
    }

    private markAsCanvasHighlights(highlights: HighlightInfo[], canvasFile: TFile): HighlightInfo[] {
        return highlights.map(highlight => ({
            ...highlight,
            isFromCanvas: true,
            canvasSource: canvasFile.path,
            isGlobalSearch: true // 标记为全局搜索结果，这样会显示文件名
        }));
    }
}

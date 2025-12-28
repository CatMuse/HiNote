import { TFile, App } from 'obsidian';
import { HighlightInfo } from '../../types';
import { CanvasService } from '../../services/CanvasService';
import { HighlightDataService } from '../../services/highlight/HighlightDataService';

/**
 * Canvas 高亮处理器
 * 负责处理 Canvas 文件中的高亮显示
 */
export class CanvasHighlightProcessor {
    private app: App;
    private canvasService: CanvasService;
    private highlightDataService: HighlightDataService;
    
    // 回调函数
    private onShowLoading: (() => void) | null = null;
    private onHideLoading: (() => void) | null = null;
    private onShowError: ((message: string) => void) | null = null;
    private onShowEmpty: ((message: string) => void) | null = null;
    
    constructor(
        app: App,
        canvasService: CanvasService,
        highlightDataService: HighlightDataService
    ) {
        this.app = app;
        this.canvasService = canvasService;
        this.highlightDataService = highlightDataService;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onShowLoading?: () => void;
        onHideLoading?: () => void;
        onShowError?: (message: string) => void;
        onShowEmpty?: (message: string) => void;
    }) {
        if (callbacks.onShowLoading) {
            this.onShowLoading = callbacks.onShowLoading;
        }
        if (callbacks.onHideLoading) {
            this.onHideLoading = callbacks.onHideLoading;
        }
        if (callbacks.onShowError) {
            this.onShowError = callbacks.onShowError;
        }
        if (callbacks.onShowEmpty) {
            this.onShowEmpty = callbacks.onShowEmpty;
        }
    }
    
    /**
     * 处理 Canvas 文件
     * 只加载 Canvas 中引用的文件的高亮
     */
    async processCanvasFile(file: TFile): Promise<HighlightInfo[]> {
        // 显示加载指示器
        if (this.onShowLoading) {
            this.onShowLoading();
        }
        
        try {
            // 1. 解析 Canvas 文件，获取所有文件路径
            const filePaths = await this.canvasService.parseCanvasFile(file);
            
            if (filePaths.length === 0) {
                // 如果没有文件节点，显示提示
                if (this.onShowEmpty) {
                    this.onShowEmpty('There are no file nodes in the current Canvas.');
                }
                return [];
            }
            
            // 2. 只加载 Canvas 中引用的文件的高亮
            const allHighlights: HighlightInfo[] = [];
            
            for (const filePath of filePaths) {
                const targetFile = this.app.vault.getAbstractFileByPath(filePath);
                if (targetFile instanceof TFile) {
                    // 加载该文件的高亮
                    const fileHighlights = await this.highlightDataService.loadFileHighlights(targetFile);
                    
                    // 添加文件信息
                    const highlightsWithFileInfo = fileHighlights.map(h => ({
                        ...h,
                        fileName: targetFile.basename,
                        filePath: targetFile.path,
                        fileIcon: 'file-text'
                    }));
                    
                    allHighlights.push(...highlightsWithFileInfo);
                }
            }
            
            // 3. 标记为 Canvas 高亮
            return this.markAsCanvasHighlights(allHighlights, file);
            
        } catch (error) {
            console.error('处理 Canvas 文件失败:', error);
            if (this.onShowError) {
                this.onShowError('处理 Canvas 文件时出错');
            }
            return [];
        } finally {
            // 隐藏加载指示器
            if (this.onHideLoading) {
                this.onHideLoading();
            }
        }
    }
    
    /**
     * 标记高亮为 Canvas 来源
     */
    private markAsCanvasHighlights(highlights: HighlightInfo[], canvasFile: TFile): HighlightInfo[] {
        return highlights.map(highlight => ({
            ...highlight,
            isFromCanvas: true,
            canvasSource: canvasFile.path,
            isGlobalSearch: true // 标记为全局搜索结果，这样会显示文件名
        }));
    }
}

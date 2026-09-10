import { TFile } from "obsidian";
import { HighlightService } from "../../services/HighlightService";
import CommentPlugin from "../../../main";
import { LicenseManager } from "../../services/LicenseManager";
import { FileListDataSource } from "./FileListDataSource";
import { FileListItemRenderer } from "./FileListItemRenderer";

/**
 * 文件列表管理器
 * 负责管理文件列表的创建、更新和交互
 */
export class FileListManager {
    private container: HTMLElement;
    private dataSource: FileListDataSource;
    private itemRenderer: FileListItemRenderer;
    
    // 回调函数
    private onFileSelect: ((file: TFile | null) => void) | null = null;
    private onFlashcardModeToggle: ((enabled: boolean) => void) | null = null;
    private onAllHighlightsSelect: (() => void) | null = null;
    private onRefreshView: (() => Promise<void>) | null = null;
    
    // 状态
    private currentFile: TFile | null = null;
    private isFlashcardMode: boolean = false;
    private isMobileView: boolean = false;
    private isSmallScreen: boolean = false;
    private isDraggedToMainView: boolean = false;
    
    constructor(
        container: HTMLElement,
        plugin: CommentPlugin,
        highlightService: HighlightService,
        _licenseManager: LicenseManager
    ) {
        this.container = container;
        this.dataSource = new FileListDataSource(plugin, highlightService);
        this.itemRenderer = new FileListItemRenderer({
            plugin,
            dataSource: this.dataSource,
            getState: () => ({
                currentFile: this.currentFile,
                isFlashcardMode: this.isFlashcardMode,
                isDraggedToMainView: this.isDraggedToMainView
            }),
            onFileSelect: () => this.onFileSelect,
            onFlashcardModeToggle: () => this.onFlashcardModeToggle,
            onAllHighlightsSelect: () => this.onAllHighlightsSelect
        });
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onFileSelect?: (file: TFile | null) => void;
        onFlashcardModeToggle?: (enabled: boolean) => void;
        onAllHighlightsSelect?: () => void;
        onRefreshView?: () => Promise<void>;
    }) {
        if (callbacks.onFileSelect) {
            this.onFileSelect = callbacks.onFileSelect;
        }
        if (callbacks.onFlashcardModeToggle) {
            this.onFlashcardModeToggle = callbacks.onFlashcardModeToggle;
        }
        if (callbacks.onAllHighlightsSelect) {
            this.onAllHighlightsSelect = callbacks.onAllHighlightsSelect;
        }
        if (callbacks.onRefreshView) {
            this.onRefreshView = callbacks.onRefreshView;
        }
    }
    
    /**
     * 更新状态
     */
    updateState(state: {
        currentFile?: TFile | null;
        isFlashcardMode?: boolean;
        isMobileView?: boolean;
        isSmallScreen?: boolean;
        isDraggedToMainView?: boolean;
    }) {
        if (state.currentFile !== undefined) {
            this.currentFile = state.currentFile;
        }
        if (state.isFlashcardMode !== undefined) {
            this.isFlashcardMode = state.isFlashcardMode;
        }
        if (state.isMobileView !== undefined) {
            this.isMobileView = state.isMobileView;
        }
        if (state.isSmallScreen !== undefined) {
            this.isSmallScreen = state.isSmallScreen;
        }
        if (state.isDraggedToMainView !== undefined) {
            this.isDraggedToMainView = state.isDraggedToMainView;
        }
    }
    
    /**
     * 创建或更新文件列表
     * @param forceRefresh 是否强制刷新（清除缓存并重新获取）
     */
    async updateFileList(forceRefresh: boolean = false) {
        // 如果强制刷新，清除缓存
        if (forceRefresh) {
            this.invalidateCache();
        }
        
        // 如果文件列表已经存在且不是强制刷新，只更新选中状态
        if (this.container.children.length > 0 && !forceRefresh) {
            this.updateFileListSelection();
            return;
        }

        // 创建或重新创建文件列表
        await this.createFileList();
    }
    
    /**
     * 创建文件列表
     */
    private async createFileList() {
        this.container.empty();
        
        // 创建文件列表标题
        const titleContainer = this.container.createDiv({
            cls: "highlight-file-list-header"
        });

        const titleEl = titleContainer.createDiv({
            text: "HiNote",
            cls: "highlight-file-list-title"
        });
        
        // 添加点击刷新功能
        titleEl.setCssProps({ cursor: 'pointer' });
        titleEl.addEventListener("click", () => {
            void this.refreshFromTitle();
        });

        // 创建文件列表
        const fileList = this.container.createDiv({
            cls: "highlight-file-list"
        });

        // 添加"全部"选项
        this.itemRenderer.createAllHighlightsItem(fileList);

        // 添加闪卡选项
        this.itemRenderer.createFlashcardItem(fileList);

        // 添加分隔线
        fileList.createDiv({
            cls: "highlight-file-list-separator"
        });

        // 获取所有包含高亮的文件并创建列表项
        const files = await this.dataSource.getFilesWithHighlights();
        this.itemRenderer.updateAllHighlightsCount(fileList);

        for (const file of files) {
            await this.itemRenderer.createFileItem(fileList, file);
        }
    }

    private async refreshFromTitle(): Promise<void> {
        // 刷新文件列表
        await this.updateFileList(true);
        // 刷新主视图的高亮卡片
        if (this.onRefreshView) {
            await this.onRefreshView();
        }
    }
    
    /**
     * 更新文件列表的选中状态
     */
    updateFileListSelection() {
        this.itemRenderer.updateSelection(this.container);
    }
    
    /**
     * 清除缓存
     */
    invalidateCache(): void {
        this.dataSource.invalidateCache();
    }
    
    /**
     * 清理资源
     */
    destroy() {
        this.itemRenderer.destroy();
        this.container.empty();
        this.onFileSelect = null;
        this.onFlashcardModeToggle = null;
        this.onAllHighlightsSelect = null;
        this.onRefreshView = null;
    }
}

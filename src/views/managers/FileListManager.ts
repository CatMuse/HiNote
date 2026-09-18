import { t } from '../../i18n';
import type { ViewState } from '../hinote/ViewState';
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
    private onFavoritesSelect: (() => void) | null = null;
    private onAllHighlightsSelect: (() => void) | null = null;
    private onRefreshView: (() => Promise<void>) | null = null;
    private refreshPending: Promise<void> | null = null;
    
    private generation = 0;
    private disposed = false;
    private dirty = true;
    private pending: Promise<void> | null = null;
    private selectionKey: string | null = null;

    constructor(
        container: HTMLElement,
        plugin: CommentPlugin,
        highlightService: HighlightService,
        _licenseManager: LicenseManager,
        private state: ViewState
    ) {
        this.container = container;
        this.dataSource = new FileListDataSource(plugin, highlightService);
        this.itemRenderer = new FileListItemRenderer({
            plugin,
            dataSource: this.dataSource,
            getState: () => ({
                currentFile: this.state.currentFile,
                isDraggedToMainView: this.state.isDraggedToMainView,
                isAllHighlights: this.state.isInAllHighlightsView(),
                isFavorites: this.state.page.kind === 'favorites'
            }),
            onFileSelect: () => this.onFileSelect,
            onAllHighlightsSelect: () => this.onAllHighlightsSelect,
            onFavoritesSelect: () => this.onFavoritesSelect
        });
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onFileSelect?: (file: TFile | null) => void;
        onAllHighlightsSelect?: () => void;
        onFavoritesSelect?: () => void;
        onRefreshView?: () => Promise<void>;
    }) {
        if (callbacks.onFavoritesSelect) this.onFavoritesSelect = callbacks.onFavoritesSelect;
        if (callbacks.onFileSelect) {
            this.onFileSelect = callbacks.onFileSelect;
        }
        if (callbacks.onRefreshView) this.onRefreshView = callbacks.onRefreshView;
        if (callbacks.onAllHighlightsSelect) {
            this.onAllHighlightsSelect = callbacks.onAllHighlightsSelect;
        }
    }
    
    /**
     * 创建或更新文件列表
     * @param forceRefresh 是否强制刷新（清除缓存并重新获取）
     */
    async updateFileList(forceRefresh = false): Promise<void> {
        if (this.disposed) return;
        if (forceRefresh) this.invalidateCache();
        if (this.pending) { await this.pending; if (this.dirty && !this.disposed) await this.updateFileList(); return; }
        if (!this.dirty && this.container.children.length) { this.updateFileListSelection(); return; }
        const generation = this.generation;
        this.pending = this.createFileList(generation);
        try { await this.pending; if (generation === this.generation) this.dirty = false; }
        finally { this.pending = null; }
    }

    /**
     * 创建文件列表
     */
    private async createFileList(generation: number) {
        this.selectionKey = null;
        this.container.empty();
        
        // 创建文件列表标题
        const titleContainer = this.container.createDiv({
            cls: "highlight-file-list-header"
        });

        const title = titleContainer.createDiv({ text: 'HiNote', cls: 'highlight-file-list-title', attr: {
            role: 'button', tabindex: '0', title: t('Refresh view'), 'aria-label': `HiNote: ${t('Refresh view')}`
        }});
        const refresh = () => { void this.refreshFromTitle().catch(error => console.error('[HiNote] Refresh failed:', error)); };
        title.addEventListener('click', refresh);
        title.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refresh(); }
        });

        // 创建文件列表
        const fileList = this.container.createDiv({
            cls: "highlight-file-list"
        });

        // 添加"全部"选项
        this.itemRenderer.createAllHighlightsItem(fileList);
        this.itemRenderer.createFavoritesItem(fileList);

        // 添加分隔线
        fileList.createDiv({
            cls: "highlight-file-list-separator"
        });

        // 获取所有包含高亮的文件并创建列表项
        const files = await this.dataSource.getFilesWithHighlights();
        if (this.disposed || generation !== this.generation) return;
        this.itemRenderer.updateAllHighlightsCount(fileList);

        for (const file of files) {
            if (this.disposed || generation !== this.generation) return;
            await this.itemRenderer.createFileItem(fileList, file);
        }
        if (!this.disposed && generation === this.generation) { this.selectionKey = null; this.updateFileListSelection(); }
    }

    private refreshFromTitle(): Promise<void> {
        if (this.disposed) return Promise.resolve();
        if (this.refreshPending) return this.refreshPending;
        this.refreshPending = (async () => {
            await this.updateFileList(true);
            if (!this.disposed) await this.onRefreshView?.();
        })().finally(() => { this.refreshPending = null; });
        return this.refreshPending;
    }

    /**
     * 更新文件列表的选中状态
     */
    updateFileListSelection() {
        const key = `${this.state.page.kind}:${this.state.currentFile?.path || ''}`;
        if (this.selectionKey === key) return;
        this.selectionKey = key;
        this.itemRenderer.updateSelection(this.container);
    }
    
    /**
     * 清除缓存
     */
    invalidateCache(): void {
        this.dirty = true;
        this.generation++;
        this.dataSource.invalidateCache();
    }
    
    /**
     * 清理资源
     */
    destroy() {
        this.disposed = true;
        this.generation++;
        this.container.empty();
        this.onFileSelect = null;
        this.onAllHighlightsSelect = null;
        this.onFavoritesSelect = null;
        this.onRefreshView = null;
    }
}

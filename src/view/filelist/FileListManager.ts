import { TFile, setIcon } from "obsidian";
import { t } from "../../i18n";
import { HighlightService } from "../../services/HighlightService";
import CommentPlugin from "../../../main";
import { FlashcardComponent } from "../../flashcard/components/FlashcardComponent";
import { LicenseManager } from "../../services/LicenseManager";

/**
 * 文件列表管理器
 * 负责管理文件列表的创建、更新和交互
 */
export class FileListManager {
    private container: HTMLElement;
    private plugin: CommentPlugin;
    private highlightService: HighlightService;
    private licenseManager: LicenseManager;
    
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
    
    // 缓存
    private cachedFiles: TFile[] | null = null;
    private cachedFileCounts: Map<string, number> | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_EXPIRY = 60000; // 1分钟缓存
    
    constructor(
        container: HTMLElement,
        plugin: CommentPlugin,
        highlightService: HighlightService,
        licenseManager: LicenseManager
    ) {
        this.container = container;
        this.plugin = plugin;
        this.highlightService = highlightService;
        this.licenseManager = licenseManager;
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
        const titleContainer = this.container.createEl("div", {
            cls: "highlight-file-list-header"
        });

        const titleEl = titleContainer.createEl("div", {
            text: "HiNote",
            cls: "highlight-file-list-title"
        });
        
        // 添加点击刷新功能
        titleEl.style.cursor = 'pointer';
        titleEl.addEventListener("click", async () => {
            // 刷新文件列表
            await this.updateFileList(true);
            // 刷新主视图的高亮卡片
            if (this.onRefreshView) {
                await this.onRefreshView();
            }
        });

        // 创建文件列表
        const fileList = this.container.createEl("div", {
            cls: "highlight-file-list"
        });

        // 添加"全部"选项
        await this.createAllHighlightsItem(fileList);

        // 添加闪卡选项
        await this.createFlashcardItem(fileList);

        // 添加分隔线
        fileList.createEl("div", {
            cls: "highlight-file-list-separator"
        });

        // 获取所有包含高亮的文件并创建列表项
        const files = await this.getFilesWithHighlights();
        for (const file of files) {
            await this.createFileItem(fileList, file);
        }
    }
    
    /**
     * 创建"全部高亮"选项
     */
    private async createAllHighlightsItem(fileList: HTMLElement) {
        const allFilesItem = fileList.createEl("div", {
            cls: `highlight-file-item highlight-file-item-all ${this.currentFile === null && !this.isFlashcardMode ? 'is-active' : ''}`
        });

        // 创建左侧内容容器
        const allFilesLeft = allFilesItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 创建"全部"图标
        const allIcon = allFilesLeft.createEl("span", {
            cls: "highlight-file-item-icon"
        });
        setIcon(allIcon, 'square-library');

        // 创建"全部"文本
        allFilesLeft.createEl("span", {
            text: t("All Highlight"),
            cls: "highlight-file-item-name"
        });

        // 获取所有文件的高亮总数
        const totalHighlights = await this.getTotalHighlightsCount();
        
        // 创建高亮数量标签
        allFilesItem.createEl("span", {
            text: `${totalHighlights}`,
            cls: "highlight-file-item-count"
        });

        // 添加点击事件
        allFilesItem.addEventListener("click", async () => {
            if (this.onAllHighlightsSelect) {
                this.onAllHighlightsSelect();
            }
        });
    }
    
    /**
     * 创建闪卡选项
     */
    private async createFlashcardItem(fileList: HTMLElement) {
        const flashcardItem = fileList.createEl("div", {
            cls: `highlight-file-item highlight-file-item-flashcard ${this.isFlashcardMode ? 'is-active' : ''}`
        });

        const flashcardLeft = flashcardItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 添加图标
        const flashcardIcon = flashcardLeft.createEl("span", {
            cls: "highlight-file-item-icon"
        });
        setIcon(flashcardIcon, 'book-heart');

        flashcardLeft.createEl("span", {
            text: t("HiCard"),
            cls: "highlight-file-item-name"
        });

        // 创建卡片数量标签
        const flashcardCount = flashcardItem.createEl("span", {
            cls: "highlight-file-item-count"
        });

        // 更新卡片数量
        const updateFlashcardCount = () => {
            const totalCards = this.plugin.fsrsManager.getTotalCardsCount();
            flashcardCount.textContent = `${totalCards}`;
        };

        // 初始化卡片数量
        updateFlashcardCount();

        // 监听闪卡变化事件
        this.plugin.eventManager.on('flashcard:changed', () => {
            updateFlashcardCount();
        });

        // 添加点击事件
        flashcardItem.addEventListener("click", async () => {
            if (this.onFlashcardModeToggle) {
                this.onFlashcardModeToggle(true);
            }
        });
    }
    
    /**
     * 创建文件项
     */
    private async createFileItem(fileList: HTMLElement, file: TFile) {
        const fileItem = fileList.createEl("div", {
            cls: `highlight-file-item ${this.currentFile?.path === file.path ? 'is-active' : ''}`
        });
        fileItem.setAttribute('data-path', file.path);

        // 创建左侧内容容器
        const fileItemLeft = fileItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 创建文件图标
        const fileIcon = fileItemLeft.createEl("span", {
            cls: "highlight-file-item-icon",
            attr: {
                'aria-label': t('Open (DoubleClick)'),
            }
        });
        setIcon(fileIcon, 'file-text');

        // 为文件图标添加双击事件
        fileIcon.addEventListener("dblclick", async (e) => {
            e.stopPropagation();
            const leaf = this.getPreferredLeaf();
            await leaf.openFile(file);
        });

        // 创建文件名
        const fileNameEl = fileItemLeft.createEl("span", {
            text: file.basename,
            cls: "highlight-file-item-name"
        });

        // 添加页面预览功能
        this.addPagePreview(fileNameEl, file);

        // 获取文件的高亮数量
        const highlightCount = await this.getFileHighlightsCount(file);
        
        // 创建高亮数量标签
        fileItem.createEl("span", {
            text: `${highlightCount}`,
            cls: "highlight-file-item-count"
        });

        // 添加点击事件
        fileItem.addEventListener("click", async () => {
            if (this.onFileSelect) {
                this.onFileSelect(file);
            }
        });
    }
    
    /**
     * 更新文件列表的选中状态
     */
    updateFileListSelection() {
        // 更新"全部"选项的选中状态
        const allFilesItem = this.container.querySelector('.highlight-file-item-all');
        if (allFilesItem) {
            allFilesItem.classList.toggle('is-active', this.currentFile === null && !this.isFlashcardMode);
        }

        // 更新闪卡选项的选中状态
        const flashcardItem = this.container.querySelector('.highlight-file-item-flashcard');
        if (flashcardItem) {
            flashcardItem.classList.toggle('is-active', this.isFlashcardMode);
        }

        // 更新文件项的选中状态
        const fileItems = this.container.querySelectorAll('.highlight-file-item:not(.highlight-file-item-all):not(.highlight-file-item-flashcard)');
        fileItems.forEach((item: HTMLElement) => {
            const isActive = this.currentFile?.path === item.getAttribute('data-path');
            item.classList.toggle('is-active', isActive);
        });
    }
    
    /**
     * 清除缓存
     */
    invalidateCache(): void {
        this.cachedFiles = null;
        this.cachedFileCounts = null;
        this.cacheTimestamp = 0;
    }
    
    /**
     * 获取所有包含高亮的文件(优化版)
     * 优先使用索引和缓存,大幅提升性能
     */
    async getFilesWithHighlights(): Promise<TFile[]> {
        // 检查缓存
        const now = Date.now();
        if (this.cachedFiles && (now - this.cacheTimestamp) < this.CACHE_EXPIRY) {
            return this.cachedFiles;
        }
        
        // 优先使用 HighlightService 的索引
        const cachedHighlights = this.highlightService.getAllHighlightsFromCache();
        
        if (cachedHighlights && cachedHighlights.length > 0) {
            // 从索引中提取文件列表和数量
            const filePathsSet = new Set<string>();
            const countsMap = new Map<string, number>();
            
            for (const highlight of cachedHighlights) {
                if (highlight.filePath) {
                    filePathsSet.add(highlight.filePath);
                    countsMap.set(
                        highlight.filePath,
                        (countsMap.get(highlight.filePath) || 0) + 1
                    );
                }
            }
            
            // 转换为 TFile 对象
            const files: TFile[] = [];
            for (const filePath of filePathsSet) {
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    files.push(file);
                }
            }
            
            // 更新缓存
            this.cachedFiles = files;
            this.cachedFileCounts = countsMap;
            this.cacheTimestamp = now;
            
            return files;
        }
        
        // 如果索引不可用,降级到原有逻辑
        const files = await this.getFilesWithHighlightsLegacy();
        this.cachedFiles = files;
        this.cacheTimestamp = now;
        return files;
    }
    
    /**
     * 获取所有包含高亮的文件(原有逻辑,作为降级方案)
     */
    private async getFilesWithHighlightsLegacy(): Promise<TFile[]> {
        const allFiles = this.plugin.app.vault.getMarkdownFiles();
        const files = allFiles.filter(file => this.highlightService.shouldProcessFile(file));
        const filesWithHighlights: TFile[] = [];
        const countsMap = new Map<string, number>();
        
        for (const file of files) {
            const content = await this.plugin.app.vault.read(file);
            const highlights = this.highlightService.extractHighlights(content, file);
            if (highlights.length > 0) {
                filesWithHighlights.push(file);
                countsMap.set(file.path, highlights.length);
            }
        }
        
        // 同时缓存数量信息
        this.cachedFileCounts = countsMap;
        
        return filesWithHighlights;
    }
    
    /**
     * 获取文件的高亮数量(优化版)
     * 优先从缓存获取,避免重复读取文件
     */
    private async getFileHighlightsCount(file: TFile): Promise<number> {
        // 优先从缓存获取
        if (this.cachedFileCounts && this.cachedFileCounts.has(file.path)) {
            return this.cachedFileCounts.get(file.path)!;
        }
        
        // 如果缓存不可用,读取文件
        const content = await this.plugin.app.vault.read(file);
        const count = this.highlightService.extractHighlights(content, file).length;
        
        // 更新缓存
        if (!this.cachedFileCounts) {
            this.cachedFileCounts = new Map();
        }
        this.cachedFileCounts.set(file.path, count);
        
        return count;
    }
    
    /**
     * 获取所有文件的高亮总数(优化版)
     * 直接从索引或缓存获取,避免遍历文件
     */
    private getTotalHighlightsCount(): number {
        // 优先从索引获取
        const cachedHighlights = this.highlightService.getAllHighlightsFromCache();
        if (cachedHighlights) {
            return cachedHighlights.length;
        }
        
        // 从缓存的数量信息计算
        if (this.cachedFileCounts) {
            let total = 0;
            for (const count of this.cachedFileCounts.values()) {
                total += count;
            }
            return total;
        }
        
        return 0;
    }
    
    /**
     * 添加页面预览功能
     */
    private addPagePreview(element: HTMLElement, file: TFile) {
        let hoverTimeout: NodeJS.Timeout;

        // 添加悬停事件
        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = setTimeout(async () => {
                const target = event.target as HTMLElement;
                
                // 触发 Obsidian 的页面预览事件
                this.plugin.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300); // 300ms 的延迟显示
        });

        // 添加鼠标离开事件
        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });
    }
    
    /**
     * 获取或创建拆分视图
     */
    private getPreferredLeaf() {
        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
        
        if (this.isDraggedToMainView) {
            const otherLeaf = leaves.find(leaf => leaf !== this.plugin.app.workspace.activeLeaf);
            if (otherLeaf) {
                return otherLeaf;
            }
        }
        
        return this.plugin.app.workspace.getLeaf('split', 'vertical');
    }
    
    /**
     * 清理资源
     */
    destroy() {
        this.container.empty();
        this.onFileSelect = null;
        this.onFlashcardModeToggle = null;
        this.onAllHighlightsSelect = null;
        this.onRefreshView = null;
    }
}

import { TFile } from "obsidian";
import { HighlightInfo } from "../../types";
import CommentPlugin from "../../../main";
import { SearchUIHelper } from "./SearchUIHelper";
import { SearchService } from "../../services/search/SearchService";

/**
 * 搜索 UI 管理器
 * 负责搜索相关的 UI 交互逻辑
 * 
 * 职责：
 * - 搜索输入防抖
 * - 加载指示器显示/隐藏
 * - UI 事件处理
 * - 协调 SearchService 执行业务逻辑
 */
export class SearchUIManager {
    private plugin: CommentPlugin;
    private searchInput: HTMLInputElement;
    private searchLoadingIndicator: HTMLElement;
    private searchDebounceTimer: number | null = null;
    private isSearching: boolean = false;
    private uiHelper: SearchUIHelper;
    private searchService: SearchService;
    
    // 防抖时间配置
    private readonly localSearchDebounceTime = 200; // 本地搜索防抖时间（毫秒）
    private readonly globalSearchDebounceTime = 500; // 全局搜索防抖时间（毫秒）
    
    // 回调函数
    private onSearchCallback: (searchTerm: string, searchType: string) => Promise<void>;
    private getHighlightsCallback: () => HighlightInfo[];
    private getCurrentFileCallback: () => TFile | null;
    
    constructor(
        plugin: CommentPlugin,
        searchInput: HTMLInputElement,
        searchLoadingIndicator: HTMLElement,
        searchContainer: HTMLElement
    ) {
        this.plugin = plugin;
        this.searchInput = searchInput;
        this.searchLoadingIndicator = searchLoadingIndicator;
        this.uiHelper = new SearchUIHelper(searchInput, searchContainer);
        this.searchService = new SearchService(plugin);
    }
    
    /**
     * 设置搜索回调函数
     */
    setCallbacks(
        onSearch: (searchTerm: string, searchType: string) => Promise<void>,
        getHighlights: () => HighlightInfo[],
        getCurrentFile: () => TFile | null
    ) {
        this.onSearchCallback = onSearch;
        this.getHighlightsCallback = getHighlights;
        this.getCurrentFileCallback = getCurrentFile;
    }
    
    /**
     * 初始化搜索功能
     */
    initialize() {
        // 添加焦点事件
        this.searchInput.addEventListener('focus', () => {
            this.uiHelper.showSearchPrefixHints();
        });
        
        // 添加搜索输入事件
        this.searchInput.addEventListener('input', this.handleSearchInputWithDebounce);
    }
    
    /**
     * 清理资源
     */
    destroy() {
        if (this.searchDebounceTimer !== null) {
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
        this.uiHelper.destroy();
    }
    
    /**
     * 搜索输入防抖处理函数
     */
    private handleSearchInputWithDebounce = (e: Event) => {
        // 清除之前的定时器
        if (this.searchDebounceTimer !== null) {
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
        
        // 获取搜索输入值
        const searchInput = this.searchInput.value.toLowerCase().trim();
        
        // 根据搜索类型决定防抖时间
        const isGlobalSearch = searchInput.startsWith('all:');
        const debounceTime = isGlobalSearch ? this.globalSearchDebounceTime : this.localSearchDebounceTime;
        
        // 如果是全局搜索且搜索词不为空，显示加载指示器
        if (isGlobalSearch && searchInput.length > 4) {
            this.showSearchLoadingIndicator();
        }
        
        // 设置防抖定时器
        this.searchDebounceTimer = window.setTimeout(async () => {
            await this.performSearch();
            this.searchDebounceTimer = null;
        }, debounceTime);
    };
    
    /**
     * 执行搜索
     */
    private async performSearch() {
        try {
            // 获取搜索词并使用 SearchService 解析
            const searchInput = this.searchInput.value.trim();
            const { searchTerm, searchType } = this.searchService.parseSearchInput(searchInput);
            
            // 调用回调函数执行搜索
            if (this.onSearchCallback) {
                await this.onSearchCallback(searchTerm, searchType);
            }
        } catch (error) {
            console.error('[搜索 UI 管理器] 搜索过程中出错:', error);
        } finally {
            this.hideSearchLoadingIndicator();
        }
    }
    
    /**
     * 根据搜索词和搜索类型过滤高亮
     * 委托给 SearchService 处理业务逻辑
     */
    filterHighlightsByTerm(searchTerm: string, searchType: string = ''): HighlightInfo[] {
        const highlights = this.getHighlightsCallback();
        const currentFile = this.getCurrentFileCallback();
        
        return this.searchService.filterHighlights(highlights, searchTerm, searchType, currentFile);
    }
    
    /**
     * 显示搜索加载指示器
     */
    private showSearchLoadingIndicator(): void {
        if (!this.isSearching) {
            this.isSearching = true;
            this.searchLoadingIndicator.style.display = "flex";
        }
    }
    
    /**
     * 隐藏搜索加载指示器
     */
    private hideSearchLoadingIndicator(): void {
        if (this.isSearching) {
            this.isSearching = false;
            this.searchLoadingIndicator.style.display = "none";
        }
    }
    
    /**
     * 获取当前搜索值
     */
    getSearchValue(): string {
        return this.searchInput.value.trim();
    }
    
    /**
     * 检查是否有搜索内容
     */
    hasSearchTerm(): boolean {
        return this.searchInput.value.trim() !== '';
    }
}

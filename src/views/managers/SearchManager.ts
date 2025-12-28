import { TFile } from "obsidian";
import { HighlightInfo } from "../../types";
import { t } from "../../i18n";
import CommentPlugin from "../../../main";
import { SearchUIHelper } from "./SearchUIHelper";

/**
 * 搜索管理器
 * 负责处理所有搜索相关的逻辑，包括：
 * - 前缀搜索（all:, path:, hicard:, comment:）
 * - 搜索防抖
 * - 搜索结果过滤
 */
export class SearchManager {
    private plugin: CommentPlugin;
    private searchInput: HTMLInputElement;
    private searchLoadingIndicator: HTMLElement;
    private searchDebounceTimer: number | null = null;
    private isSearching: boolean = false;
    private uiHelper: SearchUIHelper;
    
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
            // 获取搜索词并检查是否包含前缀
            const searchInput = this.searchInput.value.toLowerCase().trim();
            const { searchTerm, searchType } = this.parseSearchInput(searchInput);
            
            // 调用回调函数执行搜索
            if (this.onSearchCallback) {
                await this.onSearchCallback(searchTerm, searchType);
            }
        } catch (error) {
            console.error('[搜索管理器] 搜索过程中出错:', error);
        } finally {
            this.hideSearchLoadingIndicator();
        }
    }
    
    /**
     * 解析搜索输入，提取搜索词和搜索类型
     */
    private parseSearchInput(searchInput: string): { searchTerm: string; searchType: string } {
        const isGlobalSearch = searchInput.startsWith('all:');
        const isHiCardSearch = searchInput.startsWith('hicard:');
        const isCommentSearch = searchInput.startsWith('comment:');
        const isPathSearch = searchInput.startsWith('path:');
        
        let searchType = '';
        let searchTerm = searchInput;
        
        if (isGlobalSearch) {
            searchType = 'all';
            searchTerm = searchInput.substring(4).trim();
        } else if (isHiCardSearch) {
            searchType = 'hicard';
            searchTerm = searchInput.substring(7).trim();
        } else if (isCommentSearch) {
            searchType = 'comment';
            searchTerm = searchInput.substring(8).trim();
        } else if (isPathSearch) {
            searchType = 'path';
            searchTerm = searchInput.substring(5).trim();
        }
        
        return { searchTerm, searchType };
    }
    
    /**
     * 根据搜索词和搜索类型过滤高亮
     */
    filterHighlightsByTerm(searchTerm: string, searchType: string = ''): HighlightInfo[] {
        const highlights = this.getHighlightsCallback();
        const currentFile = this.getCurrentFileCallback();
        
        // 如果是按路径搜索
        if (searchType === 'path') {
            return this.filterByPath(highlights, searchTerm);
        }
        
        // 如果是搜索闪卡
        if (searchType === 'hicard') {
            return this.filterByFlashcard(highlights, searchTerm, currentFile);
        }
        
        // 如果是搜索批注
        if (searchType === 'comment') {
            return this.filterByComment(highlights, searchTerm, currentFile);
        }
        
        // 常规搜索逻辑
        return this.filterByGeneral(highlights, searchTerm, currentFile);
    }
    
    /**
     * 按路径过滤高亮
     */
    private filterByPath(highlights: HighlightInfo[], searchTerm: string): HighlightInfo[] {
        // 确保所有高亮都有文件名和路径信息
        highlights.forEach(highlight => {
            if (highlight.filePath && !highlight.fileName) {
                const pathParts = highlight.filePath.split('/');
                highlight.fileName = pathParts[pathParts.length - 1];
            }
        });
        
        // 如果搜索词为空，返回所有有文件路径的高亮
        if (!searchTerm || searchTerm.trim() === '') {
            return highlights.filter(highlight => !!highlight.filePath);
        }
        
        // 如果有搜索词，过滤出路径匹配的高亮
        return highlights.filter(highlight => {
            if (!highlight.filePath) {
                return false;
            }
            const filePath = highlight.filePath.toLowerCase();
            return filePath.includes(searchTerm.toLowerCase());
        });
    }
    
    /**
     * 按闪卡过滤高亮
     */
    private filterByFlashcard(highlights: HighlightInfo[], searchTerm: string, currentFile: TFile | null): HighlightInfo[] {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            return [];
        }
        
        return highlights.filter(highlight => {
            // 检查高亮是否已转化为闪卡
            const hasFlashcard = highlight.id ? 
                fsrsManager.findCardsBySourceId(highlight.id, 'highlight').length > 0 : 
                false;
            
            if (!hasFlashcard) {
                return false;
            }
            
            // 如果有搜索词，还需要匹配搜索词
            if (searchTerm) {
                return this.matchesSearchTerm(highlight, searchTerm, currentFile);
            }
            
            return true;
        });
    }
    
    /**
     * 按批注过滤高亮
     */
    private filterByComment(highlights: HighlightInfo[], searchTerm: string, currentFile: TFile | null): HighlightInfo[] {
        return highlights.filter(highlight => {
            // 检查高亮是否包含批注
            const hasComments = highlight.comments && highlight.comments.length > 0;
            
            if (!hasComments) {
                return false;
            }
            
            // 如果有搜索词，还需要匹配搜索词
            if (searchTerm) {
                return this.matchesSearchTerm(highlight, searchTerm, currentFile);
            }
            
            return true;
        });
    }
    
    /**
     * 常规搜索过滤
     */
    private filterByGeneral(highlights: HighlightInfo[], searchTerm: string, currentFile: TFile | null): HighlightInfo[] {
        return highlights.filter(highlight => {
            return this.matchesSearchTerm(highlight, searchTerm, currentFile);
        });
    }
    
    /**
     * 检查高亮是否匹配搜索词
     */
    private matchesSearchTerm(highlight: HighlightInfo, searchTerm: string, currentFile: TFile | null): boolean {
        // 搜索高亮文本
        if (highlight.text.toLowerCase().includes(searchTerm)) {
            return true;
        }
        
        // 搜索评论内容
        if (highlight.comments?.some(comment => 
            comment.content.toLowerCase().includes(searchTerm)
        )) {
            return true;
        }
        
        // 在全部视图中也搜索文件名
        if (currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
            return true;
        }
        
        return false;
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

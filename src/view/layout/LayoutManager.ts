import { Platform } from 'obsidian';

/**
 * 布局管理器
 * 负责视图布局的更新和响应式设计
 */
export class LayoutManager {
    private containerEl: HTMLElement;
    private fileListContainer: HTMLElement;
    private mainContentContainer: HTMLElement;
    private searchContainer: HTMLElement;
    
    // 回调函数
    private onCreateFloatingButton: (() => void) | null = null;
    private onRemoveFloatingButton: (() => void) | null = null;
    private onUpdateFileList: ((forceRefresh?: boolean) => Promise<void>) | null = null;
    
    // 状态
    private isDraggedToMainView: boolean = false;
    private isFlashcardMode: boolean = false;
    private isShowingFileList: boolean = true;
    private isMobileView: boolean = false;
    private isSmallScreen: boolean = false;
    
    constructor(
        containerEl: HTMLElement,
        fileListContainer: HTMLElement,
        mainContentContainer: HTMLElement,
        searchContainer: HTMLElement
    ) {
        this.containerEl = containerEl;
        this.fileListContainer = fileListContainer;
        this.mainContentContainer = mainContentContainer;
        this.searchContainer = searchContainer;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onCreateFloatingButton?: () => void;
        onRemoveFloatingButton?: () => void;
        onUpdateFileList?: (forceRefresh?: boolean) => Promise<void>;
    }) {
        if (callbacks.onCreateFloatingButton) {
            this.onCreateFloatingButton = callbacks.onCreateFloatingButton;
        }
        if (callbacks.onRemoveFloatingButton) {
            this.onRemoveFloatingButton = callbacks.onRemoveFloatingButton;
        }
        if (callbacks.onUpdateFileList) {
            this.onUpdateFileList = callbacks.onUpdateFileList;
        }
    }
    
    /**
     * 更新状态
     */
    updateState(state: {
        isDraggedToMainView?: boolean;
        isFlashcardMode?: boolean;
        isShowingFileList?: boolean;
        isMobileView?: boolean;
        isSmallScreen?: boolean;
    }) {
        if (state.isDraggedToMainView !== undefined) {
            this.isDraggedToMainView = state.isDraggedToMainView;
        }
        if (state.isFlashcardMode !== undefined) {
            this.isFlashcardMode = state.isFlashcardMode;
        }
        if (state.isShowingFileList !== undefined) {
            this.isShowingFileList = state.isShowingFileList;
        }
        if (state.isMobileView !== undefined) {
            this.isMobileView = state.isMobileView;
        }
        if (state.isSmallScreen !== undefined) {
            this.isSmallScreen = state.isSmallScreen;
        }
    }
    
    /**
     * 更新视图布局
     */
    async updateViewLayout(): Promise<void> {
        // 检测设备类型和屏幕大小
        this.isMobileView = this.checkIfMobile();
        this.isSmallScreen = this.checkIfSmallScreen();
        
        // 先清除所有显示相关的类
        this.fileListContainer.removeClass('highlight-display-block');
        this.fileListContainer.removeClass('highlight-display-none');
        this.mainContentContainer.removeClass('highlight-display-none');
        
        // 添加或移除主视图标记类
        const container = this.containerEl.children[1];
        if (this.isDraggedToMainView) {
            container.addClass('is-in-main-view');
        } else {
            container.removeClass('is-in-main-view');
        }
        
        // 添加或移除小屏幕标记类
        if (this.isSmallScreen) {
            container.addClass('is-small-screen');
        } else {
            container.removeClass('is-small-screen');
        }
        
        if (this.isDraggedToMainView) {
            // 立即应用布局,不阻塞UI
            if (this.isMobileView && this.isSmallScreen) {
                this.applySmallScreenLayout();
            } else {
                this.applyLargeScreenLayout();
            }
            
            // 创建浮动按钮
            if (this.onCreateFloatingButton) {
                this.onCreateFloatingButton();
            }
            
            // 延迟加载文件列表,不阻塞UI渲染
            // 使用 requestIdleCallback 在浏览器空闲时加载
            // 拖拽到主视图时强制刷新，确保显示最新的文件和高亮
            if (this.onUpdateFileList) {
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(async () => {
                        if (this.onUpdateFileList) {
                            await this.onUpdateFileList(true); // 强制刷新
                        }
                    });
                } else {
                    // 降级方案:使用 setTimeout
                    setTimeout(async () => {
                        if (this.onUpdateFileList) {
                            await this.onUpdateFileList(true); // 强制刷新
                        }
                    }, 50);
                }
            }
        } else {
            // 侧边栏布局
            this.applySidebarLayout();
        }
    }
    
    /**
     * 应用小屏幕布局（手机）
     */
    private applySmallScreenLayout(): void {
        if (this.isShowingFileList) {
            // 显示文件列表，隐藏内容区域
            this.fileListContainer.addClass('highlight-display-block');
            this.mainContentContainer.addClass('highlight-display-none');
            this.fileListContainer.addClass('highlight-full-width');
        } else {
            // 显示内容区域，隐藏文件列表
            this.fileListContainer.addClass('highlight-display-none');
            this.mainContentContainer.removeClass('highlight-display-none');
            this.fileListContainer.removeClass('highlight-full-width');
        }
    }
    
    /**
     * 应用大屏幕布局（平板、桌面）
     */
    private applyLargeScreenLayout(): void {
        // 同时显示文件列表和内容
        this.fileListContainer.addClass('highlight-display-block');
        this.mainContentContainer.removeClass('highlight-display-none');
        this.fileListContainer.removeClass('highlight-full-width');
    }
    
    /**
     * 应用侧边栏布局
     */
    private applySidebarLayout(): void {
        // 隐藏文件列表
        this.fileListContainer.addClass('highlight-display-none');
        
        // 移除浮动按钮
        if (this.onRemoveFloatingButton) {
            this.onRemoveFloatingButton();
        }
        
        // 显示搜索容器（除非在闪卡模式）
        if (!this.isFlashcardMode) {
            this.searchContainer.removeClass('highlight-display-none');
            const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
            if (iconButtons) {
                iconButtons.removeClass('highlight-display-none');
            }
        }
    }
    
    /**
     * 检测是否为移动设备
     */
    checkIfMobile(): boolean {
        return Platform.isMobile;
    }
    
    /**
     * 检测是否为小屏幕设备（宽度小于768px）
     */
    checkIfSmallScreen(): boolean {
        return window.innerWidth < 768;
    }
    
    /**
     * 获取当前设备信息
     */
    getDeviceInfo(): {
        isMobile: boolean;
        isSmallScreen: boolean;
        isDraggedToMainView: boolean;
    } {
        return {
            isMobile: this.isMobileView,
            isSmallScreen: this.isSmallScreen,
            isDraggedToMainView: this.isDraggedToMainView
        };
    }
}

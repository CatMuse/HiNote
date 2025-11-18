import { Notice } from "obsidian";
import { HighlightInfo } from "../../types";

/**
 * 无限滚动管理器
 * 职责：
 * 1. 管理批量加载高亮
 * 2. 实现无限滚动功能
 * 3. 自动加载直到填满屏幕
 */
export class InfiniteScrollManager {
    private currentBatch: number = 0;
    private isLoading: boolean = false;
    private readonly BATCH_SIZE = 20;
    private observer: IntersectionObserver | null = null;
    private sentinel: HTMLElement | null = null;
    private loadingIndicator: HTMLElement | null = null;

    constructor(
        private highlightContainer: HTMLElement
    ) {}

    /**
     * 设置加载指示器
     */
    setLoadingIndicator(indicator: HTMLElement): void {
        this.loadingIndicator = indicator;
    }

    /**
     * 重置批次计数
     */
    reset(): void {
        this.currentBatch = 0;
        this.isLoading = false;
        this.cleanup();
    }

    /**
     * 获取当前批次
     */
    getCurrentBatch(): number {
        return this.currentBatch;
    }

    /**
     * 设置当前批次
     */
    setCurrentBatch(batch: number): void {
        this.currentBatch = batch;
    }

    /**
     * 加载更多高亮
     * @param allHighlights 所有高亮数据
     * @param renderCallback 渲染回调函数
     */
    async loadMoreHighlights(
        allHighlights: HighlightInfo[],
        renderCallback: (batch: HighlightInfo[], append: boolean) => Promise<void>
    ): Promise<void> {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();

        try {
            const start = this.currentBatch * this.BATCH_SIZE;
            const batch = allHighlights.slice(start, start + this.BATCH_SIZE);

            if (batch.length === 0) {
                this.hideLoading();
                if (this.loadingIndicator) {
                    this.loadingIndicator.remove();
                }
                return;
            }

            // 渲染新的高亮（追加模式）
            await renderCallback(batch, true);
            this.currentBatch++;
        } catch (error) {
            console.error('[InfiniteScrollManager] Error loading highlights:', error);
            new Notice("加载高亮内容时出错");
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    /**
     * 加载内容直到容器可滚动
     * 解决内容不满一屏时无法触发滚动加载的问题
     */
    async loadUntilScrollable(
        allHighlights: HighlightInfo[],
        renderCallback: (batch: HighlightInfo[], append: boolean) => Promise<void>
    ): Promise<void> {
        const maxAttempts = 10; // 最多尝试10次，避免无限循环
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            const { scrollHeight, clientHeight } = this.highlightContainer;
            
            // 检查是否可滚动（内容高度 > 容器高度）
            if (scrollHeight > clientHeight) {
                break; // 已经可滚动，退出
            }
            
            // 检查是否还有更多内容
            const start = this.currentBatch * this.BATCH_SIZE;
            if (start >= allHighlights.length) {
                break; // 没有更多内容了，退出
            }
            
            // 加载下一批
            await this.loadMoreHighlights(allHighlights, renderCallback);
            attempts++;
            
            // 等待DOM更新
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    /**
     * 设置无限滚动加载
     * 使用 Intersection Observer 实现高性能的无限滚动
     */
    setupInfiniteScroll(
        allHighlights: HighlightInfo[],
        renderCallback: (batch: HighlightInfo[], append: boolean) => Promise<void>
    ): void {
        // 清理之前的观察器
        this.cleanup();

        // 创建哨兵元素
        this.sentinel = this.highlightContainer.createEl('div', {
            cls: 'scroll-sentinel'
        });
        this.sentinel.style.height = '1px';
        this.sentinel.style.width = '100%';
        
        // 使用 Intersection Observer 监听哨兵元素
        this.observer = new IntersectionObserver(
            async (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && !this.isLoading) {
                    await this.loadMoreHighlights(allHighlights, renderCallback);
                }
            },
            {
                root: this.highlightContainer,
                rootMargin: '300px', // 提前300px触发加载
                threshold: 0
            }
        );
        
        this.observer.observe(this.sentinel);
    }

    /**
     * 显示加载指示器
     */
    private showLoading(): void {
        if (this.loadingIndicator) {
            this.loadingIndicator.addClass('highlight-display-block');
            this.loadingIndicator.removeClass('highlight-display-none');
        }
    }

    /**
     * 隐藏加载指示器
     */
    private hideLoading(): void {
        if (this.loadingIndicator) {
            this.loadingIndicator.removeClass('highlight-display-block');
            this.loadingIndicator.addClass('highlight-display-none');
        }
    }

    /**
     * 清理资源
     */
    private cleanup(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.sentinel) {
            this.sentinel.remove();
            this.sentinel = null;
        }
    }

    /**
     * 销毁无限滚动管理器
     */
    destroy(): void {
        this.cleanup();
        this.loadingIndicator = null;
    }
}

import { HighlightInfo, CommentItem } from '../../../types/highlight';
import { HighlightCard, defaultHighlightCardRegistry } from '../../../components/highlight';
import { SelectionManager } from '../../selection';
import { TFile } from 'obsidian';
import CommentPlugin from '../../../../main';
import { t } from '../../../i18n';

/**
 * 高亮渲染管理器
 * 负责高亮卡片的渲染和显示
 */
export class HighlightRenderManager {
    private static readonly MASONRY_MIN_COLUMN_WIDTH = 250;
    private static readonly MASONRY_GAP = 12;

    private container: HTMLElement;
    private plugin: CommentPlugin;
    private searchInput: HTMLInputElement;
    private selectionManager: SelectionManager | null = null;  // 保存 SelectionManager 实例
    
    // 回调函数
    private onHighlightClick: ((h: HighlightInfo) => Promise<void>) | null = null;
    private onCommentAdd: ((element: HTMLElement, h: HighlightInfo) => void) | null = null;
    private onCommentEdit: ((element: HTMLElement, h: HighlightInfo, c: CommentItem) => void) | null = null;
    private onExport: ((h: HighlightInfo) => void) | null = null;
    private onAIResponse: ((h: HighlightInfo, content: string) => Promise<void>) | null = null;
    
    // 状态
    private currentFile: TFile | null = null;
    private isDraggedToMainView: boolean = false;
    private highlightsWithFlashcards: Set<string> = new Set();
    private currentBatch: number = 0;
    private renderSequence = 0;
    private resizeObserver: ResizeObserver | null = null;
    private resizeTimer: number | null = null;
    private lastMasonryColumnCount = 0;
    
    constructor(
        container: HTMLElement,
        plugin: CommentPlugin,
        searchInput: HTMLInputElement
    ) {
        this.container = container;
        this.plugin = plugin;
        this.searchInput = searchInput;
        this.startResizeObserver();
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onHighlightClick?: (h: HighlightInfo) => Promise<void>;
        onCommentAdd?: (element: HTMLElement, h: HighlightInfo) => void;
        onCommentEdit?: (element: HTMLElement, h: HighlightInfo, c: CommentItem) => void;
        onExport?: (h: HighlightInfo) => void;
        onAIResponse?: (h: HighlightInfo, content: string) => Promise<void>;
    }) {
        if (callbacks.onHighlightClick) {
            this.onHighlightClick = callbacks.onHighlightClick;
        }
        if (callbacks.onCommentAdd) {
            this.onCommentAdd = callbacks.onCommentAdd;
        }
        if (callbacks.onCommentEdit) {
            this.onCommentEdit = callbacks.onCommentEdit;
        }
        if (callbacks.onExport) {
            this.onExport = callbacks.onExport;
        }
        if (callbacks.onAIResponse) {
            this.onAIResponse = callbacks.onAIResponse;
        }
    }
    
    /**
     * 更新状态
     */
    updateState(state: {
        currentFile?: TFile | null;
        isDraggedToMainView?: boolean;
        highlightsWithFlashcards?: Set<string>;
        currentBatch?: number;
    }) {
        if (state.currentFile !== undefined) {
            this.currentFile = state.currentFile;
        }
        if (state.isDraggedToMainView !== undefined) {
            this.isDraggedToMainView = state.isDraggedToMainView;
        }
        if (state.highlightsWithFlashcards !== undefined) {
            this.highlightsWithFlashcards = state.highlightsWithFlashcards;
        }
        if (state.currentBatch !== undefined) {
            this.currentBatch = state.currentBatch;
        }
    }
    
    /**
     * 渲染高亮列表
     */
    renderHighlights(
        highlightsToRender: HighlightInfo[], 
        append = false,
        selectionManager?: SelectionManager
    ) {
        // 保存 SelectionManager 实例
        if (selectionManager) {
            this.selectionManager = selectionManager;
        }
        
        if (!append) {
            defaultHighlightCardRegistry.clearAll();
            
            this.container.empty();
            this.currentBatch = 0;
            this.renderSequence = 0;
            
            // 清除多选状态
            if (this.selectionManager) {
                this.selectionManager.clearSelection();
            }
        }

        if (highlightsToRender.length === 0) {
            this.renderEmptyState();
            return;
        }
        
        // 初始化选择功能
        if (this.selectionManager && !append) {
            this.selectionManager.initialize();
        }

        const highlightList = this.ensureHighlightList();
        this.syncMasonryColumns(highlightList);

        highlightsToRender.forEach((highlight) => {
            this.renderHighlightCard(this.getShortestMasonryColumn(highlightList), highlight);
        });
    }

    private ensureHighlightList(): HTMLElement {
        let highlightList = this.container.querySelector<HTMLElement>('.highlight-list');
        if (!highlightList) {
            highlightList = this.container.createDiv({
                cls: "highlight-list"
            });
        }
        return highlightList;
    }

    private syncMasonryColumns(highlightList: HTMLElement): void {
        const expectedColumnCount = this.getMasonryColumnCount(highlightList);
        this.lastMasonryColumnCount = expectedColumnCount;
        const columns = this.getMasonryColumns(highlightList);
        if (columns.length === expectedColumnCount) {
            return;
        }

        const cards = Array.from(highlightList.querySelectorAll<HTMLElement>('.highlight-card'))
            .sort((a, b) => Number(a.dataset.masonryOrder || 0) - Number(b.dataset.masonryOrder || 0));
        highlightList.empty();

        for (let index = 0; index < expectedColumnCount; index++) {
            highlightList.createDiv({
                cls: 'highlight-masonry-column'
            });
        }

        cards.forEach(card => {
            this.getShortestMasonryColumn(highlightList).appendChild(card);
        });
    }

    private getMasonryColumnCount(highlightList: HTMLElement): number {
        const width = highlightList.clientWidth || this.container.clientWidth;
        return Math.max(
            1,
            Math.floor((width + HighlightRenderManager.MASONRY_GAP) / (HighlightRenderManager.MASONRY_MIN_COLUMN_WIDTH + HighlightRenderManager.MASONRY_GAP))
        );
    }

    private getMasonryColumns(highlightList: HTMLElement): HTMLElement[] {
        return Array.from(highlightList.querySelectorAll<HTMLElement>('.highlight-masonry-column'));
    }

    private getShortestMasonryColumn(highlightList: HTMLElement): HTMLElement {
        const columns = this.getMasonryColumns(highlightList);
        if (columns.length === 0) {
            this.syncMasonryColumns(highlightList);
            return this.getMasonryColumns(highlightList)[0];
        }

        return columns.reduce((shortest, column) => {
            return column.scrollHeight < shortest.scrollHeight ? column : shortest;
        }, columns[0]);
    }

    private startResizeObserver(): void {
        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleMasonryReflow();
        });
        this.resizeObserver.observe(this.container);
    }

    private scheduleMasonryReflow(): void {
        if (this.resizeTimer !== null) {
            window.clearTimeout(this.resizeTimer);
        }

        this.resizeTimer = window.setTimeout(() => {
            this.resizeTimer = null;
            this.reflowMasonryIfColumnCountChanged();
        }, 120);
    }

    private reflowMasonryIfColumnCountChanged(): void {
        const highlightList = this.container.querySelector<HTMLElement>('.highlight-list');
        if (!highlightList) return;

        const nextColumnCount = this.getMasonryColumnCount(highlightList);
        if (nextColumnCount === this.lastMasonryColumnCount) {
            return;
        }

        this.syncMasonryColumns(highlightList);
    }
    
    /**
     * 渲染单个高亮卡片
     */
    private renderHighlightCard(container: HTMLElement, highlight: HighlightInfo) {
        // 在具体文件视图下，确保高亮有 filePath
        if (this.currentFile && !highlight.filePath) {
            highlight.filePath = this.currentFile.path;
        }

        const highlightCard = new HighlightCard(
            container,
            highlight,
            this.plugin,
            {
                onHighlightClick: async (h: HighlightInfo) => {
                    if (this.onHighlightClick) {
                        await this.onHighlightClick(h);
                    }
                },
                onCommentAdd: (h: HighlightInfo) => {
                    if (this.onCommentAdd) {
                        this.onCommentAdd(highlightCard.getElement(), h);
                    }
                },
                onExport: (h: HighlightInfo) => {
                    if (this.onExport) {
                        this.onExport(h);
                    }
                },
                onCommentEdit: (h: HighlightInfo, c: CommentItem) => {
                    if (this.onCommentEdit) {
                        this.onCommentEdit(highlightCard.getElement(), h, c);
                    }
                },
                onAIResponse: async (content: string) => {
                    if (this.onAIResponse) {
                        await this.onAIResponse(highlight, content);
                    }
                }
            },
            this.isDraggedToMainView,
            // 当显示全部高亮时（currentFile 为 null），使用高亮的 fileName，否则使用当前文件名
            this.currentFile === null ? highlight.fileName : this.currentFile.basename,
            this.selectionManager ?? undefined,  // 传入 SelectionManager 实例，null 转为 undefined
            defaultHighlightCardRegistry
        );
        
        // 如果高亮已经创建了闪卡，立即更新UI状态
        if (highlight.id && this.highlightsWithFlashcards.has(highlight.id)) {
            window.setTimeout(() => {
                if (highlight.id) {
                    defaultHighlightCardRegistry.updateCardUIByHighlightId(highlight.id);
                }
            }, 0);
        }

        // 根据位置更新样式
        const cardElement = highlightCard.getElement();
        cardElement.dataset.masonryOrder = String(this.renderSequence++);
        if (this.isDraggedToMainView) {
            cardElement.classList.add('in-main-view');
            // 找到文本内容元素并移除点击提示
            const textContent = cardElement.querySelector('.highlight-text-content');
            if (textContent) {
                textContent.removeAttribute('title');
            }
        } else {
            cardElement.classList.remove('in-main-view');
        }
    }
    
    /**
     * 渲染空状态
     */
    private renderEmptyState() {
        // 检查是否有搜索内容
        const hasSearchTerm = this.searchInput && this.searchInput.value.trim() !== '';
        
        this.container.createDiv({
            cls: "highlight-empty-state",
            text: hasSearchTerm 
                ? t("No matching highlights found for your search.")
                : t("The current document has no highlighted content.")
        });
    }
    
    /**
     * 清空容器
     */
    clear() {
        if (this.resizeTimer !== null) {
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = null;
        }
        defaultHighlightCardRegistry.clearAll();
        this.container.empty();
        this.lastMasonryColumnCount = 0;
    }

    destroy(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.clear();
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
    setCurrentBatch(batch: number) {
        this.currentBatch = batch;
    }
}

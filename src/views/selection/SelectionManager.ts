import { defaultHighlightCardRegistry } from '../../components/highlight/HighlightCardRegistry';
import { HighlightInfo } from "../../types/highlight";
import { SelectionBoxController } from "./SelectionBoxController";

/**
 * 选择管理器
 * 负责处理高亮卡片的选择功能，包括：
 * - 框选功能
 * - 选择状态管理
 * - 选择框绘制
 */
export class SelectionManager {
    private highlightContainer: HTMLElement;
    private selectionBoxController: SelectionBoxController;
    // 使用 Map 存储选中的卡片，key 为 DOM 元素，value 为高亮数据
    // 这样不依赖 highlight.id，即使高亮没有 ID 也能正常工作
    private selectedCards: Map<HTMLElement, HighlightInfo> = new Map();
    
    // 回调函数
    private onSelectionChangeCallback: ((selectedCount: number) => void) | null = null;
    
    constructor(highlightContainer: HTMLElement) {
        this.highlightContainer = highlightContainer;
        this.selectionBoxController = new SelectionBoxController({
            highlightContainer,
            clearSelection: () => this.clearSelection(),
            updateSelectedHighlights: () => this.updateSelectedHighlights()
        });
    }
    
    /**
     * 设置选择变化回调
     */
    setOnSelectionChange(callback: (selectedCount: number) => void) {
        this.onSelectionChangeCallback = callback;
    }
    
    /**
     * 初始化选择功能
     */
    initialize() {
        this.selectionBoxController.initialize();
    }
    
    /**
     * 清除所有选中状态
     */
    clearSelection() {
        // 清除所有选中卡片的 DOM 状态
        this.selectedCards.forEach((highlight, element) => {
            element.removeClass('selected');
        });
        
        // 清空选中的卡片集合
        this.selectedCards.clear();
        
        // 通知选择变化
        this.notifySelectionChange();
    }
    
    /**
     * 更新选中的高亮列表
     * 从 DOM 同步选中状态到内部 Map
     */
    updateSelectedHighlights() {
        this.selectedCards.clear();
        const selectedCardElements = Array.from(this.highlightContainer.querySelectorAll('.highlight-card.selected'));
        
        selectedCardElements.forEach(cardElement => {
            const highlightData = cardElement.getAttribute('data-highlight');
            if (highlightData) {
                try {
                    const highlight = defaultHighlightCardRegistry.findByElement(cardElement as HTMLElement)?.getHighlight()
                        || JSON.parse(highlightData) as HighlightInfo;
                    // 使用 DOM 元素作为 key，不再依赖 highlight.id
                    this.selectedCards.set(cardElement as HTMLElement, highlight);
                } catch (e) {
                    console.error('Error parsing highlight data:', e);
                }
            }
        });
        
        // 通知选择变化
        this.notifySelectionChange();
    }
    
    /**
     * 获取选中的高亮
     * 返回 Set 以保持向后兼容
     */
    getSelectedHighlights(): Set<HighlightInfo> {
        const highlights = new Set<HighlightInfo>();
        this.selectedCards.forEach((highlight) => {
            highlights.add(highlight);
        });
        return highlights;
    }
    
    /**
     * 获取选中数量
     */
    getSelectedCount(): number {
        return this.selectedCards.size;
    }
    
    /**
     * 选中单个卡片
     * @param element 卡片元素
     * @param highlight 高亮数据
     */
    selectCard(element: HTMLElement, highlight: HighlightInfo) {
        // 添加到选中集合
        this.selectedCards.set(element, highlight);
        
        // 更新 DOM 状态
        element.addClass('selected');
        
        // 通知选择变化
        this.notifySelectionChange();
    }
    
    /**
     * 取消选中单个卡片
     * @param element 卡片元素
     */
    unselectCard(element: HTMLElement) {
        if (this.selectedCards.has(element)) {
            // 更新 DOM 状态
            element.removeClass('selected');
            
            // 从选中集合中移除
            this.selectedCards.delete(element);
            
            // 通知选择变化
            this.notifySelectionChange();
        }
    }
    
    /**
     * 检查卡片是否被选中
     * @param element 卡片元素
     */
    isCardSelected(element: HTMLElement): boolean {
        return this.selectedCards.has(element);
    }
    
    /**
     * 是否处于选择模式
     */
    isInSelectionMode(): boolean {
        return this.selectionBoxController.isInSelectionMode();
    }
    
    /**
     * 通知选择变化
     */
    private notifySelectionChange() {
        if (this.onSelectionChangeCallback) {
            this.onSelectionChangeCallback(this.selectedCards.size);
        }
    }
    
    /**
     * 清理资源
     */
    destroy() {
        this.selectionBoxController.destroy();
        // 清除选择状态
        this.clearSelection();
    }
}

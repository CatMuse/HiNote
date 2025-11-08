import { HighlightInfo } from "../../types";
import { HighlightCard } from "../../components/highlight/HighlightCard";

/**
 * 选择管理器
 * 负责处理高亮卡片的选择功能，包括：
 * - 框选功能
 * - 选择状态管理
 * - 选择框绘制
 */
/**
 * 选中卡片的数据结构
 */
interface SelectedCardData {
    element: HTMLElement;
    highlight: HighlightInfo;
}

export class SelectionManager {
    private highlightContainer: HTMLElement;
    // 使用 Map 存储选中的卡片，key 为 highlight.id，value 为卡片数据
    // 这样可以快速访问，避免 JSON 解析，并确保数据一致性
    private selectedCards: Map<string, SelectedCardData> = new Map();
    
    // 选择模式相关
    private isSelectionMode: boolean = false;
    private selectionBox: HTMLElement | null = null;
    private selectionStartX: number = 0;
    private selectionStartY: number = 0;
    private mouseMoveThreshold = 5;
    private mouseMoved = false;
    
    // 回调函数
    private onSelectionChangeCallback: ((selectedCount: number) => void) | null = null;
    
    constructor(highlightContainer: HTMLElement) {
        this.highlightContainer = highlightContainer;
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
        this.setupSelectionBox();
    }
    
    /**
     * 清除所有选中状态
     */
    clearSelection() {
        // 清除所有选中卡片的 DOM 状态
        this.selectedCards.forEach(({ element }) => {
            element.removeClass('selected');
        });
        
        // 清空选中的卡片集合
        this.selectedCards.clear();
        
        // 重置选择模式
        this.isSelectionMode = false;
        
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
                    const highlight = JSON.parse(highlightData) as HighlightInfo;
                    if (highlight.id) {
                        this.selectedCards.set(highlight.id, {
                            element: cardElement as HTMLElement,
                            highlight: highlight
                        });
                    }
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
        this.selectedCards.forEach(({ highlight }) => {
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
     * @param id 高亮 ID
     * @param element 卡片元素
     * @param highlight 高亮数据
     */
    selectCard(id: string, element: HTMLElement, highlight: HighlightInfo) {
        // 添加到选中集合
        this.selectedCards.set(id, { element, highlight });
        
        // 更新 DOM 状态
        element.addClass('selected');
        
        // 通知选择变化
        this.notifySelectionChange();
    }
    
    /**
     * 取消选中单个卡片
     * @param id 高亮 ID
     */
    unselectCard(id: string) {
        const cardData = this.selectedCards.get(id);
        if (cardData) {
            // 更新 DOM 状态
            cardData.element.removeClass('selected');
            
            // 从选中集合中移除
            this.selectedCards.delete(id);
            
            // 通知选择变化
            this.notifySelectionChange();
        }
    }
    
    /**
     * 检查卡片是否被选中
     * @param id 高亮 ID
     */
    isCardSelected(id: string): boolean {
        return this.selectedCards.has(id);
    }
    
    /**
     * 是否处于选择模式
     */
    isInSelectionMode(): boolean {
        return this.isSelectionMode;
    }
    
    /**
     * 设置框选功能
     */
    private setupSelectionBox() {
        // 移除现有的事件监听器，避免重复添加
        this.highlightContainer.removeEventListener('mousedown', this.handleSelectionStart);
        
        // 清理可能残留的其他事件监听器
        this.cleanupMouseEvents();
        this.cleanupSelectionEvents();
        
        // 添加新的事件监听器
        this.highlightContainer.addEventListener('mousedown', this.handleSelectionStart);
    }
    
    /**
     * 处理选择开始
     */
    private handleSelectionStart = (e: MouseEvent) => {
        // 如果点击的是卡片内部元素或闪卡页面元素，不启动框选
        if ((e.target as HTMLElement).closest('.highlight-card') ||
            (e.target as HTMLElement).closest('.flashcard-mode') ||
            (e.target as HTMLElement).closest('.flashcard-add-group') ||
            (e.target as HTMLElement).closest('.flashcard-group-action')) {
            return;
        }
    
        // 记录起始位置
        this.selectionStartX = e.clientX;
        this.selectionStartY = e.clientY;
        this.mouseMoved = false;
    
        // 添加移动和结束事件监听器
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }
    
    /**
     * 处理鼠标移动（检测是否超过阈值）
     */
    private handleMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - this.selectionStartX;
        const dy = e.clientY - this.selectionStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance >= this.mouseMoveThreshold) {
            this.mouseMoved = true;
            document.removeEventListener('mousemove', this.handleMouseMove);
            this.startSelection(e);
        }
    }
    
    /**
     * 处理鼠标释放（未移动时）
     */
    private handleMouseUp = (e: MouseEvent) => {
        // 清理事件监听器
        this.cleanupMouseEvents();
        
        if (!this.mouseMoved) {
            this.clearSelection();
        }
    }
    
    /**
     * 开始框选
     */
    private startSelection(e: MouseEvent) {
        // 清理可能残留的鼠标事件监听器
        this.cleanupMouseEvents();
        
        // 检查是否已有选中的卡片，如果有则清除
        if (this.selectedCards.size > 0) {
            this.clearSelection();
        }
        
        // 创建选择框
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'selection-box';
        this.selectionBox.style.left = `${this.selectionStartX}px`;
        this.selectionBox.style.top = `${this.selectionStartY}px`;
        document.body.appendChild(this.selectionBox);
        
        // 启动选择模式
        this.isSelectionMode = true;
        
        // 添加移动和结束事件监听器
        document.addEventListener('mousemove', this.handleSelectionMove);
        document.addEventListener('mouseup', this.handleSelectionEnd);
    }
    
    /**
     * 处理框选移动
     */
    private handleSelectionMove = (e: MouseEvent) => {
        if (!this.isSelectionMode || !this.selectionBox) return;
        
        const width = e.clientX - this.selectionStartX;
        const height = e.clientY - this.selectionStartY;
        
        // 根据拖动方向设置选择框位置和大小
        if (width < 0) {
            this.selectionBox.style.left = `${e.clientX}px`;
            this.selectionBox.style.width = `${-width}px`;
        } else {
            this.selectionBox.style.width = `${width}px`;
        }
        
        if (height < 0) {
            this.selectionBox.style.top = `${e.clientY}px`;
            this.selectionBox.style.height = `${-height}px`;
        } else {
            this.selectionBox.style.height = `${height}px`;
        }
        
        // 实时选中框内的卡片
        this.selectCardsInBox();
    }
    
    /**
     * 处理框选结束
     */
    private handleSelectionEnd = (e: MouseEvent) => {
        if (!this.isSelectionMode) return;
        
        // 移除选择框
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
        
        // 结束选择模式
        this.isSelectionMode = false;
        
        // 清理事件监听器
        this.cleanupSelectionEvents();
        
        // 更新选中的高亮列表
        this.updateSelectedHighlights();
    }
    
    /**
     * 选中框内的卡片
     */
    private selectCardsInBox() {
        if (!this.selectionBox) return;
        
        const boxRect = this.selectionBox.getBoundingClientRect();
        const cards = this.highlightContainer.querySelectorAll('.highlight-card');
        
        cards.forEach(card => {
            const cardRect = card.getBoundingClientRect();
            
            // 检查卡片是否与选择框重叠
            const overlap = !(boxRect.right < cardRect.left || 
                            boxRect.left > cardRect.right || 
                            boxRect.bottom < cardRect.top || 
                            boxRect.top > cardRect.bottom);
            
            if (overlap) {
                card.addClass('selected');
            } else if (!document.querySelector('.multi-select-mode')) {
                card.removeClass('selected');
            }
        });
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
     * 清理鼠标事件监听器
     */
    private cleanupMouseEvents() {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
    
    /**
     * 清理框选事件监听器
     */
    private cleanupSelectionEvents() {
        document.removeEventListener('mousemove', this.handleSelectionMove);
        document.removeEventListener('mouseup', this.handleSelectionEnd);
    }
    
    /**
     * 清理资源
     */
    destroy() {
        // 移除选择框
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
        
        // 清除选择状态
        this.clearSelection();
        
        // 移除所有事件监听器
        this.highlightContainer.removeEventListener('mousedown', this.handleSelectionStart);
        this.cleanupMouseEvents();
        this.cleanupSelectionEvents();
    }
}

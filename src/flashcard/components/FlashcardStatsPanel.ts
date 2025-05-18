import { setIcon } from "obsidian";
import { FSRSManager } from "../services/FSRSManager";
import { DailyStats } from "../types/FSRSTypes";

/**
 * 闪卡统计面板，显示学习统计数据和热力图
 */
export class FlashcardStatsPanel {
    private containerEl: HTMLElement;
    private fsrsManager: FSRSManager;
    
    constructor(containerEl: HTMLElement, fsrsManager: FSRSManager) {
        this.containerEl = containerEl;
        this.fsrsManager = fsrsManager;
    }
    
    /**
     * 渲染统计面板
     */
    render() {
        this.containerEl.empty();
        this.containerEl.addClass('flashcard-stats-panel');
        
        // 创建统计数据区域
        this.renderStatsArea();
        
        // 创建热力图区域
        this.renderHeatmap();
    }
    
    /**
     * 渲染统计数据区域
     */
    private renderStatsArea() {
        const statsArea = this.containerEl.createDiv('flashcard-stats-area');
        
        // 获取学习进度数据
        const progress = this.fsrsManager.getProgress();
        
        // 创建统计项
        this.createStatItem(statsArea, progress.newCards.toString(), '未学习', 'flashcard-stat-new');
        this.createStatItem(statsArea, progress.learned.toString(), '学习中', 'flashcard-stat-learning');
        this.createStatItem(statsArea, progress.due.toString(), '待复习', 'flashcard-stat-due');
    }
    
    /**
     * 创建单个统计项
     */
    private createStatItem(container: HTMLElement, value: string, label: string, className: string) {
        const statItem = container.createDiv(`flashcard-stat-item ${className}`);
        const valueEl = statItem.createDiv('flashcard-stat-value');
        valueEl.textContent = value;
        
        const labelEl = statItem.createDiv('flashcard-stat-label');
        labelEl.textContent = label;
    }
    
    /**
     * 渲染热力图区域
     */
    private renderHeatmap() {
        const heatmapArea = this.containerEl.createDiv('flashcard-heatmap-area');
        
        // 获取每日学习统计数据
        const dailyStats = (this.fsrsManager as any).storage?.dailyStats || [];
        
        // 创建热力图
        this.createHeatmap(heatmapArea, dailyStats);
    }
    
    /**
     * 创建热力图
     */
    private createHeatmap(container: HTMLElement, dailyStats: DailyStats[]) {
        // 创建热力图容器
        const heatmapContainer = container.createDiv('flashcard-heatmap-container');
        
        // 获取过去84天的日期（7行*12列）
        const today = new Date();
        const startDate = new Date();
        startDate.setDate(today.getDate() - 84); // 固定显示84天，对应7*12的热力图
        
        // 创建日期映射，用于快速查找特定日期的数据
        const dateMap = new Map();
        dailyStats.forEach(stat => {
            const date = new Date(stat.date);
            const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
            dateMap.set(dateKey, stat);
        });
        
        // 创建热力图单元格
        const rows = 7; // 一周7天
        const cols = 12; // 84天约12周
        
        // 创建热力图网格
        const grid = heatmapContainer.createDiv('flashcard-heatmap-grid');
        
        // 设置网格样式
        grid.style.display = 'grid';
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        
        // 填充热力图单元格
        let currentDate = new Date(startDate);
        
        // 调整到周一开始
        const dayOfWeek = currentDate.getDay();
        currentDate.setDate(currentDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        
        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                const date = new Date(currentDate);
                date.setDate(date.getDate() + row);
                
                // 跳过未来的日期
                if (date > today) {
                    continue;
                }
                
                const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
                const stat = dateMap.get(dateKey);
                
                const cell = grid.createDiv('flashcard-heatmap-cell');
                
                // 根据学习活动设置颜色深浅
                if (stat) {
                    const intensity = Math.min(stat.cardsReviewed + stat.newCardsLearned, 20);
                    const level = Math.ceil(intensity / 4); // 0-5级深浅
                    cell.addClass(`flashcard-heatmap-level-${level}`);
                    
                    // 添加提示信息
                    cell.setAttribute('title', `${date.toLocaleDateString()}: 学习了${stat.newCardsLearned}张新卡片，复习了${stat.cardsReviewed}张卡片`);
                } else {
                    cell.addClass('flashcard-heatmap-level-0');
                }
            }
            
            // 移动到下一周
            currentDate.setDate(currentDate.getDate() + 7);
        }
    }
    
    /**
     * 添加缩放控制 - 已删除，使用固定天数
     */
    private addZoomControl(container: HTMLElement, heatmapContainer: HTMLElement) {
        // 不再需要缩放控制，使用固定天数
    }
}

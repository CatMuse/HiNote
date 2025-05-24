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
        // 直接在主容器中创建热力图
        this.createHeatmap(this.containerEl, (this.fsrsManager as any).storage?.dailyStats || []);
    }
    
    /**
     * 创建热力图
     */
    private createHeatmap(container: HTMLElement, dailyStats: DailyStats[]) {
        // 创建热力图网格（直接在容器中创建，减少嵌套）
        const grid = container.createDiv('flashcard-heatmap-grid');
        
        // 添加调试信息 - 当前日期
        const today = new Date();
        console.log('当前日期:', today, '星期:', today.getDay());
        
        // 获取过去84天的日期（7行*12列）
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 83); // 调整为83天，确保包含当天
        
        // 创建日期映射，用于快速查找特定日期的数据
        const dateMap = new Map();
        
        // 添加调试信息
        console.log('热力图数据:', dailyStats);
        
        // 手动添加当天的数据（如果不存在）
        const todayDate = new Date(today);
        todayDate.setHours(0, 0, 0, 0);
        const todayTimestamp = todayDate.getTime();
        const todayKey = `${todayDate.getFullYear()}-${todayDate.getMonth() + 1}-${todayDate.getDate()}`;
        
        console.log('当天的日期键:', todayKey);
        
        // 检查是否有当天的数据
        let hasTodayData = false;
        
        // 使用真实的学习数据
        const allStats = [...dailyStats];
        
        // 添加调试信息
        console.log('学习数据数量:', allStats.length);
        
        // 处理所有数据
        allStats.forEach(stat => {
            // 将时间戳转换为日期对象
            const date = new Date(stat.date);
            
            // 获取日期的年、月、日
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            
            // 创建日期键
            const dateKey = `${year}-${month}-${day}`;
            
            // 检查是否是当天的数据
            if (dateKey === todayKey) {
                hasTodayData = true;
            }
            
            // 添加调试信息
            console.log(`日期映射: ${stat.date} -> ${dateKey}`, date);
            
            // 存储到映射中（如果有重复的日期，使用最后一条数据）
            dateMap.set(dateKey, stat);
        });
        
        // 如果没有当天的数据，手动添加一个空的记录
        // 这样即使当天没有学习数据，也会显示一个空单元格
        if (!hasTodayData) {
            console.log('没有当天数据，添加空记录');
            dateMap.set(todayKey, {
                date: todayTimestamp,
                newCardsLearned: 0,
                cardsReviewed: 0,
                reviewCount: 0,
                newCount: 0,
                againCount: 0,
                hardCount: 0,
                goodCount: 0,
                easyCount: 0
            });
        }
        
        // 创建热力图单元格
        const rows = 7; // 一周7天
        const cols = 12; // 84天约12周
        
        // 设置网格样式
        grid.style.display = 'grid';
        grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        
        // 重新设计热力图布局，确保当天在正确位置
        // 先计算当天是周几（0是周日，1-6是周一到周六）
        const todayDayOfWeek = today.getDay();
        // 在热力图中，周一在第0行，周六在第5行，周日在第6行
        const todayRowIndex = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
        
        console.log('当天是周几:', todayDayOfWeek, '在热力图中的行索引:', todayRowIndex);
        
        // 我们希望当天显示在最后一列（第11列）
        // 计算当前周的周一的日期
        const thisWeekMonday = new Date(today);
        thisWeekMonday.setDate(today.getDate() - ((todayDayOfWeek === 0 ? 7 : todayDayOfWeek) - 1));
        
        console.log('当前周的周一:', thisWeekMonday);
        
        // 计算热力图第一列第一行（左上角）的日期
        // 往前推算11周
        const firstCellDate = new Date(thisWeekMonday);
        firstCellDate.setDate(firstCellDate.getDate() - 11 * 7);
        
        console.log('热力图左上角日期:', firstCellDate);
        
        // 创建一个二维数组来存储所有单元格的日期
        const cellDates = [];
        
        // 首先填充每一列的周一日期
        const mondayDates = [];
        for (let col = 0; col < cols; col++) {
            const mondayDate = new Date(firstCellDate);
            mondayDate.setDate(mondayDate.getDate() + col * 7);
            mondayDates.push(mondayDate);
        }
        
        // 然后对每一列，填充其他每一天
        for (let col = 0; col < cols; col++) {
            const colDates = [];
            for (let row = 0; row < rows; row++) {
                const date = new Date(mondayDates[col]);
                date.setDate(date.getDate() + row);
                colDates.push(date);
            }
            cellDates.push(colDates);
        }
        
        // 现在我们按行和列来填充热力图
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const date = cellDates[col][row];
                
                // 跳过未来的日期
                if (date > today) {
                    continue;
                }
                
                // 获取日期的年、月、日
                const year = date.getFullYear();
                const month = date.getMonth() + 1;
                const day = date.getDate();
                
                // 创建日期键
                const dateKey = `${year}-${month}-${day}`;
                
                // 从映射中获取统计数据
                const stat = dateMap.get(dateKey);
                
                // 如果找到数据，添加调试信息
                if (stat) {
                    console.log(`找到日期 ${dateKey} 的数据:`, stat);
                }
                
                const cell = grid.createDiv('flashcard-heatmap-cell');
                
                // 检查是否是当天的单元格
                const isTodayCell = dateKey === todayKey;
                
                // 根据学习活动设置颜色深浅
                if (stat) {
                    // 新卡片学习通常需要更多精力，所以权重更高
                    let intensity = stat.newCardsLearned * 1.5 + stat.cardsReviewed;
                    
                    // 如果有评分记录，考虑难度因素
                    if (stat.reviewCount > 0) {
                        // 困难卡片权重更高
                        const difficultyFactor = (stat.againCount * 1.5 + stat.hardCount * 1.2 + stat.goodCount + stat.easyCount * 0.8) / stat.reviewCount;
                        intensity = intensity * (difficultyFactor + 0.5); // 加0.5是为了保证最小影响
                    }
                    
                    // 限制最大值
                    intensity = Math.min(intensity, 20);
                    const level = Math.ceil(intensity / 4); // 0-5级深浅
                    cell.addClass(`flashcard-heatmap-level-${level}`);
                    
                    // 添加更详细的提示信息，包括评分分布
                    let tooltipText = `${date.toLocaleDateString()}: 学习了${stat.newCardsLearned}张新卡片，复习了${stat.cardsReviewed}张卡片`;
                    
                    // 如果有评分记录，添加评分分布信息
                    if (stat.reviewCount > 0) {
                        tooltipText += `\n评分分布: 困难(${stat.againCount}), 一般(${stat.hardCount}), 良好(${stat.goodCount}), 简单(${stat.easyCount})`;
                    }
                    
                    cell.setAttribute('title', tooltipText);
                } else {
                    // 如果是当天的单元格，使用特殊样式标记
                    if (isTodayCell) {
                        // 添加当天标记类
                        cell.addClass('flashcard-heatmap-today');
                        cell.setAttribute('title', `${date.toLocaleDateString()}: 今天，还没有学习记录`);
                    } else {
                        // 非当天的空单元格
                        cell.addClass('flashcard-heatmap-level-0');
                    }
                }
            }
            
        }
    }
    
    /**
     * 添加缩放控制 - 已删除，使用固定天数
     */
    private addZoomControl(container: HTMLElement, heatmapContainer: HTMLElement) {
        // 不再需要缩放控制，使用固定天数
    }
}

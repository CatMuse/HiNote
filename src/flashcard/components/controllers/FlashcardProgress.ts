import { FlashcardProgress, FlashcardState } from "../../types/FSRSTypes";
import { t } from "../../../i18n";
import { setIcon } from "obsidian";
import type { FlashcardComponentContext } from "../FlashcardComponentContext";
import {
    calculateFlashcardProgress,
    calculateIndexProgress,
    calculateProgressPercent,
    calculateRetention,
    getCardsForProgress
} from "./FlashcardProgressStats";

/**
 * 闪卡进度管理器，负责处理进度统计和显示
 */
export class FlashcardProgressManager {
    private component: FlashcardComponentContext;
    
    constructor(component: FlashcardComponentContext) {
        this.component = component;
    }
    
    /**
     * 获取分组进度
     * @returns 分组进度信息
     */
    public getGroupProgress(): FlashcardProgress {
        const groupId = this.component.getCurrentGroupId();
        const fsrsManager = this.component.getFsrsManager();
        const cards = getCardsForProgress(fsrsManager, groupId);

        return calculateFlashcardProgress(cards, fsrsManager);
    }
    
    /**
     * 计算记忆保持率
     * @param cards 卡片列表
     * @returns 记忆保持率
     */
    public calculateRetention(cards: FlashcardState[]) {
        return calculateRetention(cards);
    }
    
    /**
     * 更新进度显示
     */
    public updateProgress() {
        const progressContainer = this.component.getProgressContainer();
        if (!progressContainer) return;
        
        progressContainer.empty();
        
        // 获取进度数据
        const progress = this.getGroupProgress();
        
        // 创建进度文本容器
        const progressText = progressContainer.createDiv({ cls: "flashcard-progress-text" });
        
        // 添加分组名称
        progressText.createSpan({
            text: this.component.getCurrentGroupName() || t('Groups'),
            cls: "group-name"
        });

        // 添加分隔符
        progressText.createSpan({
            text: "|",
            cls: "separator"
        });
        
        // 添加统计信息
        const stats = [
            { label: t('Due'), value: progress.due },
            { label: t('New'), value: progress.newCards },
            { label: t('Learned'), value: progress.learned },
            { label: t('Retention'), value: `${(progress.retention * 100).toFixed(1)}%` }
        ];

        stats.forEach((stat, index) => {
            // 添加分隔符
            if (index > 0) {
                progressText.createSpan({
                    text: "|",
                    cls: "separator"
                });
            }

            const statEl = progressText.createDiv({ cls: "stat" });
            statEl.createSpan({ text: stat.label + ": " });
            statEl.createSpan({ 
                text: stat.value.toString(),
                cls: "stat-value"
            });
            
            // 为 Retention 添加问号图标和提示
            if (stat.label === t('Retention')) {
                const helpIcon = statEl.createSpan({ cls: "help-icon" });
                setIcon(helpIcon, "help-circle");
                helpIcon.setAttribute("aria-label", 
                    t('Retention = (Total Reviews - Forget Count) / Total Reviews\n' +
                    'This metric reflects your learning effectiveness, higher means better memory retention')
                );
            }
        });
        
        // 创建进度条容器
        const progressBarContainer = progressContainer.createDiv({ cls: 'flashcard-progress-bar-container' });
        
        // 创建进度条
        const progressBar = progressBarContainer.createDiv({ cls: 'flashcard-progress-bar' });
        
        const percent = calculateProgressPercent(progress, this.component.getCards().length);
        
        // 设置进度条宽度
        progressBar.setCssProps({ width: `${percent}%` });
        
        // 添加当前卡片索引信息
        const indexContainer = progressContainer.createDiv({ cls: 'flashcard-index-container' });
        
        // 获取当前分组ID
        const groupId = this.component.getCurrentGroupId();
        
        const remainingCards = this.component.getCards().length;
        const indexProgress = calculateIndexProgress(
            this.component.getFsrsManager(),
            groupId,
            remainingCards
        );
        indexContainer.textContent = `${indexProgress.current}/${indexProgress.total}`;
    }
    
}

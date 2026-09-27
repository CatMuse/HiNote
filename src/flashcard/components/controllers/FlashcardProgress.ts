import { FlashcardProgress, FlashcardState } from "../../types/FSRSTypes";
import { t } from "../../../i18n";
import type { FlashcardComponentContext } from "../FlashcardComponentContext";
import {
    calculateFlashcardProgress,
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
        const session = this.component.getSessionProgress();
        const current = session.total ? Math.min(session.completed + 1, session.total) : 0;
        progressContainer.createDiv({
            cls: 'flashcard-progress-text',
            text: `${current} / ${session.total}`,
            attr: {
                'aria-label': t('{completed} of {total} completed', {
                    completed: session.completed,
                    total: session.total
                })
            }
        });
        const progressBarContainer = progressContainer.createDiv({ cls: 'flashcard-progress-bar-container' });
        const progressBar = progressBarContainer.createDiv({ cls: 'flashcard-progress-bar' });
        const percent = session.total ? Math.round(100 * current / session.total) : 0;
        progressBar.setCssProps({ width: `${percent}%` });
    }
    
}

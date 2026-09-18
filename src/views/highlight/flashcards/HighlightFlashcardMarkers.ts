import type CommentPlugin from "../../../../main";
import type { HighlightInfo } from "../../../types/highlight";

/** Tracks source links without owning a study view. */
export class HighlightFlashcardMarkers {
    private highlightsWithFlashcards = new Set<string>();
    constructor(private plugin: CommentPlugin) {}

    /**
     * 更新闪卡标记
     * 标记哪些高亮已经创建了闪卡
     * @param highlights 高亮列表
     */
    updateFlashcardMarkers(highlights: HighlightInfo[]): void {
        // 清空之前的标记
        this.highlightsWithFlashcards.clear();

        if (!this.plugin || !this.plugin.fsrsManager) {
            return;
        }

        const fsrsManager = this.plugin.fsrsManager;
        
        // 遍历所有高亮，记录已创建闪卡的高亮 ID
        for (const highlight of highlights) {
            if (highlight.id) {
                // 检查是否存在闪卡
                const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                // 如果存在闪卡，将高亮 ID 添加到集合中
                if (existingCards && existingCards.length > 0) {
                    this.highlightsWithFlashcards.add(highlight.id);
                }
            }
        }
    }

    /**
     * 获取闪卡标记集合
     */
    getFlashcardMarkers(): Set<string> {
        return this.highlightsWithFlashcards;
    }

    /**
     * 检查高亮是否有闪卡
     */
    hasFlashcard(highlightId: string): boolean {
        return this.highlightsWithFlashcards.has(highlightId);
    }

    destroy(): void { this.highlightsWithFlashcards.clear(); }
}

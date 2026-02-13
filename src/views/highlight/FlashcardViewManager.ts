import { App, TFile } from "obsidian";
import { FlashcardComponent } from "../../flashcard/components/FlashcardComponent";
import { HighlightInfo } from "../../types";
import CommentPlugin from "../../../main";

/**
 * 闪卡视图管理器
 * 职责：
 * 1. 管理闪卡模式的切换
 * 2. 创建和销毁闪卡组件
 * 3. 管理闪卡状态标记
 * 4. 处理闪卡相关的 UI 更新
 */
export class FlashcardViewManager {
    private flashcardComponent: FlashcardComponent | null = null;
    private isFlashcardMode: boolean = false;
    private highlightsWithFlashcards: Set<string> = new Set<string>();

    constructor(
        private app: App,
        private plugin: CommentPlugin
    ) {}

    /**
     * 获取闪卡模式状态
     */
    isInFlashcardMode(): boolean {
        return this.isFlashcardMode;
    }

    /**
     * 设置闪卡模式
     */
    setFlashcardMode(enabled: boolean): void {
        this.isFlashcardMode = enabled;
    }

    /**
     * 获取闪卡组件
     */
    getFlashcardComponent(): FlashcardComponent | null {
        return this.flashcardComponent;
    }

    /**
     * 创建闪卡组件
     * @param container 闪卡容器
     */
    createFlashcardComponent(
        container: HTMLElement
    ): FlashcardComponent | null {
        // 如果已存在，先销毁
        if (this.flashcardComponent) {
            this.destroyFlashcardComponent();
        }

        // 创建新的闪卡组件
        this.flashcardComponent = new FlashcardComponent(
            container,
            this.plugin
        );

        this.isFlashcardMode = true;
        return this.flashcardComponent;
    }

    /**
     * 销毁闪卡组件
     */
    destroyFlashcardComponent(): void {
        if (this.flashcardComponent) {
            this.flashcardComponent.deactivate();
            this.flashcardComponent = null;
        }
        this.isFlashcardMode = false;
    }

    /**
     * 退出闪卡模式
     */
    exitFlashcardMode(): void {
        this.destroyFlashcardComponent();
    }

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

    /**
     * 处理返回按钮逻辑（移动端闪卡模式）
     * @returns true 表示已处理，false 表示未处理
     */
    handleBackButton(): boolean {
        if (!this.isFlashcardMode || !this.flashcardComponent) {
            return false;
        }

        // 检查闪卡渲染器的状态
        const renderer = this.flashcardComponent.getRenderer();
        if (renderer) {
            // 如果在卡片内容页面，先返回到分组列表
            if (!renderer.isShowingSidebar()) {
                renderer.showSidebar();
                return true; // 已处理，不继续返回
            }
            // 如果已经在分组列表页面，返回 false，让外部处理返回到文件列表
        }

        return false; // 未处理或已在分组列表
    }

    /**
     * 销毁闪卡视图管理器
     */
    destroy(): void {
        this.destroyFlashcardComponent();
        this.highlightsWithFlashcards.clear();
    }
}

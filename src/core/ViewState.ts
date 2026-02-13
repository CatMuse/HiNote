import { TFile } from "obsidian";
import { HighlightInfo } from '../types';

/**
 * HiNote 视图状态管理
 * 集中管理所有视图状态数据，避免分散在 HiNoteView 中
 */
export class ViewState {
    currentFile: TFile | null = null;
    highlights: HighlightInfo[] = [];
    highlightsWithFlashcards: Set<string> = new Set<string>();
    isFlashcardMode: boolean = false;
    isDraggedToMainView: boolean = false;
    isMobileView: boolean = false;
    isSmallScreen: boolean = false;
    isShowingFileList: boolean = true;
    currentEditingHighlightId: string | null | undefined = null;

    /**
     * 判断是否在全部高亮视图
     */
    isInAllHighlightsView(): boolean {
        return this.currentFile === null;
    }

    /**
     * 重置高亮数据
     */
    resetHighlights(): void {
        this.highlights = [];
    }
}

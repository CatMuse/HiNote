import { TFile } from "obsidian";
import { HighlightInfo, CommentItem } from "../../types";
import { HiNote } from "../../CommentStore";
import { SearchManager } from "../search/SearchManager";
import { SelectionManager } from "../selection/SelectionManager";
import { BatchOperationsHandler } from "../selection/BatchOperationsHandler";
import { FileListManager } from "../filelist/FileListManager";
import { HighlightRenderManager } from "../highlight/HighlightRenderManager";
import { CommentOperationManager } from "../comment/CommentOperationManager";
import { CommentInputManager } from "../comment/CommentInputManager";
import { LayoutManager } from "../layout/LayoutManager";
import { ViewPositionDetector } from "../layout/ViewPositionDetector";
import { CanvasHighlightProcessor } from "../canvas/CanvasHighlightProcessor";

/**
 * 回调配置器
 * 职责：
 * 1. 集中配置所有 Manager 的回调函数
 * 2. 减少 CommentView 中的回调设置代码
 * 3. 提供统一的回调接口
 */
export class CallbackConfigurator {
    /**
     * 配置搜索管理器回调
     */
    configureSearchManager(
        searchManager: SearchManager,
        callbacks: {
            onSearch: (searchTerm: string, searchType: string) => Promise<void>;
            getHighlights: () => HighlightInfo[];
            getCurrentFile: () => TFile | null;
        }
    ): void {
        searchManager.setCallbacks(
            callbacks.onSearch,
            callbacks.getHighlights,
            callbacks.getCurrentFile
        );
    }

    /**
     * 配置选择管理器回调
     */
    configureSelectionManager(
        selectionManager: SelectionManager,
        batchOperationsHandler: BatchOperationsHandler | null
    ): void {
        selectionManager.setOnSelectionChange((selectedCount) => {
            if (batchOperationsHandler) {
                batchOperationsHandler.showMultiSelectActions(selectedCount);
            }
        });
    }

    /**
     * 配置批量操作处理器回调
     */
    configureBatchOperationsHandler(
        batchOperationsHandler: BatchOperationsHandler,
        callbacks: {
            getSelectedHighlights: () => Set<HighlightInfo>;
            clearSelection: () => void;
            refreshView: () => Promise<void>;
        }
    ): void {
        batchOperationsHandler.setCallbacks(
            callbacks.getSelectedHighlights,
            callbacks.clearSelection,
            callbacks.refreshView
        );
    }

    /**
     * 配置文件列表管理器回调
     * 注意：需要根据 FileListManager 的实际接口调整
     */
    configureFileListManager(
        fileListManager: FileListManager,
        callbacks: {
            onFileSelect: (file: TFile) => Promise<void>;
            onFlashcardModeToggle: () => Promise<void>;
            onAllHighlightsSelect: () => Promise<void>;
        }
    ): void {
        // TODO: 根据 FileListManager 的实际 setCallbacks 接口调整
        // fileListManager.setCallbacks(
        //     callbacks.onFileSelect,
        //     callbacks.onFlashcardModeToggle,
        //     callbacks.onAllHighlightsSelect
        // );
    }

    /**
     * 配置高亮渲染管理器回调
     * 注意：需要根据 HighlightRenderManager 的实际接口调整
     */
    configureHighlightRenderManager(
        highlightRenderManager: HighlightRenderManager,
        callbacks: {
            onJumpToHighlight: (highlight: HighlightInfo) => Promise<void>;
            onExportAsImage: (highlight: HighlightInfo & { comments?: CommentItem [] }) => Promise<void>;
            onShowCommentInput: (card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) => void;
            onAddComment: (highlight: HighlightInfo, content: string) => Promise<void>;
        }
    ): void {
        // TODO: 根据 HighlightRenderManager 的实际 setCallbacks 接口调整
        // highlightRenderManager.setCallbacks({
        //     onJumpToHighlight: callbacks.onJumpToHighlight,
        //     onExportAsImage: callbacks.onExportAsImage,
        //     onShowCommentInput: callbacks.onShowCommentInput,
        //     onAddComment: callbacks.onAddComment
        // });
    }

    /**
     * 配置评论操作管理器回调
     */
    configureCommentOperationManager(
        commentOperationManager: CommentOperationManager,
        callbacks: {
            onRefreshView: () => Promise<void>;
            onHighlightsUpdate: (highlights: HighlightInfo[]) => void;
            onCardUpdate: (highlight: HighlightInfo) => void;
        }
    ): void {
        commentOperationManager.setCallbacks({
            onRefreshView: callbacks.onRefreshView,
            onHighlightsUpdate: callbacks.onHighlightsUpdate,
            onCardUpdate: callbacks.onCardUpdate
        });
    }

    /**
     * 配置评论输入管理器回调
     */
    configureCommentInputManager(
        commentInputManager: CommentInputManager,
        callbacks: {
            onCommentSave: (highlight: HighlightInfo, content: string, existingComment?: CommentItem) => Promise<void>;
            onCommentDelete: (highlight: HighlightInfo, commentId: string) => Promise<void>;
            onCommentCancel: (highlight: HighlightInfo) => Promise<void>;
            onViewUpdate: () => Promise<void>;
        }
    ): void {
        commentInputManager.setCallbacks({
            onCommentSave: callbacks.onCommentSave,
            onCommentDelete: callbacks.onCommentDelete,
            onCommentCancel: callbacks.onCommentCancel,
            onViewUpdate: callbacks.onViewUpdate
        });
    }

    /**
     * 配置布局管理器回调
     */
    configureLayoutManager(
        layoutManager: LayoutManager,
        callbacks: {
            onCreateFloatingButton?: () => void;
            onRemoveFloatingButton?: () => void;
            onUpdateFileList?: (forceRefresh?: boolean) => Promise<void>;
        }
    ): void {
        layoutManager.setCallbacks(callbacks);
    }

    /**
     * 配置视图位置检测器回调
     */
    configureViewPositionDetector(
        viewPositionDetector: ViewPositionDetector,
        callbacks: {
            onPositionChange: (isInMainView: boolean, wasInAllHighlightsView: boolean) => Promise<void>;
        }
    ): void {
        viewPositionDetector.setCallbacks(callbacks);
    }

    /**
     * 配置 Canvas 处理器回调
     */
    configureCanvasProcessor(
        canvasProcessor: CanvasHighlightProcessor,
        callbacks: {
            onShowLoading: () => void;
            onHideLoading: () => void;
            onShowError: (message: string) => void;
            onShowEmpty: (message: string) => void;
        }
    ): void {
        canvasProcessor.setCallbacks(callbacks);
    }
}

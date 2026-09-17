import type { ViewState } from '../hinote/ViewState';
import { WorkspaceLeaf, App } from 'obsidian';

interface WorkspaceSplitLike {
    children: Array<WorkspaceSplitLike | WorkspaceLeaf>;
}

/**
 * 视图位置检测器
 * 负责检测视图是否在主区域，并处理位置变化
 */
export class ViewPositionDetector {
    private app: App;
    private leaf: WorkspaceLeaf;
    
    // 回调函数
    private onPositionChange: ((isInMainView: boolean, wasInAllHighlightsView: boolean) => Promise<void>) | null = null;
    
    // 状态
    
    constructor(app: App, leaf: WorkspaceLeaf, private state: ViewState) {
        this.app = app;
        this.leaf = leaf;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(callbacks: {
        onPositionChange?: (isInMainView: boolean, wasInAllHighlightsView: boolean) => Promise<void>;
    }) {
        if (callbacks.onPositionChange) {
            this.onPositionChange = callbacks.onPositionChange;
        }
    }
    
    /**
     * 检查视图位置
     */
    async checkViewPosition(wasInAllHighlightsView: boolean): Promise<void> {
        // 获取根布局
        const root = this.app.workspace.rootSplit;
        if (!root) return;
        
        // 检查当前视图是否在主区域
        const isInMainView = this.isViewInMainArea(this.leaf, root);
        
        // 如果位置发生变化
        if (this.state.isDraggedToMainView !== isInMainView) {
            
            // 触发位置变化回调
            if (this.onPositionChange) {
                await this.onPositionChange(isInMainView, wasInAllHighlightsView);
            }
        }
    }
    
    /**
     * 递归检查视图是否在主区域
     */
    private isViewInMainArea(leaf: WorkspaceLeaf, parent: unknown): boolean {
        if (!parent) return false;
        if (this.hasChildren(parent)) {
            return parent.children.some((child: WorkspaceSplitLike | WorkspaceLeaf) => {
                if (child === leaf) {
                    return true;
                }
                return this.isViewInMainArea(leaf, child);
            });
        }
        return false;
    }

    private hasChildren(value: unknown): value is WorkspaceSplitLike {
        return typeof value === 'object'
            && value !== null
            && 'children' in value
            && Array.isArray((value as WorkspaceSplitLike).children);
    }
    
    /**
     * 获取当前位置状态
     */
    isDraggedToMain(): boolean {
        return this.state.isDraggedToMainView;
    }
}

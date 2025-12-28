import { WorkspaceLeaf, TFile, App } from 'obsidian';

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
    private isDraggedToMainView: boolean = false;
    
    constructor(app: App, leaf: WorkspaceLeaf) {
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
     * 更新状态
     */
    updateState(state: {
        isDraggedToMainView?: boolean;
    }) {
        if (state.isDraggedToMainView !== undefined) {
            this.isDraggedToMainView = state.isDraggedToMainView;
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
        if (this.isDraggedToMainView !== isInMainView) {
            this.isDraggedToMainView = isInMainView;
            
            // 触发位置变化回调
            if (this.onPositionChange) {
                await this.onPositionChange(isInMainView, wasInAllHighlightsView);
            }
        }
    }
    
    /**
     * 递归检查视图是否在主区域
     */
    private isViewInMainArea(leaf: WorkspaceLeaf, parent: any): boolean {
        if (!parent) return false;
        if (parent.children) {
            return parent.children.some((child: any) => {
                if (child === leaf) {
                    return true;
                }
                return this.isViewInMainArea(leaf, child);
            });
        }
        return false;
    }
    
    /**
     * 获取当前位置状态
     */
    isDraggedToMain(): boolean {
        return this.isDraggedToMainView;
    }
}

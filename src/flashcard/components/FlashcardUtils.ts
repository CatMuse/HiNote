import { TFile } from "obsidian";
import { HiNote } from "../../CommentStore";

/**
 * 闪卡工具类，包含各种辅助方法
 */
export class FlashcardUtils {
    private component: any;
    
    constructor(component: any) {
        this.component = component;
    }
    
    
    /**
     * 添加页面预览功能
     * @param element 要添加预览的元素
     * @param filePath 文件路径
     */
    public addPagePreview(element: HTMLElement, filePath: string | undefined) {
        if (!filePath) return;
        
        let hoverTimeout: NodeJS.Timeout;
        
        // 添加悬停事件
        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = setTimeout(() => {
                const target = event.target as HTMLElement;
                
                // 触发 Obsidian 的页面预览事件
                this.component.getApp().workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: filePath
                });
            }, 300); // 300ms 的延迟显示
        });
        
        // 添加鼠标离开事件
        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });
    }

}
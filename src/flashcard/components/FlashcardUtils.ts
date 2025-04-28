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
     * 从高亮中提取文件路径
     * @param highlight 高亮数据
     * @returns 文件路径或空字符串
     */
    public extractFilePathFromHighlight(highlight: HiNote): string {
        // 如果高亮已经有 filePath，直接返回
        if (highlight.filePath) {
            return highlight.filePath;
        }
        
        // 尝试从数据中查找包含该高亮的文件
        try {
            // 获取当前所有数据
            const data = this.component.getFsrsManager().getPlugin().commentStore.data;
            
            // 遍历所有文件
            for (const filePath in data) {
                const fileHighlights = data[filePath];
                
                // 检查每个高亮
                for (const id in fileHighlights) {
                    const h = fileHighlights[id];
                    
                    // 如果找到相同 ID 或相同内容和位置的高亮
                    if (h.id === highlight.id || 
                        (h.text === highlight.text && 
                         Math.abs(h.position - highlight.position) < 10)) {
                        console.log('从数据中找到高亮的文件路径:', filePath);
                        return filePath;
                    }
                }
            }
            
            // 如果没有找到匹配的高亮，尝试使用当前活动文件
            const activeFile = this.component.getFsrsManager().getPlugin().app.workspace.getActiveFile();
            if (activeFile) {
                console.log('使用当前活动文件作为高亮的文件路径:', activeFile.path);
                return activeFile.path;
            }
        } catch (error) {
            console.error('提取文件路径时出错:', error);
        }
        
        return '';
    }
    
    /**
     * 格式化时间间隔显示
     * @param days 天数
     * @returns 格式化后的字符串
     */
    public formatInterval(days: number): string {
        if (days < 1) {
            const hours = Math.round(days * 24);
            return `${hours}h`;
        } else if (days < 30) {
            return `${Math.round(days)}d`;
        } else if (days < 365) {
            return `${Math.round(days / 30)}mo`;
        } else {
            return `${Math.round(days / 365)}y`;
        }
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
    
    /**
     * 过滤掉仅包含标签的评论
     * @param content 内容
     * @returns 过滤后的内容
     */
    public filterTagOnlyComments(content: string): string {
        // 如果内容只包含标签，返回空字符串
        const tagRegex = /#[\w\u4e00-\u9fa5]+/g;
        const contentWithoutTags = content.replace(tagRegex, '').trim();
        
        if (!contentWithoutTags) {
            return '';
        }
        
        return content;
    }
}
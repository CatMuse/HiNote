import { TFile, Notice, setIcon } from "obsidian";
import { HiNote, CommentStore } from "../../CommentStore";
import { HighlightInfo } from "../../types";
import { t } from "../../i18n";

/**
 * 虚拟高亮管理器
 * 职责：
 * 1. 创建和管理文件评论按钮
 * 2. 创建虚拟高亮（文件级别的评论）
 * 3. 过滤和管理虚拟高亮列表
 */
export class VirtualHighlightManager {
    private addCommentButton: HTMLElement | null = null;

    constructor(
        private commentStore: CommentStore
    ) {}

    /**
     * 创建文件评论按钮
     * @param container 按钮容器
     * @param callbacks 回调函数
     */
    createFileCommentButton(
        container: HTMLElement,
        callbacks: {
            getCurrentFile: () => TFile | null;
            getHighlights: () => HighlightInfo[];
            onVirtualHighlightCreated: (virtualHighlight: HiNote) => void;
            onShowCommentInput: (card: HTMLElement, highlight: HiNote) => void;
            getHighlightContainer: () => HTMLElement;
        }
    ): HTMLElement {
        this.addCommentButton = container.createEl("div", {
            cls: "highlight-icon-button"
        });
        
        setIcon(this.addCommentButton, "message-square-plus");
        this.addCommentButton.setAttribute("aria-label", t("Add File Comment"));

        // 添加文件评论按钮点击事件
        this.addCommentButton.addEventListener("click", async () => {
            await this.handleAddFileComment(callbacks);
        });

        return this.addCommentButton;
    }

    /**
     * 处理添加文件评论
     */
    private async handleAddFileComment(callbacks: {
        getCurrentFile: () => TFile | null;
        getHighlights: () => HighlightInfo[];
        onVirtualHighlightCreated: (virtualHighlight: HiNote) => void;
        onShowCommentInput: (card: HTMLElement, highlight: HiNote) => void;
        getHighlightContainer: () => HTMLElement;
    }): Promise<void> {
        const currentFile = callbacks.getCurrentFile();
        
        if (!currentFile) {
            new Notice(t("Please open a file first."));
            return;
        }

        // 生成唯一标识符
        const timestamp = Date.now();
        const uniqueId = `file-comment-${timestamp}`;
        
        // 创建虚拟高亮信息，在文档的最顶部创建了一个不可见的高亮内容
        const virtualHighlight: HiNote = {
            id: uniqueId,
            text: `__virtual_highlight_${timestamp}__`,  // 这个文本不会显示给用户
            filePath: currentFile.path,
            fileType: currentFile.extension,
            displayText: t("File Comment"),  // 这是显示给用户看的文本
            isVirtual: true,  // 标记这是一个虚拟高亮
            position: 0,  // 给一个默认位置
            paragraphOffset: 0,  // 给一个默认偏移量
            paragraphId: `${currentFile.path}#^virtual-${timestamp}`,  // 生成一个虚拟段落ID
            createdAt: timestamp,
            updatedAt: timestamp,
            comments: []  // 初始化空的评论数组
        };

        // 先保存到 CommentStore
        await this.commentStore.addComment(currentFile, virtualHighlight);

        // 通知外部虚拟高亮已创建
        callbacks.onVirtualHighlightCreated(virtualHighlight);

        // 找到新创建的高亮卡片并自动打开评论输入框
        setTimeout(() => {
            const highlightContainer = callbacks.getHighlightContainer();
            const highlightCard = highlightContainer.querySelector('.highlight-card') as HTMLElement;
            if (highlightCard) {
                // 自动打开评论输入框
                callbacks.onShowCommentInput(highlightCard, virtualHighlight);
                // 滚动到顶部
                highlightContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }, 100);
    }

    /**
     * 过滤虚拟高亮
     * 从存储的评论中提取虚拟高亮，排除已经在高亮列表中的
     * @param currentFile 当前文件
     * @param existingHighlights 已存在的高亮列表
     * @returns 需要添加的虚拟高亮列表
     */
    filterVirtualHighlights(
        currentFile: TFile,
        existingHighlights: HighlightInfo[]
    ): HiNote[] {
        const storedComments = this.commentStore.getFileComments(currentFile);
        const usedCommentIds = new Set<string>();
        
        // 标记已使用的评论ID
        existingHighlights.forEach(h => {
            if (h.id) usedCommentIds.add(h.id);
        });
        
        // 添加虚拟高亮（只添加有评论的虚拟高亮）
        const virtualHighlights = storedComments
            .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
        
        // 去重：确保虚拟高亮的文本不与现有高亮重复
        const uniqueVirtualHighlights = virtualHighlights.filter(vh => {
            return !existingHighlights.some(h => h.text === vh.text);
        });
        
        // 标记这些虚拟高亮为已使用
        uniqueVirtualHighlights.forEach(vh => usedCommentIds.add(vh.id));
        
        return uniqueVirtualHighlights;
    }

    /**
     * 销毁虚拟高亮管理器
     */
    destroy(): void {
        if (this.addCommentButton) {
            this.addCommentButton.remove();
            this.addCommentButton = null;
        }
    }
}

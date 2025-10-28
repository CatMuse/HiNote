import { TFile } from "obsidian";

/**
 * 文件列表 UI 辅助类
 * 提供文件列表相关的 UI 工具函数
 */
export class FileListUIHelper {
    /**
     * 切换文件列表的显示/隐藏
     */
    static toggleVisibility(container: HTMLElement, visible: boolean) {
        if (visible) {
            container.removeClass('highlight-display-none');
            container.addClass('highlight-display-block');
        } else {
            container.removeClass('highlight-display-block');
            container.addClass('highlight-display-none');
        }
    }
    
    /**
     * 切换全宽模式
     */
    static toggleFullWidth(container: HTMLElement, fullWidth: boolean) {
        if (fullWidth) {
            container.addClass('highlight-full-width');
        } else {
            container.removeClass('highlight-full-width');
        }
    }
    
    /**
     * 高亮指定的文件项
     */
    static highlightFileItem(container: HTMLElement, filePath: string | null) {
        const fileItems = container.querySelectorAll('.highlight-file-item');
        fileItems.forEach((item: HTMLElement) => {
            const itemPath = item.getAttribute('data-path');
            if (filePath === null) {
                // 高亮"全部"选项
                item.classList.toggle('is-active', item.classList.contains('highlight-file-item-all'));
            } else {
                item.classList.toggle('is-active', itemPath === filePath);
            }
        });
    }
    
    /**
     * 滚动到指定文件项
     */
    static scrollToFileItem(container: HTMLElement, filePath: string) {
        const fileItem = container.querySelector(`[data-path="${filePath}"]`);
        if (fileItem) {
            fileItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    /**
     * 获取当前选中的文件路径
     */
    static getSelectedFilePath(container: HTMLElement): string | null {
        const activeItem = container.querySelector('.highlight-file-item.is-active:not(.highlight-file-item-all):not(.highlight-file-item-flashcard)');
        if (activeItem) {
            return activeItem.getAttribute('data-path');
        }
        return null;
    }
    
    /**
     * 检查是否选中了"全部"选项
     */
    static isAllHighlightsSelected(container: HTMLElement): boolean {
        const allItem = container.querySelector('.highlight-file-item-all');
        return allItem?.classList.contains('is-active') || false;
    }
    
    /**
     * 检查是否选中了闪卡模式
     */
    static isFlashcardModeSelected(container: HTMLElement): boolean {
        const flashcardItem = container.querySelector('.highlight-file-item-flashcard');
        return flashcardItem?.classList.contains('is-active') || false;
    }
    
    /**
     * 更新文件项的高亮数量
     */
    static updateFileItemCount(container: HTMLElement, filePath: string, count: number) {
        const fileItem = container.querySelector(`[data-path="${filePath}"]`);
        if (fileItem) {
            const countEl = fileItem.querySelector('.highlight-file-item-count');
            if (countEl) {
                countEl.textContent = `${count}`;
            }
        }
    }
    
    /**
     * 更新"全部"选项的高亮数量
     */
    static updateAllHighlightsCount(container: HTMLElement, count: number) {
        const allItem = container.querySelector('.highlight-file-item-all');
        if (allItem) {
            const countEl = allItem.querySelector('.highlight-file-item-count');
            if (countEl) {
                countEl.textContent = `${count}`;
            }
        }
    }
    
    /**
     * 更新闪卡数量
     */
    static updateFlashcardCount(container: HTMLElement, count: number) {
        const flashcardItem = container.querySelector('.highlight-file-item-flashcard');
        if (flashcardItem) {
            const countEl = flashcardItem.querySelector('.highlight-file-item-count');
            if (countEl) {
                countEl.textContent = `${count}`;
            }
        }
    }
    
    /**
     * 移除指定的文件项
     */
    static removeFileItem(container: HTMLElement, filePath: string) {
        const fileItem = container.querySelector(`[data-path="${filePath}"]`);
        if (fileItem) {
            fileItem.remove();
        }
    }
    
    /**
     * 清空文件列表
     */
    static clear(container: HTMLElement) {
        container.empty();
    }
}

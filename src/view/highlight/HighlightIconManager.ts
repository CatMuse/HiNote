import { setIcon } from 'obsidian';

/**
 * 高亮图标管理器
 * 负责管理高亮卡片的图标状态
 */
export class HighlightIconManager {
    // 图标常量
    private static readonly ICONS = {
        FLASHCARD: 'book-heart',
        FILE: 'file-text',
        HIGHLIGHT: 'highlighter',
        MESSAGE: 'message-circle'
    } as const;
    
    /**
     * 更新卡片图标状态
     * @param cardElement 卡片元素
     * @param hasFlashcard 是否有闪卡
     */
    static updateCardIcons(cardElement: HTMLElement, hasFlashcard: boolean): void {
        const fileIcons = cardElement.querySelectorAll('.highlight-card-icon');
        const iconName = hasFlashcard ? this.ICONS.FLASHCARD : this.ICONS.FILE;
        
        fileIcons.forEach(icon => {
            setIcon(icon as HTMLElement, iconName);
            if (hasFlashcard) {
                (icon as HTMLElement).addClass('has-flashcard');
            } else {
                (icon as HTMLElement).removeClass('has-flashcard');
            }
        });
    }
    
    /**
     * 设置文件图标
     * @param iconElement 图标元素
     * @param hasFlashcard 是否有闪卡
     */
    static setFileIcon(iconElement: HTMLElement, hasFlashcard: boolean): void {
        const iconName = hasFlashcard ? this.ICONS.FLASHCARD : this.ICONS.FILE;
        setIcon(iconElement, iconName);
        
        if (hasFlashcard) {
            iconElement.addClass('has-flashcard');
        } else {
            iconElement.removeClass('has-flashcard');
        }
    }
    
    /**
     * 设置高亮图标
     * @param iconElement 图标元素
     * @param hasFlashcard 是否有闪卡
     */
    static setHighlightIcon(iconElement: HTMLElement, hasFlashcard: boolean): void {
        const iconName = hasFlashcard ? this.ICONS.FLASHCARD : this.ICONS.HIGHLIGHT;
        setIcon(iconElement, iconName);
        
        if (hasFlashcard) {
            iconElement.addClass('has-flashcard');
        } else {
            iconElement.removeClass('has-flashcard');
        }
    }
    
    /**
     * 获取图标名称
     */
    static getIconName(type: 'flashcard' | 'file' | 'highlight' | 'message'): string {
        switch (type) {
            case 'flashcard':
                return this.ICONS.FLASHCARD;
            case 'file':
                return this.ICONS.FILE;
            case 'highlight':
                return this.ICONS.HIGHLIGHT;
            case 'message':
                return this.ICONS.MESSAGE;
            default:
                return this.ICONS.FILE;
        }
    }
}

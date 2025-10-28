import { t } from "../../i18n";

/**
 * 搜索UI辅助类
 * 负责处理搜索相关的UI交互，包括：
 * - 搜索前缀提示
 * - 提示框定位
 * - 事件监听管理
 */
export class SearchUIHelper {
    private searchInput: HTMLInputElement;
    private searchContainer: HTMLElement;
    private searchHintsEventHandlers: {
        input: (e: Event) => void;
        blur: (e: FocusEvent) => void;
        click: (e: MouseEvent) => void;
    } | null = null;
    
    constructor(searchInput: HTMLInputElement, searchContainer: HTMLElement) {
        this.searchInput = searchInput;
        this.searchContainer = searchContainer;
    }
    
    /**
     * 显示搜索前缀提示
     */
    showSearchPrefixHints() {
        // 移除可能已存在的提示元素
        const existingHints = document.querySelector('.search-prefix-hints');
        if (existingHints) {
            existingHints.remove();
        }
        
        // 创建提示容器
        const hintsContainer = document.body.createDiv({
            cls: 'search-prefix-hints show'
        });
        
        // 定义可用的搜索前缀
        const prefixes = [
            { prefix: 'all:', description: t('search-prefix-all') },
            { prefix: 'path:', description: t('search-prefix-path') },
            { prefix: 'hicard:', description: t('search-prefix-hicard') },
            { prefix: 'comment:', description: t('search-prefix-comment') }
        ];
        
        // 创建提示项
        prefixes.forEach(({ prefix, description }) => {
            const hintItem = hintsContainer.createDiv({
                cls: 'search-prefix-hint-item'
            });
            
            hintItem.createSpan({
                cls: 'search-prefix-tag',
                text: prefix
            });
            
            hintItem.createSpan({
                cls: 'search-prefix-description',
                text: description
            });
            
            // 添加点击事件
            hintItem.addEventListener('click', () => {
                this.searchInput.value = prefix + ' ';
                this.searchInput.focus();
                hintsContainer.remove();
                
                // 触发搜索
                const inputEvent = new Event('input', { bubbles: true });
                this.searchInput.dispatchEvent(inputEvent);
            });
        });
        
        // 定位提示容器
        this.positionSearchHints(hintsContainer);
        
        // 添加输入事件监听器
        const handleInputChange = () => {
            const inputValue = this.searchInput.value.trim();
            
            if (inputValue === '') {
                if (!document.body.contains(hintsContainer)) {
                    document.body.appendChild(hintsContainer);
                    this.positionSearchHints(hintsContainer);
                }
            } else {
                if (hintsContainer && document.body.contains(hintsContainer)) {
                    hintsContainer.remove();
                }
            }
        };
        
        this.searchInput.addEventListener('input', handleInputChange);
        
        // 点击其他区域隐藏提示框
        const hideHintsOnClickOutside = (e: MouseEvent) => {
            if (hintsContainer && !hintsContainer.contains(e.target as Node) && 
                e.target !== this.searchInput) {
                hintsContainer.remove();
                document.removeEventListener('click', hideHintsOnClickOutside);
            }
        };
        
        // 失去焦点时清理
        const handleBlur = () => {
            setTimeout(() => {
                if (!document.activeElement || 
                    (document.activeElement !== this.searchInput && 
                     !hintsContainer.contains(document.activeElement as Node))) {
                    hintsContainer.remove();
                }
            }, 200);
        };
        
        this.searchInput.addEventListener('blur', handleBlur);
        
        // 添加点击事件监听器
        setTimeout(() => {
            document.addEventListener('click', hideHintsOnClickOutside);
        }, 10);
        
        // 存储事件监听器引用
        this.searchHintsEventHandlers = {
            input: handleInputChange,
            blur: handleBlur,
            click: hideHintsOnClickOutside
        };
    }
    
    /**
     * 定位搜索提示容器
     */
    private positionSearchHints(hintsContainer: HTMLElement) {
        const searchRect = this.searchInput.getBoundingClientRect();
        
        hintsContainer.addClass('search-hints-container');
        hintsContainer.style.top = (searchRect.bottom + 4) + 'px';
        hintsContainer.style.left = searchRect.left + 'px';
        hintsContainer.style.width = searchRect.width + 'px';
    }
    
    /**
     * 清理资源
     */
    destroy() {
        // 移除提示框
        const existingHints = document.querySelector('.search-prefix-hints');
        if (existingHints) {
            existingHints.remove();
        }
        
        // 清理事件监听器
        if (this.searchHintsEventHandlers) {
            this.searchInput.removeEventListener('input', this.searchHintsEventHandlers.input);
            this.searchInput.removeEventListener('blur', this.searchHintsEventHandlers.blur);
            document.removeEventListener('click', this.searchHintsEventHandlers.click);
            this.searchHintsEventHandlers = null;
        }
    }
}

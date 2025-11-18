import { setIcon } from "obsidian";
import { t } from "../../i18n";

/**
 * UI 元素引用接口
 */
export interface UIElements {
    mainContainer: HTMLElement;
    fileListContainer: HTMLElement;
    mainContentContainer: HTMLElement;
    backButtonContainer: HTMLElement;
    backButton: HTMLElement;
    searchContainer: HTMLElement;
    searchInput: HTMLInputElement;
    searchLoadingIndicator: HTMLElement;
    iconButtonsContainer: HTMLElement;
    highlightContainer: HTMLElement;
    loadingIndicator: HTMLElement;
}

/**
 * UI 初始化管理器
 * 职责：
 * 1. 创建所有 UI 元素
 * 2. 设置图标和样式
 * 3. 返回 UI 元素引用供其他模块使用
 */
export class UIInitializer {
    /**
     * 初始化所有 UI 元素
     * @param container 根容器
     * @returns UI 元素引用
     */
    initializeUI(container: HTMLElement): UIElements {
        // 清空容器并添加类
        container.empty();
        container.addClass("comment-view-container");

        // 创建主容器
        const mainContainer = container.createEl("div", {
            cls: "highlight-main-container"
        });

        // 创建文件列表区域（只在主视图中显示）
        const fileListContainer = mainContainer.createEl("div", {
            cls: "highlight-file-list-container"
        });

        // 创建右侧内容区域
        const mainContentContainer = mainContainer.createEl("div", {
            cls: "highlight-content-container"
        });

        // 创建返回按钮（仅在移动端显示）
        const backButtonContainer = this.createBackButton(mainContentContainer);
        const backButton = backButtonContainer.querySelector('.highlight-back-button') as HTMLElement;

        // 创建搜索区域
        const searchContainer = mainContentContainer.createEl("div", {
            cls: "highlight-search-container"
        });

        // 创建搜索输入框
        const searchInput = this.createSearchInput(searchContainer);

        // 创建搜索加载指示器
        const searchLoadingIndicator = this.createSearchLoadingIndicator(searchContainer);

        // 创建图标按钮容器
        const iconButtonsContainer = searchContainer.createEl("div", {
            cls: "highlight-search-icons"
        });

        // 创建高亮容器
        const highlightContainer = mainContentContainer.createEl("div", {
            cls: "highlight-container"
        });

        // 创建加载指示器
        const loadingIndicator = this.createLoadingIndicator();

        return {
            mainContainer,
            fileListContainer,
            mainContentContainer,
            backButtonContainer,
            backButton,
            searchContainer,
            searchInput,
            searchLoadingIndicator,
            iconButtonsContainer,
            highlightContainer,
            loadingIndicator
        };
    }

    /**
     * 创建返回按钮
     */
    private createBackButton(parent: HTMLElement): HTMLElement {
        const backButtonContainer = parent.createEl("div", {
            cls: "highlight-back-button-container"
        });

        const backButton = backButtonContainer.createEl("div", {
            cls: "highlight-back-button"
        });

        setIcon(backButton, "arrow-left");
        backButton.createEl("span", {
            text: t("BACK"),
            cls: "highlight-back-button-text"
        });

        return backButtonContainer;
    }

    /**
     * 创建搜索输入框
     */
    private createSearchInput(parent: HTMLElement): HTMLInputElement {
        const searchInput = parent.createEl("input", {
            cls: "highlight-search-input",
            attr: {
                type: "text",
                placeholder: t("Search..."),
            }
        }) as HTMLInputElement;

        // 添加焦点和失焦事件
        searchInput.addEventListener('focus', () => {
            parent.addClass('focused');
        });

        searchInput.addEventListener('blur', () => {
            parent.removeClass('focused');
        });

        return searchInput;
    }

    /**
     * 创建搜索加载指示器
     */
    private createSearchLoadingIndicator(parent: HTMLElement): HTMLElement {
        const indicator = parent.createEl("div", {
            cls: "highlight-search-loading"
        });
        
        indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="loading-spinner"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`;
        indicator.style.display = "none";

        return indicator;
    }

    /**
     * 创建加载指示器
     */
    private createLoadingIndicator(): HTMLElement {
        const loadingIndicator = createEl("div", {
            cls: "highlight-loading-indicator",
            text: t("Loading...")
        });
        loadingIndicator.addClass('highlight-display-none');

        return loadingIndicator;
    }

    /**
     * 设置多选事件监听
     */
    setupMultiSelectListener(
        container: HTMLElement,
        onMultiSelect: () => void
    ): void {
        container.addEventListener('highlight-multi-select', (e: CustomEvent) => {
            onMultiSelect();
        });
    }
}

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
        container.addClass("hinote-view-container");

        // 创建主容器
        const mainContainer = container.createDiv({
            cls: "highlight-main-container"
        });

        // 创建文件列表区域（只在主视图中显示）
        const fileListContainer = mainContainer.createDiv({
            cls: "highlight-file-list-container"
        });

        // 创建右侧内容区域
        const mainContentContainer = mainContainer.createDiv({
            cls: "highlight-content-container"
        });

        // 创建返回按钮（仅在移动端显示）
        const { backButtonContainer, backButton } = this.createBackButton(mainContentContainer);

        // 创建搜索区域
        const searchContainer = mainContentContainer.createDiv({
            cls: "highlight-search-container"
        });

        // 创建搜索输入框
        const searchInput = this.createSearchInput(searchContainer);

        // 创建搜索加载指示器
        const searchLoadingIndicator = this.createSearchLoadingIndicator(searchContainer);

        // 创建图标按钮容器
        const iconButtonsContainer = searchContainer.createDiv({
            cls: "highlight-search-icons"
        });

        // 创建高亮容器
        const highlightContainer = mainContentContainer.createDiv({
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
    private createBackButton(parent: HTMLElement): { backButtonContainer: HTMLElement; backButton: HTMLElement } {
        const backButtonContainer = parent.createDiv({
            cls: "highlight-back-button-container"
        });

        const backButton = backButtonContainer.createDiv({
            cls: "highlight-back-button"
        });

        setIcon(backButton, "arrow-left");
        backButton.createSpan({
            text: t("BACK"),
            cls: "highlight-back-button-text"
        });

        return { backButtonContainer, backButton };
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
        });

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
        const indicator = parent.createDiv({
            cls: "highlight-search-loading"
        });

        const icon = indicator.createSpan({ cls: "loading-spinner" });
        setIcon(icon, "loader-circle");
        indicator.addClass("highlight-display-none");

        return indicator;
    }

    /**
     * 创建加载指示器
     */
    private createLoadingIndicator(): HTMLElement {
        const loadingIndicator = createDiv({
            cls: "highlight-loading-indicator",
            text: t("Loading...")
        });
        loadingIndicator.addClass('highlight-display-none');

        return loadingIndicator;
    }

}

import { SearchComponent, setIcon } from "obsidian";
import { t } from "../../i18n";

/**
 * UI 元素引用接口
 */
export interface UIElements {
    mainContainer: HTMLElement;
    workspaceBody: HTMLElement;
    fileListContainer: HTMLElement;
    mainContentContainer: HTMLElement;
    backButtonContainer: HTMLElement;
    backButton: HTMLElement;
    searchContainer: HTMLElement;
    toolbarTitle: HTMLElement;
    toolbarMeta: HTMLElement;
    searchField: HTMLElement;
    searchComponent: SearchComponent;
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

        // 主视图页头；侧栏模式通过样式隐藏标题，只保留紧凑操作栏。
        const searchContainer = mainContainer.createDiv({
            cls: "highlight-search-container"
        });
        const toolbarRow = searchContainer.createDiv({
            cls: "hinote-toolbar-row"
        });
        const titleGroup = toolbarRow.createDiv({
            cls: "hinote-toolbar-title-group"
        });
        const toolbarTitle = titleGroup.createDiv({
            text: "HINOTE",
            cls: "hinote-toolbar-title",
            attr: {
                role: "button",
                tabindex: "0",
                title: t("Refresh view"),
                "aria-label": `HINOTE: ${t("Refresh view")}`
            }
        });
        const toolbarMeta = titleGroup.createDiv({
            cls: "hinote-toolbar-meta",
            attr: { "aria-live": "polite" }
        });

        // 创建图标按钮容器
        const iconButtonsContainer = toolbarRow.createDiv({
            cls: "highlight-search-icons"
        });

        // 搜索框作为页头的第二行。
        const searchField = searchContainer.createDiv({ cls: "highlight-search-field highlight-display-none" });
        const searchComponent = new SearchComponent(searchField)
            .setPlaceholder(t("Search..."));
        const searchInput = searchComponent.inputEl;
        searchInput.addClass("highlight-search-input");
        searchInput.setAttribute("aria-label", t("Search..."));
        const searchLoadingIndicator = this.createSearchLoadingIndicator(searchField);

        // 页头下方的主工作区。
        const workspaceBody = mainContainer.createDiv({
            cls: "hinote-workspace-body"
        });

        // 创建文件列表区域（只在主视图中显示）
        const fileListContainer = workspaceBody.createDiv({
            cls: "highlight-file-list-container"
        });

        // 创建右侧内容区域
        const mainContentContainer = workspaceBody.createDiv({
            cls: "highlight-content-container"
        });

        // 保留窄窗格原有的返回入口
        const { backButtonContainer, backButton } = this.createBackButton(mainContentContainer);

        // 创建高亮容器
        const highlightContainer = mainContentContainer.createDiv({
            cls: "highlight-container"
        });

        // 创建加载指示器
        const loadingIndicator = this.createLoadingIndicator();

        return {
            mainContainer,
            workspaceBody,
            fileListContainer,
            mainContentContainer,
            backButtonContainer,
            backButton,
            searchContainer,
            toolbarTitle,
            toolbarMeta,
            searchField,
            searchComponent,
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

        const backButton = backButtonContainer.createEl('button', {
            cls: 'highlight-back-button clickable-icon',
            attr: { type: 'button', 'aria-label': t('BACK'), title: t('BACK') }
        });

        setIcon(backButton, "arrow-left");
        backButton.createSpan({
            text: t("BACK"),
            cls: "highlight-back-button-text"
        });

        return { backButtonContainer, backButton };
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

import { setIcon, Notice, ItemView, Menu, MenuItem } from "obsidian";
import { AIServiceManager } from "../services/ai";
import type CommentPlugin from "../../main";
import { t } from "../i18n";
import { HiNoteView } from "../HiNoteView";

/**
 * 内容提供者接口，用于获取 AI 分析所需的文本和评论
 */
export interface ContentProvider {
    getText: () => string;
    getComments: () => string;
}

/**
 * AI 按钮选项接口
 */
export interface AIButtonOptions {
    /** AI 响应后的回调函数 */
    onResponse: (content: string) => Promise<void>;
    /** 按钮的 CSS 类名 */
    buttonClass: string;
    /** 按钮的图标名称 */
    buttonIcon: string;
    /** 按钮的 aria-label 属性 */
    buttonLabel: string;
    /** 按钮的位置 */
    position: 'left' | 'right' | 'titlebar';
}

/**
 * AI 按钮组件，用于显示 AI 相关功能的按钮和下拉菜单
 */
export class AIButton {
    private container: HTMLElement;
    // 移除dropdown属性
    private aiButton: HTMLElement;
    private plugin: CommentPlugin;
    private boundClickHandler: (e: MouseEvent) => void;
    private contentProvider: ContentProvider;
    private options: AIButtonOptions;

    /**
     * 创建 AI 按钮组件
     * @param container 容器元素
     * @param contentProvider 内容提供者
     * @param plugin 插件实例
     * @param options 按钮选项
     */
    constructor(
        container: HTMLElement,
        contentProvider: ContentProvider,
        plugin: CommentPlugin,
        options: AIButtonOptions
    ) {
        this.plugin = plugin;
        this.container = container;
        this.contentProvider = contentProvider;
        // 合并选项，使用传入的选项覆盖默认值
        this.options = {
            ...options
        };

        this.initButton();


        // 注册到 HiNoteView
        const view = this.plugin.app.workspace.getLeavesOfType('hinote-view')[0]?.view;
        const commentView = view instanceof HiNoteView ? view : null;
        if (commentView?.registerAIButton) {
            commentView.registerAIButton(this);
        }
    }

    /**
     * 销毁组件，清理资源
     */
    destroy() {
        // 移除事件监听器
        document.removeEventListener('click', this.boundClickHandler);

        // 从 HiNoteView 注销
        const view = this.plugin.app.workspace.getLeavesOfType('hinote-view')[0]?.view;
        const commentView = view instanceof HiNoteView ? view : null;
        if (commentView?.unregisterAIButton) {
            commentView.unregisterAIButton(this);
        }
    }

    /**
     * 初始化按钮和下拉菜单
     */
    private initButton() {
        // AI 按钮和下拉菜单容器
        const aiContainer = this.container.createEl("div", {
            cls: "highlight-ai-container"
        });

        // 根据位置设置容器类名
        if (this.options.position) {
            aiContainer.addClass(`highlight-ai-container-${this.options.position}`);
        }

        // AI 按钮
        const aiButton = aiContainer.createEl("div", {
            cls: this.options.buttonClass,
            attr: { 'aria-label': this.options.buttonLabel }
        });
        setIcon(aiButton, this.options.buttonIcon);

        // 创建下拉菜单，添加到 document.body
        // 移除自定义dropdown创建代码

        // 添加按钮点击事件
        aiButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // 保存按钮引用以便更新状态
        this.aiButton = aiButton;
    }

    /**
     * 切换下拉菜单的显示/隐藏状态
     */
    private toggleDropdown() {
        const menu = new Menu();
        const prompts = Object.entries(this.plugin.settings.ai.prompts || {});

        if (prompts.length > 0) {
            prompts.forEach(([promptName]) => {
                menu.addItem((item: MenuItem) => item
                    .setTitle(promptName)
                    .onClick(async () => {
                        await this.handleAIAnalysis(promptName);
                    })
                );
            });
        } else {
            menu.addItem((item: MenuItem) => item
                .setTitle(t("Please add Prompt in the settings first"))
                .setDisabled(true)
            );
        }

        const rect = this.aiButton.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left - 92, y: rect.bottom + 8 });
    }

    /**
     * 更新下拉菜单内容
     */
    // 移除updateDropdownContent方法

    /**
     * 处理 AI 分析
     * @param promptName 提示名称
     */
    private async handleAIAnalysis(promptName: string) {
        try {
            this.setLoading(true);

            const aiService = new AIServiceManager(this.plugin.settings.ai);
            const prompt = this.plugin.settings.ai.prompts[promptName];
            
            if (!prompt) {
                throw new Error(t(`Not found named "${promptName}" Prompt`));
            }

            // 从内容提供者获取文本和评论
            const text = this.contentProvider.getText();
            const commentsText = this.contentProvider.getComments();

            // 调用 AI 服务进行分析
            const response = await aiService.generateResponse(
                prompt,
                text,
                commentsText
            );

            // 添加 AI 分析结果
            await this.options.onResponse(response);

            new Notice(t('AI comments added'));

        } catch (error) {
            new Notice(t(`AI comments failed: ${error.message}`));
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * 设置按钮的加载状态
     * @param loading 是否处于加载状态
     */
    private setLoading(loading: boolean) {
        if (loading) {
            this.aiButton.addClass('loading');
            setIcon(this.aiButton, 'loader');
        } else {
            this.aiButton.removeClass('loading');
            setIcon(this.aiButton, this.options.buttonIcon || "bot-message-square");
        }
    }

    /**
     * 获取按钮元素
     */
    public getButtonElement(): HTMLElement {
        return this.aiButton;
    }
}
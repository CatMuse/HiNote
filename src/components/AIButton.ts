import { setIcon, Notice, ItemView, Menu, MenuItem } from "obsidian";
import { AIService } from "../services/AIService";
import type CommentPlugin from "../../main";
import { t } from "../i18n";
import { CommentView } from "../CommentView";

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
    buttonClass?: string;
    /** 按钮的图标名称 */
    buttonIcon?: string;
    /** 按钮的 aria-label 属性 */
    buttonLabel?: string;
    /** 按钮的位置 */
    position?: 'left' | 'right' | 'titlebar';

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
        this.options = {
            buttonClass: "highlight-action-btn highlight-ai-btn",
            buttonIcon: "bot-message-square",
            buttonLabel: t('AI 分析'),
            position: 'left',
            ...options
        };

        this.initButton();


        // 注册到 CommentView
        const view = this.plugin.app.workspace.getLeavesOfType('comment-view')[0]?.view;
        const commentView = view instanceof CommentView ? view : null;
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

        // 从 CommentView 注销
        const view = this.plugin.app.workspace.getLeavesOfType('comment-view')[0]?.view;
        const commentView = view instanceof CommentView ? view : null;
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
            cls: this.options.buttonClass || "",
            attr: { 'aria-label': this.options.buttonLabel || t('AI 分析') }
        });
        setIcon(aiButton, this.options.buttonIcon || "bot");

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
                .setTitle(t("请在设置中添加 Prompt"))
                .setDisabled(true)
            );
        }

        const rect = this.aiButton.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom });
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

            const aiService = new AIService(this.plugin.settings.ai);
            const prompt = this.plugin.settings.ai.prompts[promptName];
            
            if (!prompt) {
                throw new Error(t(`未找到名为 "${promptName}" 的 Prompt`));
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

            new Notice(t('AI 评论已添加'));

        } catch (error) {
            new Notice(t(`AI 评论失败: ${error.message}`));
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
     * 关闭下拉菜单
     */
    // 移除closeDropdown方法

    /**
     * 获取按钮元素
     */
    public getButtonElement(): HTMLElement {
        return this.aiButton;
    }

    /**
     * 获取下拉菜单元素
     */
    // 移除getDropdownElement方法
}
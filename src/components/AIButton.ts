import { setIcon, Notice } from "obsidian";
import { HighlightInfo } from "../types";
import { AIService } from "../services/AIService";
import type CommentPlugin from "../../main";

export class AIButton {
    private container: HTMLElement;
    private dropdown: HTMLElement;
    private normalIcon: HTMLElement;
    private loadingIcon: HTMLElement;
    private plugin: CommentPlugin;

    constructor(
        container: HTMLElement,
        private highlight: HighlightInfo,
        plugin: CommentPlugin,
        private onCommentAdd: (content: string) => Promise<void>
    ) {
        this.plugin = plugin;
        this.container = container;
        this.initButton();
    }

    private initButton() {
        // AI 按钮和下拉菜单容器
        const aiContainer = this.container.createEl("div", {
            cls: "highlight-ai-container"
        });

        // AI 按钮
        const aiButton = aiContainer.createEl("button", {
            cls: "highlight-action-btn highlight-ai-btn",
            attr: { 'aria-label': '使用 AI 分析' }
        });

        // 创建一个包含正常图标和加载���标的容器
        const aiButtonContent = aiButton.createEl("div", {
            cls: "highlight-ai-btn-content"
        });

        // 正常状态的图标
        this.normalIcon = aiButtonContent.createEl("div", {
            cls: "highlight-ai-icon"
        });
        setIcon(this.normalIcon, "bot-message-square");

        // 加载状态的图标
        this.loadingIcon = aiButtonContent.createEl("div", {
            cls: "highlight-ai-icon-loading hidden"
        });
        setIcon(this.loadingIcon, "loader");

        // 创建下拉菜单
        this.dropdown = aiContainer.createEl("div", {
            cls: "highlight-ai-dropdown hidden"
        });

        // 防止下拉菜单的点击事件冒泡
        this.dropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        // 初始化下拉菜单内容
        this.updateDropdownContent();

        // 添加按钮点击事件
        aiButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });
    }

    private toggleDropdown() {
        if (this.dropdown.hasClass("hidden")) {
            // 关闭其他所有下拉菜单
            document.querySelectorAll('.highlight-ai-dropdown').forEach((dropdown) => {
                if (dropdown !== this.dropdown) {
                    dropdown.addClass("hidden");
                }
            });
            this.dropdown.removeClass("hidden");
        } else {
            this.dropdown.addClass("hidden");
        }
    }

    public updateDropdownContent() {
        // 清空���有内容
        this.dropdown.empty();

        // 获取所有可用的 prompts
        const prompts = Object.entries(this.plugin.settings.ai.prompts || {});
        if (prompts.length > 0) {
            prompts.forEach(([promptName, promptContent]) => {
                const promptItem = this.dropdown.createEl("div", {
                    cls: "highlight-ai-dropdown-item",
                    text: promptName
                });
                promptItem.addEventListener("click", async () => {
                    this.dropdown.addClass("hidden");
                    await this.handleAIAnalysis(promptName);
                });
            });
        } else {
            // 如果没有可用的 prompts，显示提示信息
            this.dropdown.createEl("div", {
                cls: "highlight-ai-dropdown-item",
                text: "请先在设置中添加 Prompt"
            });
        }
    }

    private async handleAIAnalysis(promptName: string) {
        try {
            this.setLoading(true);

            const aiService = new AIService(this.plugin.settings.ai);
            const prompt = this.plugin.settings.ai.prompts[promptName];
            
            if (!prompt) {
                throw new Error(`未找到名为 "${promptName}" 的 Prompt`);
            }

            // 获取所有评论内容
            const comments = this.highlight.comments || [];
            const commentsText = comments.map(comment => comment.content).join('\n');

            // 调用 AI 服务进行分析
            const response = await aiService.generateResponse(
                prompt,
                this.highlight.text,
                commentsText
            );

            // 添加 AI 分析结果作为新评论
            await this.onCommentAdd(response);

            new Notice('AI 分析已添加为新评论');

        } catch (error) {
            console.error('AI 分析失败:', error);
            new Notice(`AI 分析失败: ${error.message}`);
        } finally {
            this.setLoading(false);
        }
    }

    private setLoading(loading: boolean) {
        if (loading) {
            this.normalIcon.addClass('hidden');
            this.loadingIcon.removeClass('hidden');
        } else {
            this.normalIcon.removeClass('hidden');
            this.loadingIcon.addClass('hidden');
        }
    }

    // 用于外部关闭下拉菜单
    public closeDropdown() {
        this.dropdown.addClass("hidden");
    }
} 
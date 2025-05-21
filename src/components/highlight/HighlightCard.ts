import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { CommentList } from "./CommentList";
import { UnfocusedCommentInput } from "../comment/UnfocusedCommentInput";
import { MarkdownView, Notice, TFile, WorkspaceLeaf, HoverParent, HoverPopover, MarkdownPreviewView, setIcon } from "obsidian";
import { DragPreview } from './DragPreview';
import { VIEW_TYPE_COMMENT } from '../../CommentView';
import { t } from "../../i18n";
import { DragContentGenerator } from "./DragContentGenerator";
import { AIButton } from "../AIButton";
import { AIService } from "../../services/AIService";

export class HighlightCard {
    // 静态方法：获取所有选中的卡片
    public static getSelectedCards(): Set<HTMLElement> {
        return HighlightCard.selectedCards;
    }
    
    // 静态方法：清除所有选中状态
    public static clearSelection(): void {
        HighlightCard.selectedCards.forEach(card => {
            card.removeClass('selected');
        });
        HighlightCard.selectedCards.clear();
        HighlightCard.lastSelectedCard = null;
    }
    
    // 静态方法：清除所有卡片上的不聚焦输入框
    public static clearAllUnfocusedInputs(): void {
        HighlightCard.cardInstances.forEach(instance => {
            if (instance.unfocusedInput) {
                instance.unfocusedInput.hide();
                instance.unfocusedInput = null;
            }
        });
    }
    
    private card: HTMLElement;
    private static selectedCards: Set<HTMLElement> = new Set<HTMLElement>();
    private static lastSelectedCard: HTMLElement | null = null;
    private static cardInstances = new Set<HighlightCard>();
    private fileName: string | undefined;
    private isEditing = false;
    private aiDropdown: HTMLElement | null = null;
    private aiButton: HTMLElement | null = null;
    private unfocusedInput: UnfocusedCommentInput | null = null;

    constructor(
        private container: HTMLElement,
        private highlight: HighlightInfo,
        private plugin: CommentPlugin,
        private options: {
            onHighlightClick: (highlight: HighlightInfo) => Promise<void>;
            onCommentAdd: (highlight: HighlightInfo) => void;
            onExport: (highlight: HighlightInfo) => void;
            onCommentEdit: (highlight: HighlightInfo, comment: CommentItem) => void;
            onAIResponse: (content: string) => Promise<void>;
        },
        private isInMainView: boolean = false,
        fileName?: string
    ) {
        this.fileName = fileName;
        this.highlight = highlight;
        this.plugin = plugin;
        this.options = options;
        this.fileName = this.highlight.filePath?.split('/').pop();
        
        // 注册卡片实例
        HighlightCard.cardInstances.add(this);
        
        this.render();
    }

    private render() {
        this.card = this.container.createEl("div", {
            cls: `highlight-card ${this.highlight.isVirtual ? 'virtual-highlight-card' : ''}`,
            attr: {
                'data-highlight': JSON.stringify(this.highlight)
            }
        });

        // 添加点击事件用于切换选中状态，支持多选
        this.card.addEventListener("click", (e: MouseEvent) => {
            // 如果正在编辑，不触发选中状态切换
            if (this.isEditing) {
                return;
            }
            this.selectCard(e);
        });
        
        // 创建高亮卡片标题栏
        const titleBar = this.card.createEl("div", {
            cls: "highlight-card-title-bar"
        });
        
        // 标题栏左侧区域
        const titleBarLeft = titleBar.createEl("div", {
            cls: "highlight-card-title-left"
        });
        

        
        // 标题栏右侧区域 (用于放置按钮)
        const titleBarRight = titleBar.createEl("div", {
            cls: "highlight-card-title-right"
        });
        
        // 在主视图下显示文件名
        if (this.isInMainView && this.fileName) {
            // 添加文件图标
            const fileIcon = titleBarLeft.createEl("div", {
                cls: "highlight-card-icon",
                attr: {
                    'aria-label': t('Open (DoubleClick)'),
                }
            });
            
            // 检查该高亮是否已创建闪卡
            const hasFlashcard = this.checkHasFlashcard();
            if (hasFlashcard) {
                setIcon(fileIcon, "book-heart");
                fileIcon.addClass("has-flashcard");
            } else {
                setIcon(fileIcon, "file-text");
            }
            
            // 添加双击事件
            fileIcon.addEventListener("dblclick", async (e) => {
                e.stopPropagation(); // 阻止事件冒泡

                // 获取文件路径，优先使用 highlight.filePath，如果不存在则使用 fileName
                const filePath = this.highlight.filePath || this.fileName;
                if (!filePath) return;

                // 获取文件
                const abstractFile = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (!abstractFile || !(abstractFile instanceof TFile)) return;

                // 先获取所有 markdown 叶子
                const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
                
                // 获取当前活动的叶子
                const activeLeaf = this.plugin.app.workspace.activeLeaf;
                
                // 尝试找到一个不是当前活动叶子的 markdown 叶子
                let targetLeaf = leaves.find(leaf => leaf !== activeLeaf);
                
                // 如果没有找到其他叶子，创建一个新的
                if (!targetLeaf) {
                    targetLeaf = this.plugin.app.workspace.getLeaf('split', 'vertical');
                }
                
                // 在目标 leaf 中打开文件
                await targetLeaf.openFile(abstractFile);

                // 定位到高亮位置
                if (this.highlight.position !== undefined) {
                    const view = targetLeaf.view;
                    if (view.getViewType() === 'markdown') {
                        // 如果是 markdown 视图，则获取其编辑器
                        const editor = view.getViewType() === 'markdown' ? (view as MarkdownView).editor : null;
                        if (editor) {
                            const pos = editor.offsetToPos(this.highlight.position);
                            editor.setCursor(pos);
                            editor.scrollIntoView({from: pos, to: pos}, true);
                        }
                    }
                }
            });
            
            // 添加文件名文本
            const fileNameText = titleBarLeft.createEl("span", {
                text: this.fileName,
                cls: "highlight-card-title-text"
            });
            
            // 添加拖拽属性
            titleBarLeft.setAttribute("draggable", "true");
            
            // 预先生成 Block ID，确保拖拽时可以使用
            if (this.highlight && this.highlight.filePath && typeof this.highlight.position === 'number') {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    // 异步预生成 Block ID，但不阻塞界面
                    this.generateDragContent().catch(error => {
                        console.error('[HighlightCard] Error pre-generating block ID:', error);
                    });
                }
            }
            
            // 添加拖拽事件
            titleBarLeft.addEventListener("dragstart", async (e: DragEvent) => {
                try {
                    // 首先确保 highlight 对象存在并且有所需的属性
                    if (!this.highlight || !this.highlight.text) {
                        throw new Error('Invalid highlight data');
                    }

                    // 尝试异步生成带有 Block ID 的内容
                    // 设置一个超时，避免拖拽操作等待太久
                    let formattedContent;
                    try {
                        const timeoutPromise = new Promise<string>((_, reject) => {
                            setTimeout(() => reject(new Error('Block ID generation timeout')), 300);
                        });
                        
                        // 使用 Promise.race 确保不会等待太久
                        formattedContent = await Promise.race([
                            this.generateDragContent(),
                            timeoutPromise
                        ]);
                    } catch (timeoutError) {
                        // 如果超时或出错，回退到同步方法
                        console.debug('[HighlightCard] Using sync fallback for drag content:', timeoutError);
                        formattedContent = this.generateDragContentSync();
                    }
                    
                    // 使用 text/plain 格式来确保编辑器能正确识别 Markdown 格式
                    e.dataTransfer?.setData("text/plain", formattedContent);
                    
                    // 保存原始数据以供其他用途
                    const highlightData = JSON.stringify(this.highlight);
                    e.dataTransfer?.setData("application/highlight", highlightData);
                    
                    titleBarLeft.addClass("dragging");
                    
                    // 使用 DragPreview 替代原来的预览处理
                    DragPreview.start(e, this.highlight.text);
                } catch (error) {
                    console.error('[HighlightCard] Error during drag start:', error);
                    // 防止错误时的拖拽
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            titleBarLeft.addEventListener("dragend", () => {
                titleBarLeft.removeClass("dragging");
                DragPreview.clear();
            });
            
            // 添加页面预览功能
            this.addPagePreview(fileNameText, this.highlight.filePath || this.fileName);
        } 
        // 在非主视图下显示 BlockID
        else {
            // 添加高亮图标
            const highlightIcon = titleBarLeft.createEl("div", {
                cls: "highlight-card-icon"
            });
            
            // 检查该高亮是否已创建闪卡
            const hasFlashcard = this.checkHasFlashcard();
            if (hasFlashcard) {
                setIcon(highlightIcon, "book-heart");
                highlightIcon.addClass("has-flashcard");
            } else {
                setIcon(highlightIcon, "highlighter");
            }
            
            // 添加 BlockID 显示
            if (this.highlight.blockId || this.highlight.paragraphId) {
                const blockIdEl = titleBarLeft.createEl("div", {
                    cls: "highlight-card-blockid"
                });
                
                // 优先显示 blockId，如果没有则显示 paragraphId
                const idToShow = this.highlight.blockId || this.highlight.paragraphId || '';

                // 创建 ID 值
                const idValue = blockIdEl.createEl("span", {
                    cls: "highlight-card-blockid-value",
                    text: idToShow
                });
                
                // 设置工具提示
                blockIdEl.setAttribute("title", idToShow);
            }
        }
        
        // 在标题栏右侧添加操作按钮
        
        // AI 按钮和下拉菜单容器
        const aiContainer = titleBarRight.createEl("div", {
            cls: "highlight-ai-container"
        });
        
        // AI 按钮
        const aiButton = titleBarRight.createEl("div", {
            cls: "highlight-title-btn highlight-ai-btn",
            attr: { 'aria-label': t('AI Analysis') }
        });
        this.aiButton = aiButton;
        setIcon(aiButton, "bot-message-square");
        
        // 创建下拉菜单
        const dropdown = aiContainer.createEl("div", {
            cls: "highlight-ai-dropdown hi-note-hidden"
        });
        
        // 防止下拉菜单的点击事件冒泡
        dropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
        
        // 添加按钮点击事件
        aiButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleAIDropdown(dropdown);
        });
        
        // 更新下拉菜单内容
        this.updateAIDropdownContent(dropdown, aiButton);
        
        // 创建更多操作的容器
        const moreActionsContainer = titleBarRight.createEl("div", {
            cls: "highlight-more-actions-container"
        });
        
        // 更多操作按钮（垂直省略号）
        const moreActionsBtn = moreActionsContainer.createEl("div", {
            cls: "highlight-title-btn highlight-more-btn",
            attr: { 'aria-label': t('More Actions') }
        });
        setIcon(moreActionsBtn, "ellipsis-vertical");
        
        // 创建下拉菜单
        const moreActionsDropdown = moreActionsContainer.createEl("div", {
            cls: "highlight-more-dropdown hi-note-hidden"
        });
        
        // 防止下拉菜单的点击事件冒泡
        moreActionsDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
        
        // 添加按钮点击事件
        moreActionsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleMoreActionsDropdown(moreActionsDropdown);
        });
        
        // 添加创建 HiCard 选项到下拉菜单
        const createHiCardItem = moreActionsDropdown.createEl("div", {
            cls: "highlight-more-dropdown-item",
            text: t('Create HiCard')
        });
        
        // 添加点击事件
        createHiCardItem.addEventListener("click", (e) => {
            e.stopPropagation();
            moreActionsDropdown.addClass("hi-note-hidden");
            
            // 调用创建 HiCard 的逻辑
            this.handleCreateHiCard();
        });
        
        // 添加分隔线
        moreActionsDropdown.createEl("div", {
            cls: "highlight-more-dropdown-divider"
        });
        
        // 添加导出图片选项到下拉菜单
        const exportItem = moreActionsDropdown.createEl("div", {
            cls: "highlight-more-dropdown-item",
            text: t('Export as Image')
        });
        
        // 添加点击事件
        exportItem.addEventListener("click", (e) => {
            e.stopPropagation();
            moreActionsDropdown.addClass("hi-note-hidden");
            
            // 确保导出时包含文件名
            const highlightWithFileName = { ...this.highlight };
            if (this.fileName) {
                highlightWithFileName.fileName = this.fileName;
            }
            this.options.onExport(highlightWithFileName);
        });

        // 在主视图中预先生成 Block ID
        if (this.isInMainView && this.fileName) {
            
            // 预先生成 Block ID，确保拖拽时可以使用
            if (this.highlight && this.highlight.filePath && typeof this.highlight.position === 'number') {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    // 异步预生成 Block ID，但不阻塞界面
                    this.generateDragContent().catch(error => {
                        console.error('[HighlightCard] Error pre-generating block ID:', error);
                    });
                }
            }




        }

        // 创建 content 容器
        const contentEl = this.card.createEl("div", {
            cls: "highlight-content"
        });

        // 渲染高亮内容
        new HighlightContent(
            contentEl,
            this.highlight,
            this.options.onHighlightClick
        );

        // 渲染评论列表 (在 card 容器内)
        new CommentList(
            this.card,
            this.highlight,
            (comment) => {
                this.isEditing = true;
                this.selectCard(); // 在进入编辑模式时选中卡片
                this.options.onCommentEdit(this.highlight, comment);
            }
        );
    }

    // 添加选中卡片的方法，支持多选
    private selectCard(event?: MouseEvent) {
        // 先清除所有卡片上的不聚焦输入框
        HighlightCard.clearAllUnfocusedInputs();
        
        // 如果按住 Shift 键，则进行多选
        if (event && event.shiftKey && HighlightCard.lastSelectedCard) {
            // 保持上一个选中的卡片状态
            HighlightCard.selectedCards.add(HighlightCard.lastSelectedCard);
            // 添加当前卡片到选中集合
            HighlightCard.selectedCards.add(this.card);
            this.card.addClass('selected');
            
            // 触发自定义事件，通知 CommentView 多选状态变化
            const customEvent = new CustomEvent('highlight-multi-select', {
                detail: {
                    selectedCards: Array.from(HighlightCard.selectedCards),
                    lastSelected: this.card
                },
                bubbles: true
            });
            this.card.dispatchEvent(customEvent);
            
            // 多选模式下不显示输入框
        } else {
            // 单选模式，清除之前的所有选择
            HighlightCard.selectedCards.forEach(card => {
                if (card !== this.card) {
                    card.removeClass('selected');
                }
            });
            HighlightCard.selectedCards.clear();
            
            // 选中当前卡片
            this.card.addClass('selected');
            HighlightCard.selectedCards.add(this.card);
            
            // 在单选模式下显示不聚焦的批注输入框
            this.showUnfocusedCommentInput();
        }
        
        // 更新最后选中的卡片
        HighlightCard.lastSelectedCard = this.card;
    }
    
    // 清除所有卡片上的不聚焦输入框
    private clearAllUnfocusedInputs() {
        // 清除当前卡片的输入框
        if (this.unfocusedInput) {
            this.unfocusedInput.remove();
            this.unfocusedInput = null;
        }
        
        // 清除其他卡片的输入框
        HighlightCard.selectedCards.forEach(card => {
            const cardInstance = this.findCardInstanceByElement(card);
            if (cardInstance && cardInstance.unfocusedInput) {
                cardInstance.unfocusedInput.remove();
                cardInstance.unfocusedInput = null;
            }
        });
    }
    
    // 显示不聚焦的批注输入框
    private showUnfocusedCommentInput() {
        // 如果已经有不聚焦的输入框，先移除
        if (this.unfocusedInput) {
            this.unfocusedInput.remove();
            this.unfocusedInput = null;
        }
        
        // 如果正在编辑，不显示不聚焦的输入框
        if (this.isEditing) {
            return;
        }
        
        // 获取高亮内容容器
        const contentEl = this.card.querySelector('.highlight-content');
        if (!contentEl) return;
        
        // 创建不聚焦的批注输入框，放在高亮内容下方
        this.unfocusedInput = new UnfocusedCommentInput(
            contentEl as HTMLElement,
            this.highlight,
            () => {
                // 点击不聚焦的输入框时，移除它并显示真正的输入框
                if (this.unfocusedInput) {
                    this.unfocusedInput.remove();
                    this.unfocusedInput = null;
                }
                this.options.onCommentAdd(this.highlight);
            }
        );
    }
    
    // 根据 DOM 元素查找对应的 HighlightCard 实例
    private findCardInstanceByElement(element: HTMLElement): HighlightCard | null {
        // 这里我们需要一个方法来根据 DOM 元素找到对应的 HighlightCard 实例
        // 由于我们没有一个全局的映射关系，这里使用一个简单的方法：
        // 通过 data-highlight 属性获取高亮信息，然后与当前实例比较
        try {
            const highlightData = element.getAttribute('data-highlight');
            if (highlightData) {
                const highlight = JSON.parse(highlightData) as HighlightInfo;
                if (highlight.id === this.highlight.id) {
                    return this;
                }
            }
        } catch (e) {
            // 忽略解析错误
        }
        return null;
    }

    public getElement(): HTMLElement {
        return this.card;
    }

    private addPagePreview(element: HTMLElement, filePath: string | undefined) {
        if (!filePath) return;

        // 获取文件对象
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return;

        let hoverTimeout: NodeJS.Timeout;

        // 添加悬停事件
        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = setTimeout(async () => {
                const target = event.target as HTMLElement;
                
                // 触发 Obsidian 的页面预览事件
                this.plugin.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300); // 300ms 的延迟显示
        });

        // 添加鼠标离开事件
        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });
    }

    public update(highlight: HighlightInfo) {
        this.highlight = highlight;
        this.isEditing = false; // 重置编辑状态
        this.card.empty();
        this.render();
    }

    // 同步生成拖拽时的格式化内容
    private generateDragContentSync(): string {
        const generator = new DragContentGenerator(this.highlight, this.plugin);
        return generator.generateSync();
    }

    // 异步生成完整的格式化内容，包含 Block ID 的生成和更新
    private async generateDragContent(): Promise<string> {
        const generator = new DragContentGenerator(this.highlight, this.plugin);
        return generator.generate();
    }
    
    /**
     * 切换 AI 下拉菜单的显示/隐藏状态
     * @param dropdown 下拉菜单元素
     */
    private toggleAIDropdown(dropdown: HTMLElement) {
        if (dropdown.hasClass("hi-note-hidden")) {
            // 关闭其他所有下拉菜单
            document.querySelectorAll('.highlight-ai-dropdown, .highlight-more-dropdown').forEach((otherDropdown) => {
                if (otherDropdown !== dropdown) {
                    otherDropdown.addClass("hi-note-hidden");
                }
            });
            dropdown.removeClass("hi-note-hidden");
        } else {
            dropdown.addClass("hi-note-hidden");
        }
    }
    
    /**
     * 切换更多操作下拉菜单的显示/隐藏状态
     * @param dropdown 下拉菜单元素
     */
    private toggleMoreActionsDropdown(dropdown: HTMLElement) {
        if (dropdown.hasClass("hi-note-hidden")) {
            // 关闭其他所有下拉菜单
            document.querySelectorAll('.highlight-ai-dropdown, .highlight-more-dropdown').forEach((otherDropdown) => {
                if (otherDropdown !== dropdown) {
                    otherDropdown.addClass("hi-note-hidden");
                }
            });
            dropdown.removeClass("hi-note-hidden");
        } else {
            dropdown.addClass("hi-note-hidden");
        }
    }
    
    /**
     * 更新 AI 下拉菜单的内容
     * @param dropdown 下拉菜单元素
     * @param aiButton AI 按钮元素
     */
    private updateAIDropdownContent(dropdown: HTMLElement, aiButton: HTMLElement) {
        // 清空所有内容
        dropdown.empty();

        // 获取所有可用的 prompts
        const prompts = Object.entries(this.plugin.settings.ai.prompts || {});
        if (prompts.length > 0) {
            prompts.forEach(([promptName, promptContent]) => {
                const promptItem = dropdown.createEl("div", {
                    cls: "highlight-ai-dropdown-item",
                    text: promptName
                });
                promptItem.addEventListener("click", async () => {
                    dropdown.addClass("hi-note-hidden");
                    await this.handleAIAnalysis(promptName, aiButton);
                });
            });
        } else {
            // 如果没有可用的 prompts，显示提示信息
            dropdown.createEl("div", {
                cls: "highlight-ai-dropdown-item",
                text: t("请在设置中添加 Prompt")
            });
        }
    }
    
    /**
     * 处理 AI 分析
     * @param promptName 提示名称
     * @param aiButton AI 按钮元素
     */
    private async handleAIAnalysis(promptName: string, aiButton: HTMLElement) {
        try {
            // 设置加载状态
            this.setAIButtonLoading(aiButton, true);

            const aiService = new AIService(this.plugin.settings.ai);
            const prompt = this.plugin.settings.ai.prompts[promptName];
            
            if (!prompt) {
                throw new Error(t(`未找到名为 "${promptName}" 的 Prompt`));
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
            await this.options.onAIResponse(response);

            new Notice(t('AI 评论已添加'));

        } catch (error) {
            new Notice(t(`AI 评论失败: ${error.message}`));
        } finally {
            // 恢复按钮状态
            this.setAIButtonLoading(aiButton, false);
        }
    }
    
    /**
     * 设置 AI 按钮的加载状态
     * @param aiButton AI 按钮元素
     * @param loading 是否处于加载状态
     */
    private setAIButtonLoading(aiButton: HTMLElement, loading: boolean) {
        if (loading) {
            aiButton.addClass('loading');
            setIcon(aiButton, 'loader');
        } else {
            aiButton.removeClass('loading');
            setIcon(aiButton, 'bot-message-square');
        }
    }
    
    /**
     * 检查高亮是否已经创建了闪卡
     * @returns 是否已创建闪卡
     */
    private checkHasFlashcard(): boolean {
        // 确保有 FSRSManager 实例和高亮 ID
        if (!this.plugin.fsrsManager || !this.highlight.id) {
            return false;
        }
        
        // 获取所有卡片
        const cards = this.plugin.fsrsManager.getAllCards();
        if (!cards) {
            return false;
        }
        
        // 检查是否有与当前高亮关联的卡片
        const hasCard = Object.values(cards).some(card => 
            card.sourceType === 'highlight' && 
            card.sourceId === this.highlight.id
        );
        
        return hasCard;
    }
    
    /**
     * 更新创建闪卡后的图标显示
     */
    private updateIconsAfterCardCreation() {
        // 查找卡片中的所有图标元素
        const fileIcons = this.card.querySelectorAll('.highlight-card-icon');
        
        // 更新所有图标为 book-heart
        fileIcons.forEach(icon => {
            setIcon(icon as HTMLElement, 'book-heart');
            (icon as HTMLElement).addClass('has-flashcard');
        });
    }
    
    /**
     * 处理创建 HiCard 的逻辑
     */
    private async handleCreateHiCard() {
        try {
            // 显示通知
            new Notice(t('正在创建闪卡...'));
            
            // 获取 FSRSManager 实例
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                new Notice(t('无法获取 FSRS 管理器'));
                return;
            }
            
            // 确保高亮对象有必要的属性
            console.log('创建闪卡的高亮对象:', this.highlight);
            
            // 确保高亮对象有 id
            if (!this.highlight.id) {
                new Notice(t('高亮对象缺少 ID'));
                return;
            }
            
            // 在创建闪卡之前，确保高亮内容已保存
            if (this.highlight.filePath) {
                // 获取文件对象
                const file = this.plugin.app.vault.getFileByPath(this.highlight.filePath);
                if (file) {
                    try {
                        // 直接尝试保存高亮
                        // 创建一个符合 HiNote 类型的对象
                        if (this.highlight.id) { // 确保 ID 存在
                            const hiNote = {
                                id: this.highlight.id,
                                text: this.highlight.text || '',
                                position: this.highlight.position || 0,
                                paragraphId: this.highlight.paragraphId,
                                blockId: this.highlight.blockId,
                                comments: this.highlight.comments || [],
                                createdAt: this.highlight.createdAt || Date.now(),
                                updatedAt: this.highlight.updatedAt || Date.now(),
                                isVirtual: this.highlight.isVirtual,
                                filePath: this.highlight.filePath,
                                fileType: this.highlight.fileType,
                                displayText: this.highlight.displayText,
                                paragraphOffset: this.highlight.paragraphOffset,
                                backgroundColor: this.highlight.backgroundColor,
                                isCloze: this.highlight.isCloze
                            };
                            
                            console.log('正在保存高亮到存储...');
                            // 使用 window 对象访问插件实例
                            const plugin = (window as any).app.plugins.plugins['hi-note'];
                            if (plugin && plugin.commentStore) {
                                await plugin.commentStore.addComment(file, hiNote);
                                console.log('高亮已成功保存');
                            } else {
                                console.warn('无法访问 commentStore');
                            }
                        }
                    } catch (error) {
                        console.error('保存高亮时出错:', error);
                        // 继续创建闪卡，即使保存高亮失败
                    }
                } else {
                    console.warn('无法获取文件对象:', this.highlight.filePath);
                }
            } else {
                console.warn('高亮对象缺少文件路径');
            }
            
            // 使用 addCard 方法创建闪卡
            // 处理挂空格式的文本
            let text = this.highlight.text || '';
            let answer = '';
            
            // 检查是否为挂空格式（例如：{{content}})
            const clozeRegex = /\{\{([^{}]+)\}\}/g;
            let match;
            let clozeAnswers: string[] = [];
            
            // 如果文本中包含挂空格式，提取挂空内容作为答案
            while ((match = clozeRegex.exec(text)) !== null) {
                clozeAnswers.push(match[1]);
            }
            
            // 收集所有可能的答案部分
            let answerParts = [];
            
            // 如果有挖空内容，添加到答案部分
            if (clozeAnswers.length > 0) {
                answerParts.push(clozeAnswers.join('\n'));
            }
            
            // 如果有批注内容，添加到答案部分
            if (this.highlight.comments && this.highlight.comments.length > 0) {
                answerParts.push(this.highlight.comments.map(c => c.content || '').join('\n'));
            }
            
            // 合并所有答案部分，如果没有内容则使用默认文本
            answer = answerParts.length > 0 ? answerParts.join('\n\n') : t('请添加答案');
            
            // 创建闪卡
            const card = fsrsManager.addCard(
                text, 
                answer, 
                this.highlight.filePath || this.fileName, 
                this.highlight.id, 
                'highlight'
            );
            
            if (!card) {
                new Notice(t('创建闪卡失败，请检查高亮内容'));
                return;
            }
            
            // 触发事件，让 FSRSManager 来处理保存
            this.plugin.eventManager.emitFlashcardChanged();
            
            // 显示成功消息
            new Notice(t('闪卡创建成功！'));
            
            console.log('创建的闪卡:', card);
            
            // 更新图标显示
            this.updateIconsAfterCardCreation();
        } catch (error) {
            console.error('创建闪卡时出错:', error);
            new Notice(t(`创建闪卡失败: ${error.message}`));
        }
    }
} 
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
import { LicenseManager } from "../../services/LicenseManager";

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
    
    // 静态方法：根据高亮ID查找HighlightCard实例
    public static findCardInstanceByHighlightId(highlightId: string): HighlightCard | null {
        for (const instance of HighlightCard.cardInstances) {
            if (instance.highlight.id === highlightId) {
                return instance;
            }
        }
        return null;
    }
    
    // 静态方法：更新指定高亮的UI状态
    public static updateCardUIByHighlightId(highlightId: string): void {
        const cardInstance = HighlightCard.findCardInstanceByHighlightId(highlightId);
        if (cardInstance) {
            cardInstance.updateIconsAfterCardCreation();
        }
    }
    
    // 静态方法：清除所有卡片上的不聚焦输入框
    public static clearAllUnfocusedInputs(): void {
        HighlightCard.cardInstances.forEach(instance => {
            if (instance.unfocusedInput) {
                instance.unfocusedInput.remove();
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
    private aiButtonInstance: AIButton | null = null;
    private moreActionsDropdown: HTMLElement | null = null;
    private boundClickOutsideHandler: (e: MouseEvent) => void;
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
        
        // 创建点击外部关闭下拉菜单的处理函数
        this.boundClickOutsideHandler = this.handleClickOutside.bind(this);
        // 添加全局点击事件监听
        document.addEventListener('click', this.boundClickOutsideHandler);
        
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
            
            // 行号标签已在标题栏左侧区域添加
            
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
            
            // 添加文件名文本（移除 .md 后缀）
            const displayName = this.fileName ? this.fileName.replace(/\.md$/, '') : '';
            const fileNameText = titleBarLeft.createEl("span", {
                text: displayName,
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
        // 在非主视图下显示行号
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
            
            // 在高亮图标右侧显示行号（如果有文件路径和位置信息）
            if (this.highlight.filePath && typeof this.highlight.position === 'number') {
                // 获取文件
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    // 尝试打开文件并获取编辑器实例
                    const cachedLeaf = this.plugin.app.workspace.getLeavesOfType('markdown').find(leaf => {
                        const view = leaf.view;
                        return view instanceof MarkdownView && view.file && view.file.path === file.path;
                    });
                    
                    if (cachedLeaf) {
                        const view = cachedLeaf.view as MarkdownView;
                        if (view.editor) {
                            // 计算行号
                            const pos = view.editor.offsetToPos(this.highlight.position);
                            const lineNumber = pos.line + 1; // 行号从0开始，显示时+1
                            
                            // 创建行号标签
                            const lineNumberBadge = titleBarLeft.createEl("div", {
                                cls: "highlight-line-number-badge",
                            });
                            
                            lineNumberBadge.createEl("span", {
                                text: `L${lineNumber}`,
                                cls: "highlight-line-number"
                            });
                        }
                    }
                }
            }
        }
        
        // 在标题栏右侧添加操作按钮
        
        // 使用重构后的 AIButton 组件
        this.aiButtonInstance = new AIButton(
            titleBarRight,
            {
                getText: () => this.highlight.text,
                getComments: () => (this.highlight.comments || []).map(c => c.content || "").join('\n')
            },
            this.plugin,
            {
                onResponse: async (content) => {
                    await this.options.onAIResponse(content);
                },
                buttonClass: "highlight-title-btn highlight-ai-btn",
                buttonIcon: "sparkles",
                buttonLabel: t('AI comment'),
                position: 'titlebar',
                dropdownClass: "highlight-ai-dropdown"
            }
        );
        
        // 创建更多操作的容器
        const moreActionsContainer = titleBarRight.createEl("div", {
            cls: "highlight-more-actions-container"
        });
        
        // 更多操作按钮（垂直省略号）
        const moreActionsBtn = moreActionsContainer.createEl("div", {
            cls: "highlight-title-btn highlight-more-btn",
            attr: { 'aria-label': t('More') }
        });
        setIcon(moreActionsBtn, "ellipsis-vertical");
        
        // 创建下拉菜单，添加到 document.body
        const moreActionsDropdown = document.body.createEl("div", {
            cls: "highlight-more-dropdown hi-note-hidden"
        });
        
        // 保存下拉菜单引用
        this.moreActionsDropdown = moreActionsDropdown;
        
        // 防止下拉菜单的点击事件冒泡
        moreActionsDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
        
        // 添加按钮点击事件
        moreActionsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleMoreActionsDropdown(moreActionsDropdown, moreActionsBtn);
        });
        
        // 添加创建 HiCard 选项到下拉菜单
        const hasFlashcard = this.checkHasFlashcard();
        
        // 创建一个异步函数来检查许可证状态
        const checkLicenseStatus = async () => {
            const licenseManager = new LicenseManager(this.plugin);
            const isActivated = await licenseManager.isActivated();
            const isFeatureEnabled = isActivated ? await licenseManager.isFeatureEnabled('flashcard') : false;
            return isActivated && isFeatureEnabled;
        };
        
        // 创建 HiCard 菜单项
        const createHiCardItem = moreActionsDropdown.createEl("div", {
            cls: "highlight-more-dropdown-item create-hicard-btn",
            text: hasFlashcard ? t('Delete HiCard') : t('Create HiCard')
        });
        
        // 异步检查许可证状态并设置菜单项样式
        checkLicenseStatus().then(isLicensed => {
            if (!isLicensed && !hasFlashcard) {
                // 如果没有许可证且没有闪卡，置灰菜单项
                createHiCardItem.addClass("disabled-menu-item");
                // 添加提示信息
                createHiCardItem.setAttribute("aria-label", t('Only HiNote Pro'));
            }
        });
        
        // 添加点击事件
        createHiCardItem.addEventListener("click", async (e) => {
            e.stopPropagation();
            moreActionsDropdown.addClass("hi-note-hidden");
            
            // 如果菜单项被禁用，不执行操作
            if (createHiCardItem.hasClass("disabled-menu-item") && !hasFlashcard) {
                new Notice(t('Only HiNote Pro'));
                return;
            }
            
            // 调用创建 HiCard 的逻辑
            this.handleCreateHiCard();
        });
        
        // 添加分隔线
        moreActionsDropdown.createEl("div", {
            cls: "highlight-more-dropdown-divider"
        });
        
        // 添加复制功能选项到下拉菜单
        const copyItem = moreActionsDropdown.createEl("div", {
            cls: "highlight-more-dropdown-item",
            text: t('Copy Highlight')
        });
        
        // 添加复制功能的点击事件
        copyItem.addEventListener("click", (e) => {
            e.stopPropagation();
            moreActionsDropdown.addClass("hi-note-hidden");
            
            // 复制高亮和批注内容
            this.copyHighlightContent();
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
            
            // 调用导出图片的选项
            if (this.options.onExport) {
                this.options.onExport(this.highlight);
            }
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
        const highlightContentEl = this.card.createEl("div", {
            cls: "highlight-content"
        });

        // 渲染高亮内容
        new HighlightContent(
            highlightContentEl,
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
        const contentElement = this.card.querySelector('.highlight-content');
        if (!contentElement) return;
        
        // 创建不聚焦的批注输入框，放在高亮内容下方
        this.unfocusedInput = new UnfocusedCommentInput(
            contentElement as HTMLElement,
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
    public static findCardInstanceByElement(element: HTMLElement): HighlightCard | null {
        // 遍历所有卡片实例，查找卡片元素匹配的实例
        for (const instance of HighlightCard.cardInstances) {
            if (instance.card === element || instance.card.contains(element)) {
                return instance;
            }
        }
        return null;
    }
    
    /**
     * 显示评论输入框
     * 用于外部调用，直接触发评论输入框的显示
     */
    public showCommentInput(): void {
        // 清除所有卡片的不聚焦输入框
        HighlightCard.clearAllUnfocusedInputs();
        
        // 如果当前卡片有不聚焦输入框，先移除它
        if (this.unfocusedInput) {
            this.unfocusedInput.remove();
            this.unfocusedInput = null;
        }
        
        // 直接触发添加评论回调，显示真正的输入框
        this.options.onCommentAdd(this.highlight);
    }

    // 添加选中卡片的方法，支持多选和取消选择
    private selectCard(event?: MouseEvent) {
        // 先清除所有卡片上的不聚焦输入框
        HighlightCard.clearAllUnfocusedInputs();
        
        // 如果按住 Shift 键，则进行多选或取消选择
        if (event && event.shiftKey && HighlightCard.lastSelectedCard) {
            // 检查当前卡片是否已经被选中
            const isCurrentCardSelected = this.card.hasClass('selected');
            
            if (isCurrentCardSelected) {
                // 如果已经选中，则取消选择
                this.card.removeClass('selected');
                HighlightCard.selectedCards.delete(this.card);
            } else {
                // 如果未选中，则添加到选中集合
                // 保持上一个选中的卡片状态
                HighlightCard.selectedCards.add(HighlightCard.lastSelectedCard);
                // 添加当前卡片到选中集合
                HighlightCard.selectedCards.add(this.card);
                this.card.addClass('selected');
            }
            
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
            
            // 清除 DOM 中所有带有 selected 类的卡片
            const allSelectedCards = document.querySelectorAll('.highlight-card.selected');
            allSelectedCards.forEach(card => {
                if (card !== this.card) {
                    card.removeClass('selected');
                }
            });
            
            // 清除 HighlightCard.selectedCards 集合
            HighlightCard.selectedCards.forEach(card => {
                if (card !== this.card) {
                    card.removeClass('selected');
                }
            });
            HighlightCard.selectedCards.clear();
            
            HighlightCard.selectedCards.add(this.card);
            this.card.addClass('selected');
        }
        
        // 触发自定义事件，通知 CommentView 多选状态变化
        const customEvent = new CustomEvent('highlight-multi-select', {
            detail: {
                selectedCards: Array.from(HighlightCard.selectedCards),
                lastSelected: this.card
            },
            bubbles: true
        });
        this.card.dispatchEvent(customEvent);
        
        // 在单选模式下显示不聚焦的批注输入框
        if (!event?.shiftKey) {
            this.showUnfocusedCommentInput();
        }
        
        // 更新最后选中的卡片，即使它被取消选择了
        HighlightCard.lastSelectedCard = this.card;
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
     * 复制高亮和批注内容
     */
    private copyHighlightContent(): void {
        try {
            // 构建要复制的内容
            let content = `> ${this.highlight.text}\n\n`;
            
            // 添加文件名信息（如果有）
            if (this.highlight.filePath) {
                // 获取文件名，优先使用已存储的文件名，否则从路径中提取
                const displayName = this.fileName || this.highlight.filePath.split('/').pop() || this.highlight.filePath;
                
                // 使用 Obsidian 的内部链接格式 [[filename]]
                content += `From: [[${displayName}]]`;
                content += '\n\n';
            }
            
            // 复制到剪贴板
            navigator.clipboard.writeText(content).then(() => {
                // 显示成功提示
                new Notice('已复制高亮内容');
            }).catch(err => {
                console.error('复制内容失败:', err);
                new Notice('复制内容失败');
            });
        } catch (error) {
            console.error('复制高亮内容时出错:', error);
            new Notice('复制内容时出错');
        }
    }

    /**
     * 切换更多操作下拉菜单的显示/隐藏状态
     * @param dropdown 下拉菜单元素
     * @param button 触发菜单的按钮元素
     */
    private toggleMoreActionsDropdown(dropdown: HTMLElement, button: HTMLElement) {
        if (dropdown.hasClass("hi-note-hidden")) {
            // 关闭其他所有下拉菜单
            document.querySelectorAll('.highlight-ai-dropdown, .highlight-more-dropdown').forEach((otherDropdown) => {
                if (otherDropdown !== dropdown) {
                    otherDropdown.addClass("hi-note-hidden");
                }
            });
            
            // 获取按钮的位置信息
            const rect = button.getBoundingClientRect();
            
            // 计算下拉菜单的宽度和位置
            const dropdownWidth = 160; // 菜单宽度
            
            // 计算合适的左侧位置，确保菜单不会超出屏幕右侧
            let leftPos = rect.right - dropdownWidth;
            const viewportWidth = window.innerWidth;
            
            // 确保菜单不会超出屏幕右侧
            if (leftPos + dropdownWidth > viewportWidth - 10) {
                leftPos = viewportWidth - dropdownWidth - 10; // 保留 10px 的边距
            }
            
            // 设置下拉菜单的位置
            dropdown.style.position = "fixed";
            dropdown.style.top = (rect.bottom + 5) + "px"; // 按钮下方5px
            dropdown.style.left = leftPos + "px"; // 右对齐，并防止超出屏幕
            
            dropdown.removeClass("hi-note-hidden");
        } else {
            dropdown.addClass("hi-note-hidden");
        }
    }

    /**
     * 处理点击外部事件，关闭所有下拉菜单
     * @param e 鼠标事件
     */
    private handleClickOutside(e: MouseEvent) {
        // 如果点击的不是卡片内的元素，关闭所有下拉菜单
        if (!this.card.contains(e.target as Node)) {
            // 关闭所有下拉菜单
            document.querySelectorAll('.highlight-ai-dropdown, .highlight-more-dropdown').forEach((dropdown) => {
                dropdown.addClass("hi-note-hidden");
            });
            
            // 如果 AI 按钮实例存在，也关闭其下拉菜单
            if (this.aiButtonInstance) {
                this.aiButtonInstance.closeDropdown();
            }
        }
    }
    
    /**
     * 检查高亮是否已经创建了闪卡
     * @returns 是否已创建闪卡
     */
    private checkHasFlashcard(): boolean {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager || !this.highlight.id) {
            return false;
        }
        
        // 通过 sourceId 查找闪卡
        const cards = fsrsManager.findCardsBySourceId(this.highlight.id, 'highlight');
        return cards && cards.length > 0;
    }
    
    /**
     * 处理创建/删除 HiCard 的逻辑
     */
    private async handleCreateHiCard() {
        try {
            // 检查许可证状态
            const licenseManager = new LicenseManager(this.plugin);
            const isActivated = await licenseManager.isActivated();
            const isFeatureEnabled = isActivated ? await licenseManager.isFeatureEnabled('flashcard') : false;
            
            if (!isActivated || !isFeatureEnabled) {
                // 未激活或未启用闪卡功能，显示提示
                new Notice(t('Only HiNote Pro'));
                return;
            }
            
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                new Notice(t('FSRS 管理器未初始化'));
                return;
            }

            // 检查是否已经存在闪卡
            const hasFlashcard = this.checkHasFlashcard();
            
            if (hasFlashcard) {
                // 删除闪卡逻辑
                await this.handleDeleteHiCard();
            } else {
                // 创建闪卡逻辑
                await this.handleCreateNewHiCard();
            }
        } catch (error) {
            console.error('处理闪卡操作时出错:', error);
            new Notice(t(`操作失败: ${error.message}`));
        }
    }

    /**
     * 公共方法：为高亮删除闪卡
     * 可以被外部调用，用于批量删除闪卡
     * @returns 删除是否成功
     */
    public async deleteHiCardForHighlight(): Promise<boolean> {
        try {
            await this.handleDeleteHiCard();
            return true;
        } catch (error) {
            console.error('删除闪卡时出错:', error);
            return false;
        }
    }

    /**
     * 处理删除闪卡的逻辑
     */
    private async handleDeleteHiCard() {
        try {
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                new Notice(t('FSRS 管理器未初始化'));
                return;
            }

            // 根据 sourceId 删除闪卡
            const deletedCount = fsrsManager.deleteCardsBySourceId(this.highlight.id || '', 'highlight');
            
            if (deletedCount > 0) {

                
                // 清理可能残留的无效卡片引用
                const cleanedCount = fsrsManager.cleanupInvalidCardReferences();
                if (cleanedCount > 0) {

                }
                
                // 检查是否有批注，决定是否删除高亮
                const hasComments = this.highlight.comments && this.highlight.comments.length > 0;
                
                if (!hasComments) {
                    // 没有批注，删除整个高亮
                    await this.deleteHighlightCompletely();
                    new Notice(t('闪卡和高亮已删除'));
                } else {
                    // 有批注，只删除闪卡，保留高亮和批注
                    new Notice(t('闪卡已删除，高亮和批注已保留'));
                }
                
                // 更新按钮显示
                this.updateIconsAfterCardDeletion();
                
                // 触发闪卡变化事件
                this.plugin.eventManager.emitFlashcardChanged();
            } else {
                new Notice(t('未找到要删除的闪卡'));
            }
        } catch (error) {
            console.error('删除闪卡时出错:', error);
            new Notice(t(`删除闪卡失败: ${error.message}`));
        }
    }

    /**
     * 完全删除高亮（当没有批注时）
     */
    private async deleteHighlightCompletely() {
        try {
            if (this.highlight.filePath) {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    // 从 CommentStore 中删除高亮
                    const plugin = (window as any).app.plugins.plugins['hi-note'];
                    if (plugin && plugin.commentStore) {
                        await plugin.commentStore.removeComment(file, this.highlight as any);

                    } else {
                        console.warn('无法访问 commentStore');
                    }
                    
                    // 触发高亮删除事件
                    this.plugin.eventManager.emitHighlightDelete(
                        this.highlight.filePath, 
                        this.highlight.text || '', 
                        this.highlight.id || ''
                    );
                }
            }
        } catch (error) {
            console.error('删除高亮时出错:', error);
            throw error;
        }
    }

    /**
     * 公共方法：为高亮创建闪卡
     * 可以被外部调用，用于批量创建闪卡
     * @returns 创建是否成功
     */
    public async createHiCardForHighlight(): Promise<boolean> {
        try {
            await this.handleCreateNewHiCard();
            return true;
        } catch (error) {
            console.error('创建闪卡时出错:', error);
            return false;
        }
    }

    /**
     * 处理创建新闪卡的逻辑（原有逻辑）
     */
    private async handleCreateNewHiCard() {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t('FSRS 管理器未初始化'));
            return;
        }

        // 确保高亮有 ID
        if (!this.highlight.id) {
            console.warn('高亮缺少 ID，正在生成...');
            this.highlight.id = `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // 如果高亮有文件路径，需要先保存到存储中
        if (this.highlight.filePath) {
            try {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {

                    // 创建 HiNote 对象
                    const hiNote = {
                        id: this.highlight.id,
                        text: this.highlight.text || '',
                        position: this.highlight.position || 0,
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
                    

                    const plugin = (window as any).app.plugins.plugins['hi-note'];
                    if (plugin && plugin.commentStore) {
                        await plugin.commentStore.addComment(file, hiNote);

                    } else {
                        console.warn('无法访问 commentStore');
                    }
                }
            } catch (error) {
                console.error('保存高亮时出错:', error);
                // 继续创建闪卡，即使保存高亮失败
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
        

        
        // 更新图标显示
        this.updateIconsAfterCardCreation();
    }

    /**
     * 更新删除闪卡后的图标显示
     */
    private updateIconsAfterCardDeletion() {
        // 查找卡片中的所有图标元素
        const fileIcons = this.card.querySelectorAll('.highlight-card-icon');
        
        // 更新所有图标为 file-text
        fileIcons.forEach(icon => {
            setIcon(icon as HTMLElement, 'file-text');
            (icon as HTMLElement).removeClass('has-flashcard');
        });
        
        // 更新按钮文本
        this.updateCreateHiCardButtonText();
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
        
        // 更新按钮文本
        this.updateCreateHiCardButtonText();
    }

    /**
     * 更新创建闪卡按钮的文本
     */
    private updateCreateHiCardButtonText() {
        const createButton = this.card.querySelector('.create-hicard-btn');
        if (createButton) {
            const hasFlashcard = this.checkHasFlashcard();
            createButton.textContent = hasFlashcard ? t('Delete HiCard') : t('Create HiCard');
        }
    }
}
import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { CommentList } from "./CommentList";
import { UnfocusedCommentInput } from "../comment/UnfocusedCommentInput";
import { MarkdownView, Notice, TFile, WorkspaceLeaf, HoverParent, HoverPopover, MarkdownPreviewView, setIcon, Menu, MenuItem, Editor } from "obsidian";
import { DragPreview } from './DragPreview';
import { VIEW_TYPE_COMMENT } from '../../CommentView';
import { t } from "../../i18n";
import { DragContentGenerator } from "./DragContentGenerator";
import { AIButton } from "../AIButton";
import { AIService } from "../../services/AIService";
import { LicenseManager } from "../../services/LicenseManager";
import { SelectionManager } from "../../view/selection/SelectionManager";

export class HighlightCard {
    // 为了让 CommentInput 能够访问到 findCardInstanceByHighlightId 方法
    static {
        // @ts-ignore - 添加到 window 对象上，忽略类型检查
        window.HighlightCard = {
            findCardInstanceByHighlightId: HighlightCard.findCardInstanceByHighlightId
        };
    }
    
    // 静态方法：清理所有卡片实例
    public static clearAllInstances(): void {
        // 清理所有实例
        HighlightCard.cardInstances.forEach(instance => {
            // 如果有销毁方法，调用它
            if (typeof instance.destroy === 'function') {
                instance.destroy();
            }
        });
        
        // 清空实例集合
        HighlightCard.cardInstances.clear();
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
    private static cardInstances = new Set<HighlightCard>();
    private fileName: string | undefined;
    private isEditing = false;
    private aiButtonInstance: AIButton | null = null;
    private moreActionsDropdown: HTMLElement | null = null;
    private unfocusedInput: UnfocusedCommentInput | null = null;
    private hasFlashcard: boolean = false; // 保存闪卡状态
    private isShowingRealInput: boolean = false; // 是否正在显示真正的输入框

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
        fileName?: string,
        private selectionManager?: SelectionManager  // SelectionManager 实例
    ) {
        this.fileName = fileName;
        this.highlight = highlight;
        this.plugin = plugin;
        this.options = options;
        this.fileName = this.highlight.filePath?.split('/').pop();
        
        // 注册卡片实例
        HighlightCard.cardInstances.add(this);
        
        // 监听 CommentInput 组件发出的自定义事件
        this.setupCommentInputEventListeners();
        
        this.render();
    }
    
    // 设置 CommentInput 相关的事件监听
    private setupCommentInputEventListeners() {
        // 监听输入框显示事件
        const handleInputShown = (e: CustomEvent) => {
            if (e.detail?.highlightId === this.highlight.id) {
                this.isShowingRealInput = true;
                // 如果有未聚焦输入框，移除它
                if (this.unfocusedInput) {
                    this.unfocusedInput.remove();
                    this.unfocusedInput = null;
                }
            }
        };
        
        // 监听输入框关闭事件
        const handleInputClosed = (e: CustomEvent) => {
            if (e.detail?.highlightId === this.highlight.id) {
                this.isShowingRealInput = false;
            }
        };
        
        // 添加自定义事件监听
        document.addEventListener('comment-input-shown', handleInputShown as EventListener);
        document.addEventListener('comment-input-closed', handleInputClosed as EventListener);
        
        // 确保在插件卸载时移除事件监听
        // 使用 addEventListener 而不是 registerDomEvent，因为自定义事件不在 DocumentEventMap 中
        this.plugin.register(() => {
            document.removeEventListener('comment-input-shown', handleInputShown as EventListener);
            document.removeEventListener('comment-input-closed', handleInputClosed as EventListener);
        });
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
            // 如果正在编辑或显示真正的输入框，不触发选中状态切换
            if (this.isEditing || this.isShowingRealInput) {
                return;
            }
            
            // 检查点击的目标是否是输入框相关元素
            const target = e.target as HTMLElement;
            if (target.closest('.hi-note-input') || target.closest('.hi-note-actions-hint')) {
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
        
        // 在主视图或全局搜索模式下显示文件名
        if ((this.isInMainView || this.highlight.isGlobalSearch) && this.fileName) {
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
            
            // 添加拖拽功能
            this.setupDragFunctionality(titleBarLeft);
            
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
                    // 如果是全局搜索模式，显示文件名而不是行号
                    if (this.highlight.isGlobalSearch) {
                        // 显示文件名已经在前面实现，这里不需要重复显示
                        // 不显示行号标签
                    } else {
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
            
            // 为非主视图也添加拖拽功能
            this.setupDragFunctionality(titleBarLeft);
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
        
        // 添加按钮点击事件
        moreActionsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggleMoreActionsDropdown(moreActionsBtn);
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
        
        // 如果正在编辑或显示真正的输入框，不显示不聚焦的输入框
        if (this.isEditing || this.isShowingRealInput) {
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
        
        // 如果没有 SelectionManager，只显示输入框（单选模式降级）
        if (!this.selectionManager) {
            this.showUnfocusedCommentInput();
            return;
        }
        
        // 如果没有 highlight.id，无法进行选择操作
        if (!this.highlight.id) {
            this.showUnfocusedCommentInput();
            return;
        }
        
        // 如果按住 Shift 键，则进行多选或取消选择
        if (event && event.shiftKey) {
            // 检查当前卡片是否已经被选中
            const isSelected = this.selectionManager.isCardSelected(this.highlight.id);
            
            if (isSelected) {
                // 如果已经选中，则取消选择
                this.selectionManager.unselectCard(this.highlight.id);
            } else {
                // 如果未选中，则添加到选中集合
                this.selectionManager.selectCard(this.highlight.id, this.card, this.highlight);
            }
            
            // 多选模式下不显示输入框
        } else {
            // 单选模式，先清除所有选择
            this.selectionManager.clearSelection();
            
            // 然后选中当前卡片
            this.selectionManager.selectCard(this.highlight.id, this.card, this.highlight);
            
            // 在单选模式下显示不聚焦的批注输入框
            this.showUnfocusedCommentInput();
        }
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
     * 为指定元素设置拖拽功能
     * @param element 要设置拖拽功能的元素
     */
    private setupDragFunctionality(element: HTMLElement): void {
        // 添加拖拽属性
        element.setAttribute("draggable", "true");
        
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
        
        // 添加拖拽开始事件
        element.addEventListener("dragstart", async (e: DragEvent) => {
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
                
                element.addClass("dragging");
                
                // 使用 DragPreview 替代原来的预览处理
                DragPreview.start(e, this.highlight.text);
            } catch (error) {
                console.error('[HighlightCard] Error during drag start:', error);
                // 防止错误时的拖拽
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // 添加拖拽结束事件
        element.addEventListener("dragend", () => {
            element.removeClass("dragging");
            DragPreview.clear();
        });
    }
    
    /**
     * 复制高亮和批注内容
     */
    private copyHighlightContent(): void {
        try {
            // 构建 Callout 格式的内容
            let content = '> [!quote] HiNote\n';
            content += `> ${this.highlight.text}`;
            
            // 添加文件名信息（如果有）
            if (this.highlight.filePath) {
                // 获取文件名，优先使用已存储的文件名，否则从路径中提取
                const displayName = this.fileName || this.highlight.filePath.split('/').pop() || this.highlight.filePath;
                
                // 在 Callout 内添加文件名信息
                content += '\n> \n';
                content += `> From: [[${displayName}]]`;
            }
            
            // 添加最后的换行
            content += '\n\n';
            
            // 复制到剪贴板
            navigator.clipboard.writeText(content).then(() => {
                // 显示成功提示
                new Notice('Copied');
            }).catch(err => {
                console.error('复制内容失败:', err);
                new Notice('Failed to copy content');
            });
        } catch (error) {
            console.error('复制高亮内容时出错:', error);
            new Notice('Failed to copy content');
        }
    }
    
    /**
     * 处理导出为图片功能
     */
    private handleExportAsImage(): void {
        this.options.onExport(this.highlight);
    }

    /**
     * 切换更多操作下拉菜单的显示/隐藏状态
     * @param dropdown 下拉菜单元素
     * @param button 触发菜单的按钮元素
     */
    private toggleMoreActionsDropdown(button: HTMLElement) {
        const menu = new Menu();
        
        // 检查闪卡状态
        this.hasFlashcard = this.checkHasFlashcard();
        
        // 添加创建/删除闪卡菜单项
        menu.addItem((item: MenuItem) => item
            .setTitle(this.hasFlashcard ? t('Delete HiCard') : t('Create HiCard'))
            .onClick(() => this.handleCreateHiCard())
        );
        
        // 添加复制菜单项
        menu.addItem((item: MenuItem) => item
            .setTitle(t('Copy Highlight'))
            .onClick(() => this.copyHighlightContent())
        );
        
        // 添加导出图片菜单项
        menu.addItem((item: MenuItem) => item
            .setTitle(t('Export as Image'))
            .onClick(() => this.handleExportAsImage())
        );
        
        // 添加删除高亮菜单项
        menu.addItem((item: MenuItem) => item
            .setTitle(t('Delete'))
            .onClick(() => this.handleDeleteHighlight())
        );
        
        // 显示菜单在按钮下方
        const rect = button.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left - 100, y: rect.bottom + 8 });
    }

    // 缓存可见的下拉菜单列表
    private static visibleDropdowns: Set<HTMLElement> = new Set();
    // 跟踪是否已添加全局点击事件监听
    private static isGlobalListenerAdded = false;

    /**
     * 检查是否有可见的更多操作下拉菜单
     */
    private hasVisibleMoreDropdown(): boolean {
        return HighlightCard.visibleDropdowns.size > 0;
    }

    /**
     * 添加可见的下拉菜单
     * @param dropdown 下拉菜单元素
     */
    public static addVisibleDropdown(dropdown: HTMLElement): void {
        if (!HighlightCard.isGlobalListenerAdded) {
            document.addEventListener('click', HighlightCard.handleDocumentClick, true);
            HighlightCard.isGlobalListenerAdded = true;
        }
        HighlightCard.visibleDropdowns.add(dropdown);
    }

    /**
     * 移除可见的下拉菜单
     * @param dropdown 下拉菜单元素
     */
    public static removeVisibleDropdown(dropdown: HTMLElement): void {
        HighlightCard.visibleDropdowns.delete(dropdown);
    }

    /**
     * 文档级点击事件处理（静态方法，只会在文档上添加一次）
     */
    private static handleDocumentClick = (e: MouseEvent): void => {
        // 遍历所有可见的下拉菜单
        for (const dropdown of HighlightCard.visibleDropdowns) {
            const card = dropdown.closest('.highlight-card');
            // 如果点击的不是当前下拉菜单或其关联卡片，则隐藏该下拉菜单
            if (card && !card.contains(e.target as Node) && !dropdown.contains(e.target as Node)) {
                dropdown.classList.add('hi-note-hidden');
                HighlightCard.visibleDropdowns.delete(dropdown);
            }
        }
    };


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
            this.hasFlashcard = hasFlashcard; // 更新状态
            
            if (hasFlashcard) {
                // 删除闪卡逻辑
                await this.handleDeleteHiCard();
            } else {
                // 创建闪卡逻辑
                await this.handleCreateNewHiCard();
            }
            
            // 立即更新所有下拉菜单中的按钮文本
    
        } catch (error) {
            console.error('处理闪卡操作时出错:', error);
            new Notice(t(`操作失败: ${error.message}`));
        }
    }

    /**
     * 公共方法：为高亮删除闪卡
     * 可以被外部调用，用于批量删除闪卡
     * @param silent 是否静默模式（不显示通知，不触发事件）
     * @returns 删除是否成功
     */
    public async deleteHiCardForHighlight(silent: boolean = false): Promise<boolean> {
        try {
            await this.handleDeleteHiCard(silent);
            return true;
        } catch (error) {
            console.error('删除闪卡时出错:', error);
            return false;
        }
    }

    /**
     * 处理删除闪卡的逻辑
     * @param silent 是否静默模式（不显示通知，不触发事件）
     */
    private async handleDeleteHiCard(silent: boolean = false) {
        try {
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                if (!silent) new Notice(t('FSRS 管理器未初始化'));
                return;
            }

            // 根据 sourceId 删除闪卡
            const deletedCount = fsrsManager.deleteCardsBySourceId(this.highlight.id || '', 'highlight');
            
            if (deletedCount > 0) {
                // 更新闪卡状态
                this.hasFlashcard = false;
                
                // 清理可能残留的无效卡片引用
                const cleanedCount = fsrsManager.cleanupInvalidCardReferences();
                
                // 检查是否有批注，决定是否删除高亮
                const hasComments = this.highlight.comments && this.highlight.comments.length > 0;
                
                if (!hasComments && !silent) {
                    // 没有批注，删除整个高亮（在批量删除时不执行此操作）
                    await this.deleteHighlightCompletely();
                    if (!silent) new Notice(t('Flashcard and highlight deleted'));
                } else if (!silent) {
                    // 有批注，只删除闪卡，保留高亮和批注
                    new Notice(t('Flashcard deleted, highlight and comments preserved'));
                }
                
                // 更新闪卡状态和所有相关显示
                this.updateIconsAfterCardDeletion();
        
                // 触发闪卡变化事件（在批量删除时不触发）
                if (!silent) this.plugin.eventManager.emitFlashcardChanged();
            } else if (!silent) {
                new Notice(t('Flashcard not found'));
            }
        } catch (error) {
            console.error('删除闪卡时出错:', error);
            if (!silent) new Notice(t(`Failed to delete flashcard: ${error.message}`));
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
    public async createHiCardForHighlight(silent: boolean = false): Promise<boolean> {
        try {
            await this.handleCreateNewHiCard(silent);
            return true;
        } catch (error) {
            console.error('创建闪卡时出错:', error);
            return false;
        }
    }

    /**
     * 处理创建新闪卡的逻辑（原有逻辑）
     * @param silent 是否静默模式，如果为 true 则不显示通知
     */
    private async handleCreateNewHiCard(silent: boolean = false) {
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
        answer = answerParts.length > 0 ? answerParts.join('\n\n') : t('Add answer');
        
        // 创建闪卡
        const card = fsrsManager.addCard(
            text, 
            answer, 
            this.highlight.filePath || this.fileName, 
            this.highlight.id, 
            'highlight'
        );
        
        if (!card) {
            new Notice(t('Failed to create flashcard, please check highlight content'));
            return;
        }
        
        // 触发事件，让 FSRSManager 来处理保存
        this.plugin.eventManager.emitFlashcardChanged();
        
        // 只在非静默模式下显示成功消息
        if (!silent) {
            new Notice(t('Flashcard created successfully!'));
        }
        
        // 更新闪卡状态
        this.hasFlashcard = true;
        
        // 更新闪卡状态和所有相关显示
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
     * 更新创建闪卡按钮的文本
     * 注意：这个方法只更新卡片上的按钮，不更新下拉菜单中的按钮
     */
    private updateCreateHiCardButtonText() {
        // 查找当前可见的创建闪卡按钮
        const createButton = this.card.querySelector('.create-hicard-btn');
        if (createButton) {
            createButton.textContent = this.hasFlashcard ? t('Delete HiCard') : t('Create HiCard');
        }
    }
    
    /**
     * 处理删除高亮的逻辑
     * 这个方法会删除编辑器中的高亮格式和批注数据
     * @param skipConfirmation 是否跳过确认对话框，默认为 false
     * @param skipNotice 是否跳过成功通知，默认为 false
     */
    public async handleDeleteHighlight(skipConfirmation: boolean = false, skipNotice: boolean = false) {
        try {
            // 显示确认对话框
            if (!skipConfirmation) {
                const confirmDelete = confirm(t('Delete this highlight and all its data, including Comments and HiCards? Can\'t undo.'));
                if (!confirmDelete) {
                    return;
                }
            }
            
            // 如果有闪卡，先删除闪卡
            if (this.hasFlashcard) {
                await this.handleDeleteHiCard(true); // 静默模式，不显示通知
            }
            
            if (this.highlight.filePath) {
                const file = this.plugin.app.vault.getAbstractFileByPath(this.highlight.filePath);
                if (file instanceof TFile) {
                    // 1. 从 CommentStore 中删除高亮
                    const plugin = (window as any).app.plugins.plugins['hi-note'];
                    if (plugin && plugin.commentStore) {
                        await plugin.commentStore.removeComment(file, this.highlight as any);
                    } else {
                        console.warn('无法访问 commentStore');
                    }
                    
                    // 2. 从编辑器中删除高亮格式
                    await this.removeHighlightFormatFromEditor(file);
                    
                    // 3. 触发高亮删除事件
                    this.plugin.eventManager.emitHighlightDelete(
                        this.highlight.filePath, 
                        this.highlight.text || '', 
                        this.highlight.id || ''
                    );
                    
                    // 4. 显示成功通知（如果不跳过通知）
                    if (!skipNotice) {
                        new Notice(t('Successfully deleted'));
                    }
                    
                    // 5. 移除卡片
                    this.card.remove();
                    
                    // 6. 从卡片实例集合中移除
                    HighlightCard.cardInstances.delete(this);
                }
            } else {
                console.warn('高亮对象缺少文件路径');
                new Notice(t('删除高亮失败：缺少文件路径'));
            }
        } catch (error) {
            console.error('删除高亮时出错:', error);
            new Notice(t(`删除高亮失败: ${error.message}`));
        }
    }
    
    /**
     * 从编辑器中删除高亮格式
     * @param file 文件对象
     */
    private async removeHighlightFormatFromEditor(file: TFile) {
        // 获取编辑器实例
        let editor: Editor | null = null;
        let fileContent: string = '';
        
        // 尝试获取当前打开的编辑器
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file && activeView.file.path === file.path) {
            editor = activeView.editor;
        }
        
        // 如果找不到编辑器，直接读取文件内容
        if (!editor) {
            fileContent = await this.plugin.app.vault.read(file);
        } else {
            fileContent = editor.getValue();
        }
        
        // 查找高亮文本在文件中的位置
        if (typeof this.highlight.position === 'number') {
            // 使用位置信息定位高亮
            const position = this.highlight.position;
            const highlightText = this.highlight.text;
            
            // 获取高亮周围的文本上下文
            const contextBefore = fileContent.substring(Math.max(0, position - 100), position);
            const contextAfter = fileContent.substring(position + highlightText.length, Math.min(fileContent.length, position + highlightText.length + 100));
            
            // 尝试匹配可能的高亮格式
            // 支持多种常见的高亮格式：==text==, <mark>text</mark>, <span class="highlight">text</span> 等
            const possibleFormats = [
                new RegExp(`==\\s*(${this.escapeRegExp(highlightText)})\\s*==`, 'g'),
                new RegExp(`<mark[^>]*>(${this.escapeRegExp(highlightText)})</mark>`, 'g'),
                new RegExp(`<span[^>]*>(${this.escapeRegExp(highlightText)})</span>`, 'g')
            ];
            
            // 尝试使用位置信息和文本内容定位高亮
            let newContent = fileContent;
            let replaced = false;
            
            // 尝试在整个文件中查找高亮格式并替换
            const searchRange = fileContent;
            
            // 首先尝试使用常见的高亮格式
            for (const format of possibleFormats) {
                const matches = searchRange.match(format);
                if (matches) {
                    // 找到匹配的格式，替换为纯文本
                    newContent = searchRange.replace(format, highlightText);
                    replaced = true;
                    break;
                }
            }
            
            // 如果没有找到匹配的格式，尝试使用插件设置中的自定义正则表达式
            if (!replaced) {
                // 获取插件设置中的高亮正则表达式
                const plugin = (window as any).app.plugins.plugins['hi-note'];
                if (plugin && plugin.settings && plugin.settings.customHighlightRegex) {
                    try {
                        const customRegex = new RegExp(plugin.settings.customHighlightRegex, 'g');
                        // 在整个文件中搜索自定义格式
                        const matches = searchRange.match(customRegex);
                        if (matches) {
                            // 替换所有匹配项
                            for (const match of matches) {
                                // 检查匹配项是否包含高亮文本
                                if (match.includes(highlightText)) {
                                    newContent = newContent || searchRange;
                                    newContent = newContent.replace(match, highlightText);
                                    replaced = true;
                                }
                            }
                        }
                    } catch (error) {
                        console.error('自定义正则表达式错误:', error);
                    }
                }
            }
            
            // 如果仍然没有找到匹配的格式，使用最简单的方法：直接替换各种高亮格式
            if (!replaced) {
                // 尝试多种高亮格式的替换
                const escapedText = this.escapeRegExp(highlightText);
                
                // ==text== 格式
                const markdownHighlightRegex = new RegExp(`==\\s*(${escapedText})\\s*==`, 'g');
                newContent = fileContent.replace(markdownHighlightRegex, highlightText);
                
                // <mark>text</mark> 格式
                const markTagRegex = new RegExp(`<mark[^>]*>(${escapedText})</mark>`, 'g');
                newContent = newContent.replace(markTagRegex, highlightText);
                
                // <span class="highlight">text</span> 格式
                const spanTagRegex = new RegExp(`<span[^>]*>(${escapedText})</span>`, 'g');
                newContent = newContent.replace(spanTagRegex, highlightText);
            }
            
            // 更新文件内容
            if (editor) {
                editor.setValue(newContent);
            } else {
                await this.plugin.app.vault.modify(file, newContent);
            }
        } else {
            // 如果没有位置信息，尝试通过文本内容查找高亮
            const highlightText = this.highlight.text;
            const escapedText = this.escapeRegExp(highlightText);
            
            // 尝试匹配可能的高亮格式
            const possibleFormats = [
                new RegExp(`==\\s*(${escapedText})\\s*==`, 'g'),
                new RegExp(`<mark[^>]*>(${escapedText})</mark>`, 'g'),
                new RegExp(`<span[^>]*>(${escapedText})</span>`, 'g')
            ];
            
            // 尝试替换所有匹配的高亮格式
            let newContent = fileContent;
            let replaced = false;
            
            for (const format of possibleFormats) {
                const updatedContent = newContent.replace(format, highlightText);
                if (updatedContent !== newContent) {
                    newContent = updatedContent;
                    replaced = true;
                    break;
                }
            }
            
            // 如果没有找到匹配的格式，尝试使用插件设置中的自定义正则表达式
            if (!replaced) {
                // 获取插件设置中的高亮正则表达式
                const plugin = (window as any).app.plugins.plugins['hi-note'];
                if (plugin && plugin.settings && plugin.settings.customHighlightRegex) {
                    try {
                        const customRegex = new RegExp(plugin.settings.customHighlightRegex, 'g');
                        const updatedContent = newContent.replace(customRegex, (match, ...groups) => {
                            // 检查匹配的文本是否包含我们要查找的高亮文本
                            for (const group of groups) {
                                if (typeof group === 'string' && group.includes(highlightText)) {
                                    return highlightText;
                                }
                            }
                            return match; // 如果没有找到匹配的组，保持原样
                        });
                        
                        if (updatedContent !== newContent) {
                            newContent = updatedContent;
                            replaced = true;
                        }
                    } catch (error) {
                        console.error('自定义正则表达式错误:', error);
                    }
                }
            }
            
            // 如果仍然没有找到匹配的格式，使用最简单的方法：直接替换 ==text== 格式
            if (!replaced) {
                const simpleHighlightRegex = new RegExp(`==\\s*${escapedText}\\s*==`, 'g');
                newContent = fileContent.replace(simpleHighlightRegex, highlightText);
            }
            
            // 更新文件内容
            if (editor) {
                editor.setValue(newContent);
            } else {
                await this.plugin.app.vault.modify(file, newContent);
            }
        }
    }
    
    /**
     * 转义正则表达式中的特殊字符
     * @param string 要转义的字符串
     * @returns 转义后的字符串
     */
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    /**
     * 更新所有下拉菜单中的闪卡按钮文本
     * 这个方法会查找所有可能的下拉菜单并更新其中的按钮文本
     */
    // 移除updateAllMenuItems方法
    
    /**
     * 更新评论列表（只更新评论部分，不重新渲染整个卡片）
     */
    public updateComments(updatedHighlight: HighlightInfo): void {
        // 更新高亮数据
        this.highlight = updatedHighlight;
        
        // 查找评论列表容器
        const commentsSection = this.card.querySelector('.hi-notes-section');
        
        if (commentsSection) {
            // 如果有评论列表，移除它
            commentsSection.remove();
        }
        
        // 重新渲染评论列表
        if (this.highlight.comments && this.highlight.comments.length > 0) {
            new CommentList(
                this.card,
                this.highlight,
                (comment) => {
                    this.isEditing = true;
                    this.selectCard();
                    this.options.onCommentEdit(this.highlight, comment);
                }
            );
        }
    }
    
    /**
     * 销毁方法，用于清理事件监听器和从静态集合中移除实例
     */
    public destroy(): void {
        // 移除事件监听器
        if (this.unfocusedInput) {
            this.unfocusedInput.remove();
            this.unfocusedInput = null;
        }
        
        // 关闭下拉菜单
        if (this.moreActionsDropdown) {
            this.moreActionsDropdown.remove();
            this.moreActionsDropdown = null;
        }
        
        // 从静态集合中移除
        HighlightCard.cardInstances.delete(this);
    }
}
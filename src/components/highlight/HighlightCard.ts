import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { ActionButtons } from "./ActionButtons";
import { CommentList } from "./CommentList";
import { setIcon, TFile, WorkspaceLeaf } from "obsidian";
import { DragPreview } from './DragPreview';
import { VIEW_TYPE_COMMENT } from '../../CommentView';
import {t} from "../../i18n";

export class HighlightCard {
    private card: HTMLElement;
    private static selectedCard: HTMLElement | null = null;  
    private isEditing: boolean = false;

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
        private fileName?: string
    ) {
        this.render();
    }

    private render() {
        this.card = this.container.createEl("div", {
            cls: `highlight-card ${this.highlight.isVirtual ? 'virtual-highlight-card' : ''}`,
            attr: {
                'data-highlight': JSON.stringify(this.highlight)
            }
        });

        // 添加点击事件用于切换选中状态
        this.card.addEventListener("click", (e) => {
            // 如果正在编辑，不触发选中状态切换
            if (this.isEditing) {
                return;
            }
            this.selectCard();
        });

        // 在主视图中显示文件名
        if (this.isInMainView && this.fileName) {
            const fileNameEl = this.card.createEl("div", {
                cls: "highlight-card-filename"
            });

            // 添加拖拽属性到文件名区域
            fileNameEl.setAttribute("draggable", "true");
            
            // 添加拖拽事件
            fileNameEl.addEventListener("dragstart", (e) => {
                e.dataTransfer?.setData("text/plain", this.highlight.text);
                e.dataTransfer?.setData("application/highlight", JSON.stringify(this.highlight));
                fileNameEl.addClass("dragging");
                
                // 使用 DragPreview 替代原来的预览处理
                DragPreview.start(e, this.highlight.text);
            });

            fileNameEl.addEventListener("dragend", () => {
                fileNameEl.removeClass("dragging");
                DragPreview.clear();
            });

            // 创建文件图标
            const fileIcon = fileNameEl.createEl("span", {
                cls: "highlight-card-filename-icon",
                attr: {
                    'aria-label': t('Open (DoubleClick)'),
                }
            });
            
            setIcon(fileIcon, 'file-text');

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
                        const editor = (view as any).editor;
                        if (editor) {
                            const pos = editor.offsetToPos(this.highlight.position);
                            editor.setCursor(pos);
                            editor.scrollIntoView({from: pos, to: pos}, true);
                        }
                    }
                }
            });

            // 创建文件名文本
            fileNameEl.createEl("span", {
                text: this.fileName,
                cls: "highlight-card-filename-text"
            });
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

        // 渲染操作按钮 (在 content 容器内)
        new ActionButtons(
            contentEl,
            this.highlight,
            this.plugin,
            {
                onCommentAdd: () => this.options.onCommentAdd(this.highlight),
                onExport: () => {
                    // 确保导出时包含文件名
                    const highlightWithFileName = { ...this.highlight };
                    if (this.fileName) {
                        highlightWithFileName.fileName = this.fileName;
                    }
                    this.options.onExport(highlightWithFileName);
                },
                onAIResponse: this.options.onAIResponse
            }
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

    // 添加选中卡片的方法
    private selectCard() {
        if (HighlightCard.selectedCard && HighlightCard.selectedCard !== this.card) {
            HighlightCard.selectedCard.removeClass('selected');
        }
        this.card.addClass('selected');
        HighlightCard.selectedCard = this.card;
    }

    public getElement(): HTMLElement {
        return this.card;
    }

    public update(highlight: HighlightInfo) {
        this.highlight = highlight;
        this.isEditing = false; // 重置编辑状态
        this.card.empty();
        this.render();
    }
} 
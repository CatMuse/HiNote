import { HighlightInfo, CommentItem } from "../../types";
import type CommentPlugin from "../../../main";
import { HighlightContent } from "./HighlightContent";
import { ActionButtons } from "./ActionButtons";
import { CommentList } from "./CommentList";
import { setIcon, TFile, WorkspaceLeaf, HoverParent, HoverPopover, MarkdownPreviewView } from "obsidian";
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
                
                try {
                    // 首先确保 highlight 对象存在并且有所需的属性
                    if (!this.highlight || !this.highlight.text) {
                        throw new Error('Invalid highlight data');
                    }

                    // 生成格式化的内容
                    const formattedContent = this.generateDragContentSync();
                    
                    // 使用 text/plain 格式来确保编辑器能正确识别 Markdown 格式
                    e.dataTransfer?.setData("text/plain", formattedContent);
                    
                    // 保存原始数据以供其他用途
                    const highlightData = JSON.stringify(this.highlight);
                    e.dataTransfer?.setData("application/highlight", highlightData);
                    
                    fileNameEl.addClass("dragging");
                    
                    // 使用 DragPreview 替代原来的预览处理
                    DragPreview.start(e, this.highlight.text);
                } catch (error) {
                    console.error('Failed to start drag:', error);
                    // 防止错误时的拖拽
                    e.preventDefault();
                    e.stopPropagation();
                }
            });

            fileNameEl.addEventListener("dragend", () => {
                console.log('[HighlightCard] dragend event triggered');
                fileNameEl.removeClass("dragging");
                console.log('[HighlightCard] Removed dragging class');
                DragPreview.clear();
                console.log('[HighlightCard] Cleared DragPreview');
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
            const fileNameText = fileNameEl.createEl("span", {
                text: this.fileName,
                cls: "highlight-card-filename-text"
            });

            // 添加页面预览功能
            this.addPagePreview(fileNameText, this.highlight.filePath || this.fileName);
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
                    source: 'highlight-comment',
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
        const lines: string[] = [];
        const highlight = this.highlight;

        // 使用与 ExportService 相同的格式
        if (highlight.isVirtual) {
            const fileName = highlight.filePath?.split('/').pop()?.replace('.md', '') || 'File';
            lines.push(`> [!note] [[${fileName}]] Comment`);
            lines.push("> ");
            lines.push(`> ${highlight.text}`);
        } else {
            lines.push("> [!quote] Highlight");
            
            // 如果有文件路径和位置信息，尝试查找对应的 Block ID
            if (highlight.filePath && typeof highlight.position === 'number') {
                const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                if (file instanceof TFile) {
                    const cache = this.plugin.app.metadataCache.getFileCache(file);
                    if (cache?.sections) {
                        const position = highlight.position;
                        const section = cache.sections.find(section => 
                            section.position.start.offset <= position &&
                            section.position.end.offset >= position
                        );

                        if (section?.id) {
                            const fileName = highlight.filePath.split('/').pop()?.replace('.md', '');
                            if (fileName) {
                                const reference = `> ![[${fileName}#^${section.id}]]`;
                                lines.push(reference);
                                lines.push("> ");
                            }
                        }
                    }
                }
            }
            
            lines.push(`> ${highlight.text}`);
            lines.push("> ");
        }

        // 添加评论
        if (highlight.comments && highlight.comments.length > 0) {
            for (const comment of highlight.comments) {
                lines.push(">> [!note] Comment");
                // 处理多行内容，确保每行都有正确的缩进
                const commentLines = comment.content
                    .split('\n')
                    .map(line => {
                        line = line.trim();
                        return line ? `>> ${line}` : '>>';
                    })
                    .join('\n');
                lines.push(commentLines);
                
                if (comment.updatedAt) {
                    const date = window.moment(comment.updatedAt);
                    lines.push(`>> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                }
                lines.push(">");
            }
        }

        return lines.join("\n");
    }

    // 异步生成完整的格式化内容，包含 Block ID 的生成和更新
    private async generateDragContent(): Promise<string> {
        const lines: string[] = [];
        const highlight = this.highlight;
        
        console.log('Generating drag content for highlight:', {
            paragraphId: highlight.paragraphId,
            text: highlight.text,
            filePath: highlight.filePath,
            isVirtual: highlight.isVirtual,
            position: highlight.position
        });
        
        // 使用与 ExportService 相同的格式
        if (highlight.isVirtual) {
            const fileName = highlight.filePath?.split('/').pop()?.replace('.md', '') || 'File';
            lines.push(`> [!note] [[${fileName}]] Comment`);
            lines.push("> ");
        } else {
            lines.push("> [!quote] Highlight");
            
            // 尝试获取 Block ID
            if (highlight.filePath && typeof highlight.position === 'number') {
                const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                if (file instanceof TFile) {
                    const cache = this.plugin.app.metadataCache.getFileCache(file);
                    if (cache?.sections) {
                        const position = highlight.position;
                        const section = cache.sections.find(section => 
                            typeof position === 'number' &&
                            section.position.start.offset <= position &&
                            section.position.end.offset >= position
                        );
                        
                        if (section) {
                            let blockId = section.id;
                            
                            // 如果没有 Block ID，生成一个并添加到文档
                            if (!blockId) {
                                // 生成一个符合 Obsidian 格式的 Block ID
                                // 生成 6 位的随机字母数字组合
                                blockId = Math.random().toString(36).substring(2, 8);
                                
                                // 获取文件内容
                                const content = await this.plugin.app.vault.read(file);
                                const lines = content.split('\n');
                                
                                // 找到段落的最后一行
                                const endLine = section.position.end.line;
                                
                                // 在段落末尾添加 Block ID
                                lines[endLine] = lines[endLine] + ` ^${blockId}`;
                                
                                // 更新文件内容
                                await this.plugin.app.vault.modify(file, lines.join('\n'));
                                
                                // 更新高亮的 paragraphId
                                this.highlight.paragraphId = `${file.path}#^${blockId}`;
                                
                                // 更新存储
                                const commentStore = (this.plugin as any).commentStore;
                                if (commentStore) {
                                    await commentStore.updateHighlight(file.path, this.highlight.id, this.highlight);
                                }
                                
                                // 等待元数据缓存更新
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }
                            
                            const reference = `> ![[${file.basename}#^${blockId}]]`;
                            console.log('Generated reference:', reference);
                            lines.push(reference);
                            lines.push("> ");
                            
                            // 添加评论
                            if (highlight.comments && highlight.comments.length > 0) {
                                for (const comment of highlight.comments) {
                                    lines.push(">> [!note] Comment");
                                    // 处理多行内容，确保每行都有正确的缩进
                                    const commentLines = comment.content
                                        .split('\n')
                                        .map(line => {
                                            line = line.trim();
                                            // 如果是空行，返回带缩进的空行
                                            if (!line) return '>>';
                                            return `>> ${line}`;
                                        })
                                        .join('\n');
                                    lines.push(commentLines);
                                    
                                    if (comment.updatedAt) {
                                        const date = window.moment(comment.updatedAt);
                                        lines.push(`>> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                                    }
                                    lines.push(">");
                                }
                            }
                            
                            return lines.join("\n");
                        }
                    }
                }
            }
            
            // 如果没有 paragraphId 或者解析失败，使用原文本
            lines.push(`> ${highlight.text}`);
            lines.push("> ");
            
            // 添加评论
            if (highlight.comments && highlight.comments.length > 0) {
                for (const comment of highlight.comments) {
                    if (highlight.isVirtual) {
                        // 处理多行内容，确保每行都有正确的缩进
                        const commentLines = comment.content
                            .split('\n')
                            .map(line => {
                                line = line.trim();
                                // 如果是空行，返回带缩进的空行
                                if (!line) return '>';
                                return `> ${line}`;
                            })
                            .join('\n');
                        lines.push(commentLines);
                    } else {
                        lines.push(">> [!note] Comment");
                        // 处理多行内容，确保每行都有正确的缩进
                        const commentLines = comment.content
                            .split('\n')
                            .map(line => {
                                line = line.trim();
                                // 如果是空行，返回带缩进的空行
                                if (!line) return '>>';
                                return `>> ${line}`;
                            })
                            .join('\n');
                        lines.push(commentLines);
                    }
                    
                    if (comment.updatedAt) {
                        const date = window.moment(comment.updatedAt);
                        if (highlight.isVirtual) {
                            lines.push(`> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                        } else {
                            lines.push(`>> *${date.format("YYYY-MM-DD HH:mm:ss")}*`);
                        }
                    }
                    lines.push(highlight.isVirtual ? ">" : ">");
                }
            }
        }
        
        // 添加评论（如果有）
        const comments = highlight.comments || [];
        if (comments.length > 0) {
            if (!highlight.isVirtual) {
                lines.push("> ---");
                lines.push("> ");
            }
            
            for (const comment of comments) {
                // 使用与 ExportService 相同的评论格式
                if (highlight.isVirtual) {
                    const commentLines = comment.content
                        .split('\n')
                        .map((line: string) => line.trim() ? `> ${line}` : '>')
                        .join('\n');
                    lines.push(commentLines);
                } else {
                    lines.push(">> [!note] Comment");
                    const commentLines = comment.content
                        .split('\n')
                        .map((line: string) => line.trim() ? `>> ${line}` : '>>')
                        .join('\n');
                    lines.push(commentLines);
                }
                
                // 添加时间戳
                if (comment.updatedAt) {
                    const date = window.moment(comment.updatedAt);
                    lines.push(highlight.isVirtual 
                        ? `> *${date.format("YYYY-MM-DD HH:mm:ss")}*`
                        : `>> *${date.format("YYYY-MM-DD HH:mm:ss")}*`
                    );
                }
                lines.push(highlight.isVirtual ? ">" : ">");
            }
        }
        
        return lines.join("\n");
    }
} 
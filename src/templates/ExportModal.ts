import { App, Modal, Notice } from 'obsidian';
import { HighlightInfo } from '../types/highlight';
import { getTemplate, templates } from './index';
import { CommentItem } from '../types/highlight';
import { t } from "../i18n";
import { exportStyles } from './exportStyles';
import type html2canvas from 'html2canvas';

type Html2Canvas = typeof html2canvas;

export class ExportPreviewModal extends Modal {
    private highlight: HighlightInfo & { comments?: CommentItem[] };
    private html2canvasInstance: Html2Canvas;
    private selectedTemplateId: string = 'default';
    private previewContainer: HTMLElement;
    private includeComments: boolean = false;

    constructor(app: App, highlight: HighlightInfo & { comments?: CommentItem[] }, html2canvas: Html2Canvas) {
        super(app);
        this.highlight = highlight;
        this.html2canvasInstance = html2canvas;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('highlight-export-modal');

        // 创建主容器
        const mainContainer = contentEl.createDiv({
            cls: 'highlight-export-main-container'
        });

        // 直接创建下拉框
        const selectEl = mainContainer.createEl('select', {
            cls: 'highlight-template-select'
        });

        // 添加所有可用模板选项
        templates.forEach(template => {
            const option = selectEl.createEl('option', {
                text: template.name,
                value: template.id
            });
            
            if (this.selectedTemplateId === template.id) {
                option.selected = true;
            }
        });

        // 监听选择变化
        selectEl.addEventListener('change', (e) => {
            const select = e.target as HTMLSelectElement;
            this.selectedTemplateId = select.value;
            this.updatePreview();
        });

        // 创建预览容器
        this.previewContainer = mainContainer.createDiv({
            cls: 'highlight-export-preview-container'
        });

        // 初始预览
        this.updatePreview();

        // 按钮组
        const buttonContainer = contentEl.createDiv({
            cls: 'highlight-export-modal-buttons'
        });
        
        // 在按钮组左侧添加批注显示复选框
        if (this.highlight.comments && this.highlight.comments.length > 0) {
            const showCommentsContainer = buttonContainer.createDiv({
                cls: 'highlight-export-checkbox-container'
            });

            // 创建复选框
            const checkbox = showCommentsContainer.createEl('input', {
                attr: { 
                    type: 'checkbox',
                    id: 'include-comments-checkbox'
                },
                cls: 'highlight-export-checkbox'
            });

            // 创建标签
            showCommentsContainer.createEl('label', {
                text: t('Include Comments'),
                attr: {
                    for: 'include-comments-checkbox'
                },
                cls: 'highlight-export-checkbox-label'
            });

            // 监听复选框状态变化
            checkbox.addEventListener('change', (e) => {
                this.includeComments = (e.target as HTMLInputElement).checked;
                this.updatePreview();
            });
        }

        // 取消按钮
        buttonContainer.createEl('button', {
            cls: 'highlight-btn',
            text: t('Cancel')
        }).addEventListener('click', () => this.close());

        // 下载按钮
        buttonContainer.createEl('button', {
            cls: 'highlight-btn highlight-btn-primary',
            text: t('Download')
        }).addEventListener('click', () => {
            void this.downloadImage();
        });
    }

    private async downloadImage(): Promise<void> {
        try {
            // 创建临时容器用于导出
            const exportContainer = createDiv();
            exportContainer.className = 'highlight-export-container';

            const template = getTemplate(this.selectedTemplateId);
            const cardElement = template.render(this.highlight);
            exportContainer.appendChild(cardElement);

            // 如果开启了批注显示，则添加批注
            if (this.includeComments && this.highlight.comments && this.highlight.comments.length > 0) {
                this.addCommentsToContainer(exportContainer);
            }

            activeDocument.body.appendChild(exportContainer);

            const canvas = await this.html2canvasInstance(exportContainer, {
                backgroundColor: null,
                scale: window.devicePixelRatio * 2, // 使用设备像素比的2倍来确保清晰度
                useCORS: true,
                allowTaint: true,
                logging: false,
                imageTimeout: 0, // 禁用图片超时
                removeContainer: true, // 自动移除临时容器
                onclone: (clonedDoc: Document) => {
                    const style = clonedDoc.adoptNode(createEl('style'));
                    style.textContent = this.getExportStyles();
                    clonedDoc.head.appendChild(style);
                }
            });

            // 优化 canvas 导出质量
            const dataUrl = canvas.toDataURL('image/png', 1.0);

            const link = createEl('a');
            link.download = `highlight-${this.selectedTemplateId}-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();

            this.close();
            new Notice(t('Export successful!'));
        } catch {
            new Notice(t('Export failed, please try again'));
        }
    }

    private updatePreview() {
        this.previewContainer.empty();
        this.previewContainer.className = 'highlight-export-preview';
        const template = getTemplate(this.selectedTemplateId);
        const cardElement = template.render(this.highlight);
        this.previewContainer.appendChild(cardElement);
        
        // 如果开启了批注显示，则添加批注
        if (this.includeComments && this.highlight.comments && this.highlight.comments.length > 0) {
            this.addCommentsToContainer(this.previewContainer);
        }
    }
    
    private addCommentsToContainer(container: HTMLElement) {
        // 获取卡片元素
        const cardElement = container.querySelector('.highlight-export-card');
        if (!cardElement) return;
        
        // 获取页脚元素
        const footerElement = cardElement.querySelector('.highlight-export-footer');
        if (!footerElement) return;
        
        // 创建批注区域
        const commentsContainer = createDiv();
        commentsContainer.className = 'highlight-export-comments-section';
        
        // 添加批注列表
        const commentsList = createDiv();
        commentsList.className = 'highlight-export-comments-list';
        commentsContainer.appendChild(commentsList);
        
        // 渲染每条批注
        if (this.highlight.comments) {
            this.highlight.comments.forEach(comment => {
                const commentItem = createDiv();
                commentItem.className = 'highlight-export-comment-item';
                
                // 批注内容
                const content = createDiv();
                content.className = 'highlight-export-comment-content';
                content.textContent = comment.content;
                commentItem.appendChild(content);
                
                // 批注时间
                if (comment.createdAt) {
                    const time = createDiv();
                    time.className = 'highlight-export-comment-time';
                    time.textContent = new Date(comment.createdAt).toLocaleString();
                    commentItem.appendChild(time);
                }
                
                commentsList.appendChild(commentItem);
            });
        }
        
        // 将批注区域插入到页脚之前
        cardElement.insertBefore(commentsContainer, footerElement);
    }

    private getExportStyles(): string {
        return `
            body {
                margin: 0;
                background: none;
            }
            ${exportStyles}
        `;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

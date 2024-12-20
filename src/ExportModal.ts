import { App, Modal, Notice } from 'obsidian';
import { HighlightInfo } from './types';
import { getTemplate, templates } from './templates';
import { CommentItem } from './CommentStore';

interface Html2CanvasOptions {
    backgroundColor: string;
    scale: number;
    useCORS: boolean;
    allowTaint: boolean;
    logging: boolean;
    onclone: (clonedDoc: Document) => void;
}

export class ExportPreviewModal extends Modal {
    private highlight: HighlightInfo & { comments?: CommentItem[] };
    private html2canvasInstance: any;
    private selectedTemplateId: string = 'default';
    private previewContainer: HTMLElement;

    constructor(app: App, highlight: HighlightInfo & { comments?: CommentItem[] }, html2canvas: any) {
        super(app);
        this.highlight = highlight;
        this.html2canvasInstance = html2canvas;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('highlight-export-modal');

        // 创建主容器
        const mainContainer = contentEl.createEl('div', {
            cls: 'highlight-export-main-container'
        });

        // 添加模板选择区域
        const templateSelector = mainContainer.createEl('div', {
            cls: 'highlight-template-selector'
        });

        // 创建下拉框
        const selectEl = templateSelector.createEl('select', {
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
        this.previewContainer = mainContainer.createEl('div', {
            cls: 'highlight-export-preview-container'
        });

        // 初始预览
        this.updatePreview();

        // 按钮组
        const buttonContainer = contentEl.createEl('div', {
            cls: 'highlight-export-modal-buttons'
        });

        // 取消按钮
        buttonContainer.createEl('button', {
            cls: 'highlight-btn',
            text: '取消'
        }).addEventListener('click', () => this.close());

        // 下载按钮
        buttonContainer.createEl('button', {
            cls: 'highlight-btn highlight-btn-primary',
            text: '下载'
        }).addEventListener('click', async () => {
            try {
                // 创建临时容器用于导出
                const exportContainer = document.createElement('div');
                exportContainer.className = 'highlight-export-container';
                exportContainer.style.padding = '20px';  // 添加内边距
                exportContainer.style.margin = '0';
                exportContainer.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)';  // 添加渐变背景
                exportContainer.style.width = '480px';
                
                const template = getTemplate(this.selectedTemplateId);
                const cardElement = template.render(this.highlight);
                exportContainer.appendChild(cardElement);
                document.body.appendChild(exportContainer);

                const canvas = await this.html2canvasInstance(exportContainer, {
                    backgroundColor: null,
                    scale: 2, // 降低缩放比例
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    onclone: (clonedDoc: Document) => {
                        const style = clonedDoc.createElement('style');
                        style.textContent = this.getExportStyles();
                        clonedDoc.head.appendChild(style);
                    }
                });

                // 清理临时容器
                document.body.removeChild(exportContainer);

                const link = document.createElement('a');
                link.download = `highlight-${this.selectedTemplateId}-${Date.now()}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();

                this.close();
                new Notice('导出成功！');
            } catch (error) {
                console.error('导出图片失败:', error);
                new Notice('导出失败，请重试');
            }
        });
    }

    private updatePreview() {
        this.previewContainer.empty();
        this.previewContainer.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)';
        this.previewContainer.style.padding = '20px';
        const template = getTemplate(this.selectedTemplateId);
        const cardElement = template.render(this.highlight);
        this.previewContainer.appendChild(cardElement);
    }

    private getExportStyles(): string {
        return `
            * {
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-rendering: optimizeLegibility;
                letter-spacing: 0;
                word-spacing: normal;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            .highlight-export-container {
                padding: 0;
                margin: 0;
                background: none;
            }
            ${document.querySelector('#highlight-export-styles')?.innerHTML || ''}
        `;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
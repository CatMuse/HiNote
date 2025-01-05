import { App, Modal, Notice } from 'obsidian';
import { HighlightInfo } from './types';
import { getTemplate, templates } from './templates';
import { CommentItem } from './CommentStore';
import { t } from "src/i18n";
import { exportStyles } from './styles/exportStyles';

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
            text: t('Cancel')
        }).addEventListener('click', () => this.close());

        // 下载按钮
        buttonContainer.createEl('button', {
            cls: 'highlight-btn highlight-btn-primary',
            text: t('Download')
        }).addEventListener('click', async () => {
            try {
                // 创建临时容器用于导出
                const exportContainer = document.createElement('div');
                exportContainer.className = 'highlight-export-container';
                
                const template = getTemplate(this.selectedTemplateId);
                const cardElement = template.render(this.highlight);
                exportContainer.appendChild(cardElement);
                document.body.appendChild(exportContainer);

                const canvas = await this.html2canvasInstance(exportContainer, {
                    backgroundColor: null,
                    scale: window.devicePixelRatio * 2, // 使用设备像素比的2倍来确保清晰度
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    imageTimeout: 0, // 禁用图片超时
                    removeContainer: true, // 自动移除临时容器
                    onclone: async (clonedDoc: Document) => {
                        const style = clonedDoc.createElement('style');
                        style.textContent = this.getExportStyles();
                        clonedDoc.head.appendChild(style);
                        
                        // 给样式应用一个短暂的延时，确保样式完全加载
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                });

                // 优化 canvas 导出质量
                const dataUrl = canvas.toDataURL('image/png', 1.0);

                const link = document.createElement('a');
                link.download = `highlight-${this.selectedTemplateId}-${Date.now()}.png`;
                link.href = dataUrl;
                link.click();

                this.close();
                new Notice(t('Export successful!'));
            } catch (error) {
                console.error('导出图片失败:', error);
                new Notice(t('Export failed, please try again'));
            }
        });
    }

    private updatePreview() {
        this.previewContainer.empty();
        this.previewContainer.className = 'highlight-export-preview';
        const template = getTemplate(this.selectedTemplateId);
        const cardElement = template.render(this.highlight);
        this.previewContainer.appendChild(cardElement);
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
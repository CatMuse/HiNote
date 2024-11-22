import { App, Modal, Notice } from 'obsidian';
import { HighlightInfo } from './types';
import { getTemplate, templates } from './templates';

export class ExportPreviewModal extends Modal {
    private selectedTemplateId: string = 'default';

    constructor(app: App, private highlight: HighlightInfo) {
        super(app);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('highlight-export-modal');

        // 添加标题
        contentEl.createEl('h3', { 
            text: '导出预览',
            cls: 'highlight-export-title'
        });

        // 添加模板选择器
        if (templates.length > 1) {
            const templateSelector = contentEl.createEl('select', {
                cls: 'highlight-template-selector'
            });

            templates.forEach(template => {
                const option = templateSelector.createEl('option', {
                    value: template.id,
                    text: template.name
                });
                if (template.id === this.selectedTemplateId) {
                    option.selected = true;
                }
            });

            templateSelector.addEventListener('change', () => {
                this.selectedTemplateId = templateSelector.value;
                this.updatePreview();
            });
        }

        // 创建预览容器
        const previewContainer = contentEl.createEl('div', {
            cls: 'highlight-export-preview-container'
        });

        // 渲染预览
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
                const html2canvas = require('html2canvas');
                
                // 克隆导出容器
                const exportClone = previewContainer.cloneNode(true) as HTMLElement;
                document.body.appendChild(exportClone);
                
                // 设置克隆容器的样式
                exportClone.style.position = 'fixed';
                exportClone.style.left = '-9999px';
                exportClone.style.top = '0';
                exportClone.style.width = '600px';
                exportClone.style.backgroundColor = getComputedStyle(document.body).getPropertyValue('--background-primary');
                exportClone.style.padding = '32px';
                exportClone.style.borderRadius = '16px';
                exportClone.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                
                // 添加字体和文本渲染相关的样式
                exportClone.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
                (exportClone.style as any)['-webkit-font-smoothing'] = 'antialiased';
                (exportClone.style as any)['-moz-osx-font-smoothing'] = 'grayscale';
                exportClone.style.textRendering = 'optimizeLegibility';
                exportClone.style.letterSpacing = 'normal';
                
                // 等待样式应用
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const canvas = await html2canvas(exportClone, {
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('--background-primary'),
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    foreignObjectRendering: false,
                    logging: true,
                    width: 600,
                    onclone: (document: Document) => {
                        // 在克隆的文档中应用额外的样式
                        const style = document.createElement('style');
                        style.textContent = `
                            .highlight-export-card {
                                background-color: ${getComputedStyle(document.body).getPropertyValue('--background-primary')};
                                color: ${getComputedStyle(document.body).getPropertyValue('--text-normal')};
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                                -webkit-font-smoothing: antialiased;
                                -moz-osx-font-smoothing: grayscale;
                                text-rendering: optimizeLegibility;
                                letter-spacing: normal;
                            }
                            .highlight-export-text {
                                letter-spacing: normal;
                                word-spacing: normal;
                                line-height: 1.6;
                            }
                            .highlight-export-comment-content {
                                letter-spacing: normal;
                                word-spacing: normal;
                                line-height: 1.5;
                            }
                        `;
                        document.head.appendChild(style);
                    }
                });

                // 移除克隆的容器
                document.body.removeChild(exportClone);

                const link = document.createElement('a');
                link.download = `highlight-${Date.now()}.png`;
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
        const previewContainer = this.contentEl.querySelector('.highlight-export-preview-container');
        if (!previewContainer) return;

        previewContainer.empty();
        const template = getTemplate(this.selectedTemplateId);
        const cardElement = template.render(this.highlight);
        previewContainer.appendChild(cardElement);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 
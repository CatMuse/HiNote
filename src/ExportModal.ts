import { App, Modal, Notice } from 'obsidian';
import { HighlightInfo } from './types';
import { getTemplate } from './templates';

interface Html2CanvasOptions {
    backgroundColor: string;
    scale: number;
    useCORS: boolean;
    allowTaint: boolean;
    logging: boolean;
    onclone: (clonedDoc: Document) => void;
}

export class ExportPreviewModal extends Modal {
    constructor(app: App, private highlight: HighlightInfo) {
        super(app);
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('highlight-export-modal');

        // 创建预览容器
        const previewContainer = contentEl.createEl('div', {
            cls: 'highlight-export-preview-container'
        });

        // 渲染预览
        const template = getTemplate('default');
        const cardElement = template.render(this.highlight);
        previewContainer.appendChild(cardElement);

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
                // 使用全局对象中的 html2canvas
                const canvas = await (window as any).html2canvas(previewContainer, {
                    backgroundColor: getComputedStyle(document.body).getPropertyValue('--background-secondary'),
                    scale: 3,
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    onclone: (clonedDoc: Document) => {
                        const style = clonedDoc.createElement('style');
                        style.textContent = `
                            * {
                                -webkit-font-smoothing: antialiased;
                                -moz-osx-font-smoothing: grayscale;
                                text-rendering: optimizeLegibility;
                                letter-spacing: 0;
                                word-spacing: normal;
                                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                            }
                            .highlight-export-preview-container {
                                padding: 40px;
                                background-color: ${getComputedStyle(document.body).getPropertyValue('--background-secondary')};
                            }
                            .highlight-export-card-modern {
                                margin: 0;
                                background-color: ${getComputedStyle(document.body).getPropertyValue('--background-primary')};
                            }
                        `;
                        clonedDoc.head.appendChild(style);
                    }
                });

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

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 
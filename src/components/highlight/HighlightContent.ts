import { setIcon } from "obsidian";
import { HighlightInfo } from "../../types";
import { DragPreview } from './DragPreview';

export class HighlightContent {
    private container: HTMLElement;
    private textContainer: HTMLElement;

    // 添加静态属性来跟踪预览元素
    private static dragPreview: HTMLElement | null = null;

    constructor(
        parentEl: HTMLElement,
        private highlight: HighlightInfo,
        private onHighlightClick: (highlight: HighlightInfo) => Promise<void>
    ) {
        this.render(parentEl);
    }

    private render(parentEl: HTMLElement) {
        this.container = parentEl.createEl("div", {
            cls: "highlight-content"
        });

        this.renderText();
    }

    private renderText() {
        // 高亮文本容器
        this.textContainer = this.container.createEl("div", {
            cls: "highlight-text-container"
        });

        // 添加竖线装饰
        const decorator = this.textContainer.createEl("div", {
            cls: "highlight-text-decorator"
        });

        // 如果有背景色，应用到装饰器
        if (this.highlight.backgroundColor) {
            decorator.style.backgroundColor = this.highlight.backgroundColor;
        }

        // 高亮文本
        const textEl = this.textContainer.createEl("div", {
            cls: "highlight-text",
            attr: { 'aria-label': '点击定位到文档位置' }
        });

        // 创建文本内容元素
        const textContent = textEl.createEl("div", {
            text: this.highlight.text,
            cls: "highlight-text-content"
        });

        // 将点击事件监听器移到文本内容元素上
        textContent.addEventListener("mousedown", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.onHighlightClick(this.highlight);
        });

        // 在内容区域添加拖拽事件
        textContent.setAttribute('draggable', 'true');
        textContent.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            
            // 准备拖拽数据
            const highlightData = {
                text: this.highlight.text,
                position: this.highlight.position,
                paragraphId: this.highlight.paragraphId,
                paragraphText: this.highlight.paragraphText
            };
            
            // 设置拖拽数据
            e.dataTransfer?.setData('application/highlight', JSON.stringify(highlightData));
            
            // 启动拖拽预览
            DragPreview.start(e, this.highlight.text);
        });

        textContent.addEventListener('dragend', () => {
            DragPreview.clear();
        });
    }

    public getContainer(): HTMLElement {
        return this.container;
    }
} 
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
            cls: "highlight-text"
        });

        // 创建文本内容元素，如果是虚拟高亮则使用 displayText
        const textContent = textEl.createEl("div", {
            cls: `highlight-text-content ${this.highlight.isVirtual ? 'virtual-highlight' : ''}`
        });

        // 处理文本中的换行符，添加空值检查
        const text = (this.highlight.isVirtual ? this.highlight.displayText : this.highlight.text) || '';
        const lines = text.split('\n');
        
        // 为每一行创建单独的段落
        lines.forEach((line, index) => {
            const p = textContent.createEl("p", {
                text: line,
                cls: "highlight-text-line"
            });
            
            // 如果不是最后一行，添加换行
            if (index < lines.length - 1) {
                p.addClass('highlight-text-line-spacing');
            }
        });

        // 只保留点击事件
        textContent.addEventListener("mousedown", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await this.onHighlightClick(this.highlight);
        });
    }

    public getContainer(): HTMLElement {
        return this.container;
    }
} 
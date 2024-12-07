import { setIcon } from "obsidian";
import { HighlightInfo } from "../../types";

export class HighlightContent {
    private container: HTMLElement;
    private textContainer: HTMLElement;

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

        // 高亮文本���域
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
    }

    public getContainer(): HTMLElement {
        return this.container;
    }
} 
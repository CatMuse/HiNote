import { setIcon, MarkdownRenderer, Component, App } from "obsidian";
import { HighlightInfo } from "../../types";
import { DragPreview } from './DragPreview';

export class HighlightContent extends Component {
    private container: HTMLElement;
    private textContainer: HTMLElement;

    // 添加静态属性来跟踪预览元素
    private static dragPreview: HTMLElement | null = null;

    constructor(
        parentEl: HTMLElement,
        private highlight: HighlightInfo,
        private onHighlightClick: (highlight: HighlightInfo) => Promise<void>,
        private app: App = (window as any).app
    ) {
        super();
        this.render(parentEl).catch(error => {
            console.error('Error rendering highlight content:', error);
        });
    }

    private async render(parentEl: HTMLElement) {
        this.container = parentEl.createEl("div", {
            cls: "highlight-content"
        });

        await this.renderText();
    }

    private async renderText() {
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
            cls: `highlight-text-content ${this.highlight.isVirtual ? 'virtual-highlight' : ''} markdown-rendered`
        });

        // 处理文本中的换行符，添加空值检查
        const text = (this.highlight.isVirtual ? this.highlight.displayText : this.highlight.text) || '';
        
        try {
            // 使用 Obsidian 的 MarkdownRenderer.render 方法渲染 Markdown 内容
            // 使用新的 Component 实例代替 this，避免继承复杂的样式规则
            await MarkdownRenderer.render(
                this.app,
                text,
                textContent,
                this.highlight.filePath || '',
                new Component()
            );
            
            // 添加自定义样式类以修复可能的样式问题
            const lists = textContent.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.addClass('highlight-markdown-list');
            });
        } catch (error) {
            console.error('Error rendering markdown in highlight:', error);
            
            // 如果渲染失败，回退到纯文本渲染
            const lines = text.split('\n');
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
        }

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
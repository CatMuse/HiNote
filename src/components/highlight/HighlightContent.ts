import { setIcon, MarkdownRenderer, Component, App, TFile } from "obsidian";
import { HighlightInfo } from "../../types";
import { t } from "../../i18n";
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
        private app: App = (window as any).app,
        private isInMainView: boolean = false
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
            
            // 激活内部链接
            await this.activateInternalLinks(textContent, this.highlight.filePath || '');
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

        // 如果不是全局搜索结果且不在主视图中，添加点击事件
        if (!this.highlight.isGlobalSearch && !this.isInMainView) {
            // 设置提示文本为“跳转到高亮”
            textContent.setAttribute('aria-label', t('Jump to highlight'));
            
            textContent.addEventListener("mousedown", async (e) => {
                // 如果点击的是链接，不触发高亮点击事件
                if ((e.target as HTMLElement).closest('a')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                await this.onHighlightClick(this.highlight);
            });
        } else {
            // 全局搜索结果或主视图添加特殊样式类
            textContent.addClass('global-search-highlight');
            
            // 移除可能存在的提示文本
            textContent.removeAttribute('aria-label');
            
            // 添加提示性鼠标样式
            textContent.style.cursor = 'default';
        }
    }
    
    /**
     * 激活内部链接，添加悬停预览和点击跳转功能
     * @param element 包含链接的元素
     * @param sourcePath 源文件路径
     */
    private async activateInternalLinks(element: HTMLElement, sourcePath: string) {
        // 查找所有内部链接元素
        const internalLinks = element.querySelectorAll('a.internal-link');
        
        internalLinks.forEach(link => {
            // 获取链接目标
            const target = link.getAttribute('data-href') || link.getAttribute('href');
            if (!target) return;
            
            // 添加点击事件
            link.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // 打开链接
                const targetFile = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
                if (targetFile) {
                    this.app.workspace.openLinkText(target, sourcePath, false);
                }
            });
            
            // 添加悬停预览
            link.addEventListener('mouseenter', (event) => {
                this.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: element,
                    targetEl: link,
                    linktext: target,
                    sourcePath: sourcePath
                });
            });
        });
        
        // 查找所有标签
        const tags = element.querySelectorAll('a.tag');
        
        tags.forEach(tag => {
            // 获取标签文本
            const tagText = tag.getAttribute('href');
            if (!tagText) return;
            
            // 添加点击事件
            tag.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                
                // 打开标签搜索
                this.app.workspace.trigger('search:open', tagText);
            });
        });
    }

    public getContainer(): HTMLElement {
        return this.container;
    }
} 
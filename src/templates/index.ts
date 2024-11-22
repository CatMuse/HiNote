import { HighlightInfo } from '../types';

// 卡片模板接口
export interface CardTemplate {
    id: string;
    name: string;
    description: string;
    render: (highlight: HighlightInfo) => HTMLElement;
}

// 默认模板
export const defaultTemplate: CardTemplate = {
    id: 'default',
    name: '默认模板',
    description: '简洁的知识卡片样式',
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card';

        // 添加卡片标题
        const header = cardContainer.createEl('div', {
            cls: 'highlight-export-card-header'
        });
        header.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>知识摘录</span>
        `;

        // 高亮文本区域
        const textSection = cardContainer.createEl('div', {
            cls: 'highlight-export-text-section'
        });
        textSection.createEl('div', {
            text: highlight.text,
            cls: 'highlight-export-text'
        });

        // 评论区域
        if (highlight.comments?.length) {
            const commentsSection = cardContainer.createEl('div', {
                cls: 'highlight-export-comments'
            });

            commentsSection.createEl('div', {
                text: '思考与评论',
                cls: 'highlight-export-comments-title'
            });

            highlight.comments.forEach(comment => {
                const commentEl = commentsSection.createEl('div', {
                    cls: 'highlight-export-comment'
                });

                commentEl.createEl('div', {
                    text: comment.content,
                    cls: 'highlight-export-comment-content'
                });

                commentEl.createEl('div', {
                    text: new Date(comment.createdAt).toLocaleString(),
                    cls: 'highlight-export-comment-time'
                });
            });
        }

        // 底部信息
        const footer = cardContainer.createEl('div', {
            cls: 'highlight-export-footer'
        });

        footer.createEl('div', {
            cls: 'highlight-export-source'
        }).innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span>From Obsidian</span>
        `;

        footer.createEl('div', {
            text: new Date().toLocaleDateString(),
            cls: 'highlight-export-date'
        });

        return cardContainer;
    }
};

// 模板注册表
export const templates: CardTemplate[] = [defaultTemplate];

// 获取模板
export function getTemplate(id: string): CardTemplate {
    return templates.find(t => t.id === id) || defaultTemplate;
}

// 注册新模板
export function registerTemplate(template: CardTemplate) {
    templates.push(template);
} 
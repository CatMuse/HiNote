import { HighlightInfo } from '../types';

// 卡片模板接口
export interface CardTemplate {
    id: string;
    name: string;
    description: string;
    render: (highlight: HighlightInfo) => HTMLElement;
}

// 默认模板（使用现代风格）
export const defaultTemplate: CardTemplate = {
    id: 'default',
    name: '默认模板',
    description: '现代简约的知识卡片样式',
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-modern';

        // 高亮文本区域
        const quoteSection = document.createElement('div');
        quoteSection.className = 'highlight-export-quote-section';
        
        // 添加引号装饰
        const quoteDecoration = document.createElement('div');
        quoteDecoration.className = 'highlight-export-quote-decoration';
        quoteDecoration.innerHTML = `
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" opacity="0.2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
            </svg>
        `;
        quoteSection.appendChild(quoteDecoration);
        
        const quoteContent = document.createElement('div');
        quoteContent.className = 'highlight-export-quote';
        quoteContent.textContent = highlight.text;
        quoteSection.appendChild(quoteContent);
        cardContainer.appendChild(quoteSection);

        // 底部信息
        const footer = document.createElement('div');
        footer.className = 'highlight-export-footer';

        const source = document.createElement('div');
        source.className = 'highlight-export-source';
        source.textContent = document.querySelector('.workspace-leaf.mod-active .view-header-title')?.textContent || 'Obsidian';
        footer.appendChild(source);

        const date = document.createElement('div');
        date.className = 'highlight-export-date';
        date.textContent = new Date().toLocaleDateString();
        footer.appendChild(date);

        cardContainer.appendChild(footer);

        return cardContainer;
    }
};

// 模板注册表 - 只保留默认模板
export const templates: CardTemplate[] = [defaultTemplate];

// 获取模板
export function getTemplate(id: string): CardTemplate {
    return defaultTemplate;  // 始终返回默认模板
}

// 注册新模板（如果后续需要添加其他模板）
export function registerTemplate(template: CardTemplate) {
    if (!templates.find(t => t.id === template.id)) {
        templates.push(template);
    }
} 
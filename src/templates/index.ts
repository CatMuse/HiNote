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

        // 引用区域
        const quoteSection = document.createElement('div');
        quoteSection.className = 'highlight-export-quote-section';
        
        // 引号装饰
        const quoteDecoration = document.createElement('div');
        quoteDecoration.className = 'highlight-export-quote-decoration';
        quoteDecoration.innerHTML = `
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
            </svg>
        `;
        quoteSection.appendChild(quoteDecoration);
        
        // 引用内容
        const quoteContent = document.createElement('div');
        quoteContent.className = 'highlight-export-quote';
        quoteContent.textContent = highlight.text;
        quoteSection.appendChild(quoteContent);
        
        cardContainer.appendChild(quoteSection);

        // 底部信息
        const footer = document.createElement('div');
        footer.className = 'highlight-export-footer';

        // 来源信息
        const source = document.createElement('div');
        source.className = 'highlight-export-source';
        const docTitle = document.querySelector('.workspace-leaf.mod-active .view-header-title')?.textContent || 'Obsidian';
        source.textContent = docTitle;
        footer.appendChild(source);

        // 日期信息
        const date = document.createElement('div');
        date.className = 'highlight-export-date';
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        };
        date.textContent = now.toLocaleDateString(undefined, options);
        footer.appendChild(date);

        cardContainer.appendChild(footer);

        return cardContainer;
    }
};

// 学术模板
export const academicTemplate: CardTemplate = {
    id: 'academic',
    name: '学术模板',
    description: '适合学术引用的正式样式',
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-academic';

        const quoteContent = document.createElement('div');
        quoteContent.className = 'highlight-export-quote';
        quoteContent.textContent = `"${highlight.text}"`;
        cardContainer.appendChild(quoteContent);

        const footer = document.createElement('div');
        footer.className = 'highlight-export-footer';
        
        const source = document.createElement('div');
        source.className = 'highlight-export-source';
        const docTitle = document.querySelector('.workspace-leaf.mod-active .view-header-title')?.textContent || 'Obsidian';
        source.textContent = `Source: ${docTitle}`;
        footer.appendChild(source);

        const date = document.createElement('div');
        date.className = 'highlight-export-date';
        date.textContent = `Retrieved: ${new Date().toLocaleDateString()}`;
        footer.appendChild(date);

        cardContainer.appendChild(footer);
        return cardContainer;
    }
};

// 社交媒体模板
export const socialTemplate: CardTemplate = {
    id: 'social',
    name: '社交模板',
    description: '适合社交媒体分享的现代样式',
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-social';

        const header = document.createElement('div');
        header.className = 'highlight-export-header';
        
        const logo = document.createElement('div');
        logo.className = 'highlight-export-logo';
        logo.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
        </svg>`;
        header.appendChild(logo);
        
        const appName = document.createElement('div');
        appName.className = 'highlight-export-app-name';
        appName.textContent = 'Obsidian';
        header.appendChild(appName);
        
        cardContainer.appendChild(header);

        const quoteContent = document.createElement('div');
        quoteContent.className = 'highlight-export-quote';
        quoteContent.textContent = highlight.text;
        cardContainer.appendChild(quoteContent);

        const footer = document.createElement('div');
        footer.className = 'highlight-export-footer';
        
        const source = document.createElement('div');
        source.className = 'highlight-export-source';
        source.textContent = document.querySelector('.workspace-leaf.mod-active .view-header-title')?.textContent || 'Obsidian';
        footer.appendChild(source);

        cardContainer.appendChild(footer);
        return cardContainer;
    }
};

// 模板注册表
export const templates: CardTemplate[] = [
    defaultTemplate,
    academicTemplate,
    socialTemplate
];

// 获取模板
export function getTemplate(id: string): CardTemplate {
    return templates.find(t => t.id === id) || defaultTemplate;
}

// 注册新模板（如果后续需要添加其他模板）
export function registerTemplate(template: CardTemplate) {
    if (!templates.find(t => t.id === template.id)) {
        templates.push(template);
    }
} 
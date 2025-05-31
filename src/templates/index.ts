import { HighlightInfo } from '../types';
import { t } from '../i18n';

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
    name: t('Default Template'),
    description: t('Modern minimalist knowledge card style'),
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-modern';

        // 引用区域
        const quoteSection = document.createElement('div');
        quoteSection.className = 'highlight-export-quote-section';
        
        // 引用装饰
        const quoteDecoration = document.createElement('div');
        quoteDecoration.className = 'highlight-export-quote-decoration';

        const quoteSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        quoteSvg.setAttribute("viewBox", "0 0 24 24");
        quoteSvg.setAttribute("width", "48");
        quoteSvg.setAttribute("height", "48");
        quoteSvg.setAttribute("fill", "none");
        quoteSvg.setAttribute("stroke", "currentColor");
        quoteSvg.setAttribute("stroke-width", "1");

        const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path1.setAttribute("d", "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z");

        const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path2.setAttribute("d", "M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z");

        quoteSvg.appendChild(path1);
        quoteSvg.appendChild(path2);
        quoteDecoration.appendChild(quoteSvg);

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
        source.textContent = highlight.fileName || highlight.filePath?.split('/').pop() || 'Untitled';
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
    name: t('Academic Template'),
    description: t('Formal style suitable for academic citations'),
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
        source.textContent = highlight.fileName || highlight.filePath?.split('/').pop() || 'Untitled';
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
    name: t('Social Template'),
    description: t('Modern style suitable for social media sharing'),
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-social';

        const header = document.createElement('div');
        header.className = 'highlight-export-header';
        
        const logo = document.createElement('div');
        logo.className = 'highlight-export-logo';

        const logoSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        logoSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        logoSvg.setAttribute("width", "24");
        logoSvg.setAttribute("height", "24");
        logoSvg.setAttribute("viewBox", "0 0 100 100");
        logoSvg.setAttribute("fill", "currentColor");
        logoSvg.setAttribute("stroke", "none");

        // Obsidian Logo - 钻石/宝石形状
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", "M50,9.4L14.8,37.1l12.6,38.8l22.6,14.7l22.6-14.7l12.6-38.8L50,9.4z M50,19.5l25.5,20l-9.4,28.9L50,80.6 L33.9,68.4l-9.4-28.9L50,19.5z");
        
        // 内部细节
        const innerPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        innerPath.setAttribute("d", "M50,19.5l-25.5,20l9.4,28.9L50,80.6V19.5z");
        innerPath.setAttribute("fill-opacity", "0.3");

        logoSvg.appendChild(path);
        logoSvg.appendChild(innerPath);
        logo.appendChild(logoSvg);

        header.appendChild(logo);
        
        const appName = document.createElement('div');
        appName.className = 'highlight-export-app-name';
        appName.textContent = 'HiNote';
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
        source.textContent = highlight.fileName || highlight.filePath?.split('/').pop() || 'Untitled';
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
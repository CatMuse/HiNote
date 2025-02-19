import { CardTemplate } from './index';
import { HighlightInfo } from '../types';

export const modernTemplate: CardTemplate = {
    id: 'modern',
    name: '现代风格',
    description: '现代简约的卡片样式',
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-modern';

        // 高亮文本区域
        const quoteSection = document.createElement('div');
        quoteSection.className = 'highlight-export-quote-section';
        
        // 添加引号装饰
        const quoteDecoration = document.createElement('div');
        quoteDecoration.className = 'highlight-export-quote-decoration';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '32');
        svg.setAttribute('height', '32');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('opacity', '0.2');

        const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path1.setAttribute('d', 'M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z');

        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', 'M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z');

        svg.appendChild(path1);
        svg.appendChild(path2);
        quoteDecoration.appendChild(svg);
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

// 这个文件好像暂时没有，可作为以后的模板扩展来用
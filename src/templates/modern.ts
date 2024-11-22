import { CardTemplate } from './index';
import { HighlightInfo } from '../types';

export const modernTemplate: CardTemplate = {
    id: 'modern',
    name: '现代风格',
    description: '现代简约的卡片样式',
    render: (highlight: HighlightInfo) => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'highlight-export-card highlight-export-card-modern';

        // 添加卡片标题
        const header = document.createElement('div');
        header.className = 'highlight-export-card-header';
        header.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <span>知识摘录</span>
        `;
        cardContainer.appendChild(header);

        // 高亮文本区域
        const textSection = document.createElement('div');
        textSection.className = 'highlight-export-text-section';
        
        const textContent = document.createElement('div');
        textContent.className = 'highlight-export-text';
        textContent.textContent = highlight.text;
        textSection.appendChild(textContent);
        cardContainer.appendChild(textSection);

        // 评论区域
        if (highlight.comments?.length) {
            const commentsSection = document.createElement('div');
            commentsSection.className = 'highlight-export-comments';

            const commentsTitle = document.createElement('div');
            commentsTitle.className = 'highlight-export-comments-title';
            commentsTitle.textContent = '思考与评论';
            commentsSection.appendChild(commentsTitle);

            highlight.comments.forEach(comment => {
                const commentEl = document.createElement('div');
                commentEl.className = 'highlight-export-comment';

                const commentContent = document.createElement('div');
                commentContent.className = 'highlight-export-comment-content';
                commentContent.textContent = comment.content;
                commentEl.appendChild(commentContent);

                const commentTime = document.createElement('div');
                commentTime.className = 'highlight-export-comment-time';
                commentTime.textContent = new Date(comment.createdAt).toLocaleString();
                commentEl.appendChild(commentTime);

                commentsSection.appendChild(commentEl);
            });

            cardContainer.appendChild(commentsSection);
        }

        // 底部信息
        const footer = document.createElement('div');
        footer.className = 'highlight-export-footer';

        const source = document.createElement('div');
        source.className = 'highlight-export-source';
        source.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
            </svg>
            <span>From Obsidian</span>
        `;
        footer.appendChild(source);

        const date = document.createElement('div');
        date.className = 'highlight-export-date';
        date.textContent = new Date().toLocaleDateString();
        footer.appendChild(date);

        cardContainer.appendChild(footer);

        return cardContainer;
    }
}; 
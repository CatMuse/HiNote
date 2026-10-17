import type { CommentItem } from '../../types/highlight';

/** The effective front supplies cloze answers; annotations remain source-owned. */
export function buildLinkedCardAnswer(text: string, comments: Pick<CommentItem, 'content'>[]): string {
    const clozes = Array.from(text.matchAll(/\{\{([^{}]+)\}\}/g), match => match[1]);
    const annotations = comments.map(comment => comment.content).filter(content => content.trim());
    return [clozes.join('\n'), annotations.join('\n\n')].filter(Boolean).join('\n\n');
}

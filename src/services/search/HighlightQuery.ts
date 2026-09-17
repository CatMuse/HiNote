export type HighlightSearchType = '' | 'all' | 'path' | 'comment' | 'hicard';
export interface HighlightQuery {
    raw: string;
    term: string;
    type: HighlightSearchType;
    scope: 'page' | 'vault';
}
export function parseHighlightQuery(raw: string): HighlightQuery {
    const normalized = raw.toLowerCase().trim();
    const match = /^(all|path|comment|hicard):\s*/.exec(normalized);
    const type = (match?.[1] || '') as HighlightSearchType;
    return { raw, type, term: match ? normalized.slice(match[0].length) : normalized,
        scope: type === 'all' || type === 'path' ? 'vault' : 'page' };
}

export interface HighlightQuery {
    raw: string;
    term: string;
}

/** Search is deliberately text-only. Scope and card type live in ViewState. */
export function parseHighlightQuery(raw: string): HighlightQuery {
    return { raw, term: raw.toLowerCase().trim() };
}

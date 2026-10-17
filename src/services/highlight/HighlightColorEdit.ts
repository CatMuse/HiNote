import { HighlightColor, highlightColorStyle, parseHighlightColor } from './HighlightColor';

export const HIGHLIGHT_COLOR_CHOICES: Array<{ color: HighlightColor | null; label: string; marker: string }> = [
    { color: null, label: 'Default yellow', marker: '🟡' },
    { color: 'red', label: 'Red', marker: '🔴' },
    { color: 'orange', label: 'Orange', marker: '🟠' },
    { color: 'green', label: 'Green', marker: '🟢' },
    { color: 'blue', label: 'Blue', marker: '🔵' },
    { color: 'purple', label: 'Purple', marker: '🟣' }
];

/** Split declarations without splitting quoted strings or function arguments. */
function declarations(style: string): string[] {
    const result: string[] = [];
    let start = 0, depth = 0, quote = '';
    for (let i = 0; i < style.length; i++) {
        const c = style[i];
        if (c === '\\') { i++; continue; }
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ';' && depth === 0) { result.push(style.slice(start, i)); start = i + 1; }
    }
    result.push(style.slice(start));
    return result;
}

const OPEN_TAG = /^<(mark|span)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i;
const STYLE = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i;

export function extractHtmlHighlightColor(source: string): string | null {
    const opening = source.match(OPEN_TAG)?.[0];
    const style = opening?.match(STYLE);
    if (!style) return null;
    let color: string | null = null;
    let important = false;
    for (const declaration of declarations(style[2] ?? style[3])) {
        const match = declaration.match(/^\s*background(?:-color)?\s*:\s*(.*?)\s*$/i);
        if (!match) continue;
        const priority = /\s*!important\s*$/i.test(match[1]);
        if (important && !priority) continue;
        color = match[1].replace(/\s*!important\s*$/i, '').trim() || null;
        important = priority;
    }
    return color;
}

/** Change only the source wrapper; HTML text (including emoji) stays literal. */
export function recolorHighlightSource(source: string, color: HighlightColor | null): string {
    if (source.startsWith('==') && source.endsWith('==')) {
        const text = parseHighlightColor(source.slice(2, -2)).text;
        const marker = color === 'yellow' ? '🟡' : HIGHLIGHT_COLOR_CHOICES.find(choice => choice.color === color)?.marker;
        return `==${color ? marker : ''}${text}==`;
    }
    const opening = source.match(OPEN_TAG);
    if (!opening || !new RegExp(`</${opening[1]}>$`, 'i').test(source)) {
        throw new Error('This highlight format does not support color changes.');
    }
    const value = color ? highlightColorStyle(color) : 'var(--text-highlight-bg, #ffeb3b)';
    const style = opening[0].match(STYLE);
    if (!style && /\sstyle\s*=/i.test(opening[0])) {
        throw new Error('Unquoted HTML styles cannot be safely recolored.');
    }
    let tag: string;
    if (style) {
        // Keep shorthand backgrounds and other declarations; a final longhand wins.
        const retained = declarations(style[2] ?? style[3])
            .filter(item => !/^\s*background-color\s*:/i.test(item)).join(';').trim();
        const quote = style[1][0];
        const replacement = ` style=${quote}${retained}${retained && !retained.endsWith(';') ? ';' : ''} background-color: ${value} !important;${quote}`;
        tag = opening[0].replace(STYLE, () => replacement);
    } else {
        tag = opening[0].slice(0, -1) + ` style="background-color: ${value};">`;
    }
    return tag + source.slice(opening[0].length);
}

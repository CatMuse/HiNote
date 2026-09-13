export type HighlightColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';

const COLORS: Record<string, HighlightColor> = {
    '🔴': 'red', '🟥': 'red', '🟠': 'orange', '🟧': 'orange',
    '🟡': 'yellow', '🟨': 'yellow', '🟢': 'green', '🟩': 'green',
    '🔵': 'blue', '🟦': 'blue', '🟣': 'purple', '🟪': 'purple'
};

const FALLBACKS: Record<HighlightColor, string> = {
    red: '#e93147', orange: '#ec7500', yellow: '#e0ac00',
    green: '#08b94e', blue: '#086ddd', purple: '#7852ee'
};

/** Only the first code point is a color marker; spaces and later emoji are content. */
export function parseHighlightColor(text: string): { text: string; color?: HighlightColor } {
    const codePoint = text.codePointAt(0);
    const marker = codePoint === undefined ? '' : String.fromCodePoint(codePoint);
    const color = COLORS[marker];
    return color ? { text: text.slice(marker.length), color } : { text };
}

export function highlightColorStyle(color: HighlightColor): string {
    return `var(--color-${color}, ${FALLBACKS[color]})`;
}

export function isHighlightColor(value: string | null): value is HighlightColor {
    return value !== null && Object.prototype.hasOwnProperty.call(FALLBACKS, value);
}

import type { NavigationRange } from '../../editor/NavigationFlash';

/** Prefer the occurrence nearest the scan anchor, which may include markup delimiters. */
export function findHighlightLocation(content: string, text: string, position?: number): NavigationRange | null {
    if (!text.trim()) return null;
    const anchor = Number.isFinite(position) && position! >= 0 ? position! : 0;
    let closest = -1;
    for (let from = content.indexOf(text); from !== -1; from = content.indexOf(text, from + 1)) {
        if (closest === -1 || Math.abs(from - anchor) < Math.abs(closest - anchor)) closest = from;
        if (from >= anchor) break;
    }
    return closest === -1 ? null : { from: closest, to: closest + text.length };
}

import type { ScannedHighlight } from '../../types/highlight';

export interface SelectionRangePlan {
    from: number;
    to: number;
    source?: ScannedHighlight;
}

interface PreviewSection {
    sourcePath: string;
    lineStart: number;
    lineEnd: number;
}

function overlaps(from: number, to: number, start: number, end: number): boolean {
    return from < end && to > start;
}

function isUnsafePlainText(text: string): boolean {
    return !text.trim() || text.includes('\n') || text.includes('==') || /[`<>]|<!--|-->/.test(text);
}

function isInCode(snapshot: string, from: number): boolean {
    let fence: { marker: string; length: number } | undefined;
    const lineStart = snapshot.lastIndexOf('\n', from - 1) + 1;
    for (const line of snapshot.slice(0, lineStart).split('\n')) {
        const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (!match) continue;
        if (!fence) fence = { marker: match[1][0], length: match[1].length };
        else if (match[1][0] === fence.marker && match[1].length >= fence.length && !match[2].trim()) fence = undefined;
    }
    if (fence) return true;
    const end = snapshot.indexOf('\n', lineStart);
    const line = snapshot.slice(lineStart, end < 0 ? snapshot.length : end);
    const runs = [...line.matchAll(/`+/g)].filter(match => line[match.index! - 1] !== '\\');
    for (let index = 0; index < runs.length; index++) {
        const opening = runs[index];
        const closing = runs.findIndex((run, next) => next > index && run[0].length === opening[0].length);
        if (closing < 0) continue;
        if (from >= lineStart + opening.index! && from < lineStart + runs[closing].index! + runs[closing][0].length) return true;
        index = closing;
    }
    return false;
}

function findUnique(source: string, selected: string): { index: number; length: number } | null {
    const exact: number[] = [];
    let from = 0;
    while (selected && (from = source.indexOf(selected, from)) >= 0) {
        exact.push(from);
        from += 1;
    }
    if (exact.length === 1) return { index: exact[0], length: selected.length };

    const normalize = (value: string) => value.replace(/[\s\u200b\ufeff]+/g, ' ');
    const normalizedSource = normalize(source);
    const normalizedSelected = normalize(selected.trim());
    if (!normalizedSelected) return null;
    const normalizedIndex = normalizedSource.indexOf(normalizedSelected);
    if (normalizedIndex < 0 || normalizedSource.indexOf(normalizedSelected, normalizedIndex + 1) >= 0) return null;

    // Convert the normalized match back to source offsets. This only folds whitespace;
    // it does not guess through Markdown syntax.
    let sourceIndex = 0;
    let normalizedIndexCursor = 0;
    while (sourceIndex < source.length && normalizedIndexCursor < normalizedIndex) {
        if (/\s|[\u200b\ufeff]/.test(source[sourceIndex])) {
            while (sourceIndex < source.length && /\s|[\u200b\ufeff]/.test(source[sourceIndex])) sourceIndex++;
            normalizedIndexCursor++;
        } else {
            sourceIndex++;
            normalizedIndexCursor++;
        }
    }
    const start = sourceIndex;
    let normalizedLength = 0;
    while (sourceIndex < source.length && normalizedLength < normalizedSelected.length) {
        if (/\s|[\u200b\ufeff]/.test(source[sourceIndex])) {
            while (sourceIndex < source.length && /\s|[\u200b\ufeff]/.test(source[sourceIndex])) sourceIndex++;
            normalizedLength++;
        } else {
            sourceIndex++;
            normalizedLength++;
        }
    }
    return normalizedLength === normalizedSelected.length ? { index: start, length: sourceIndex - start } : null;
}

export function resolveSourceSelection(
    snapshot: string,
    from: number,
    to: number,
    scans: ScannedHighlight[]
): SelectionRangePlan | null {
    if (from < 0 || to > snapshot.length || from >= to) return null;
    // Double/triple-click selections often include paragraph whitespace. Trim only
    // the edges; internal newlines remain unsupported for native == highlighting.
    while (from < to && /\s/.test(snapshot[from])) from++;
    while (to > from && /\s/.test(snapshot[to - 1])) to--;
    if (from >= to) return null;
    if (isInCode(snapshot, from)) return null;
    const selected = snapshot.slice(from, to);
    const containing = scans.filter(scan => scan.position <= from && scan.position + scan.originalLength >= to);
    const overlapping = scans.filter(scan => overlaps(from, to, scan.position, scan.position + scan.originalLength));

    if (containing.length > 1 || overlapping.length > containing.length) return null;
    if (containing.length === 1) {
        const source = containing[0];
        const sourceEnd = source.position + source.originalLength;
        if (source.syntax !== 'markdown' || from < source.position + 2 || to > sourceEnd - 2) return null;
        return { from: source.position, to: sourceEnd, source };
    }

    if (isUnsafePlainText(selected) || snapshot[from - 1] === '=' || snapshot[to] === '=') return null;
    return { from, to };
}

export function resolvePreviewSelection(
    snapshot: string,
    section: PreviewSection,
    selectedText: string,
    scans: ScannedHighlight[]
): SelectionRangePlan | null {
    if (!selectedText.trim() || section.lineStart < 0 || section.lineEnd < section.lineStart) return null;
    const lines = snapshot.split('\n');
    const sectionText = lines.slice(section.lineStart, section.lineEnd + 1).join('\n');
    const match = findUnique(sectionText, selectedText);
    if (!match) return null;
    const from = lines.slice(0, section.lineStart).reduce((sum, line) => sum + line.length + 1, 0) + match.index;
    const to = from + match.length;
    return resolveSourceSelection(snapshot, from, to, scans);
}

export function readPreviewSection(element: HTMLElement): PreviewSection | null {
    const sourcePath = element.dataset.hinoteSourcePath;
    const lineStart = Number(element.dataset.hinoteLineStart);
    const lineEnd = Number(element.dataset.hinoteLineEnd);
    if (!sourcePath || !Number.isInteger(lineStart) || !Number.isInteger(lineEnd)) return null;
    return { sourcePath, lineStart, lineEnd };
}

import type { HighlightCandidate } from './types';

const MIN_LENGTH = 12;
const MAX_LENGTH = 500;
const SENTENCE_END = /[^。！？!?；;]+[。！？!?；;]+|[^。！？!?；;]+$/g;
const EXISTING_HIGHLIGHT = /==[^=\n](?:(?:[^=\n]|=[^=\n])*?[^=\n])?==/g;

interface Range { start: number; end: number }

/** Produces conservative, exact source ranges that can safely be wrapped in == markers. */
export class SmartHighlightCandidateExtractor {
    extract(content: string): HighlightCandidate[] {
        const protectedRanges = this.findProtectedRanges(content);
        const existing = [...content.matchAll(EXISTING_HIGHLIGHT)].map(match => ({
            start: match.index!, end: match.index! + match[0].length
        }));
        const candidates: HighlightCandidate[] = [];
        const lines = content.split('\n');
        const lineOffsets: number[] = [];
        let nextLineOffset = 0;
        for (const line of lines) { lineOffsets.push(nextLineOffset); nextLineOffset += line.length + 1; }
        let offset = 0;
        let heading = '';

        for (let line = 0; line < lines.length; line++) {
            const rawLine = lines[line];
            const lineStart = offset;
            offset += rawLine.length + 1;
            const headingMatch = rawLine.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
            if (headingMatch) { heading = this.toPlainText(headingMatch[1]); continue; }
            if (!rawLine.trim() || this.overlaps(lineStart, lineStart + rawLine.length, protectedRanges)) continue;
            if (/^\s*(?:>|\|)|^\s*[-*_]{3,}\s*$/.test(rawLine)) continue;

            const prefix = rawLine.match(/^\s*(?:[-+*]|\d+[.)])\s+/)?.[0] ?? rawLine.match(/^\s*/)?.[0] ?? '';
            const body = rawLine.slice(prefix.length).trimEnd();
            if (!body || /^\s*\|.*\|\s*$/.test(rawLine)) continue;
            const bodyStart = lineStart + prefix.length;
            const sentenceSpans = this.sentences(body);
            const spans = !this.hasMarkdownSyntax(body) && sentenceSpans.length > 1
                ? sentenceSpans
                : [{ text: body, index: 0 }];

            for (const span of spans) {
                const leading = span.text.length - span.text.trimStart().length;
                const text = span.text.trim();
                const start = bodyStart + span.index + leading;
                const end = start + text.length;
                if (!this.isSafe(text) || text.length < MIN_LENGTH || text.length > MAX_LENGTH) continue;
                if (this.overlaps(start, end, existing) || this.overlaps(start, end, protectedRanges)) continue;
                const plain = this.toPlainText(text);
                if (plain.length < MIN_LENGTH) continue;
                candidates.push({
                    id: `candidate-${candidates.length}`,
                    start, end, line, rawText: text, text: plain, sectionHeading: heading,
                    before: this.neighbor(lines, line - 1, lineOffsets, protectedRanges),
                    after: this.neighbor(lines, line + 1, lineOffsets, protectedRanges)
                });
            }
        }
        return candidates;
    }

    private sentences(value: string): Array<{ text: string; index: number }> {
        const result: Array<{ text: string; index: number }> = [];
        for (const match of value.matchAll(SENTENCE_END)) {
            if (match[0].trim()) result.push({ text: match[0], index: match.index! });
        }
        return result;
    }

    private findProtectedRanges(content: string): Range[] {
        const ranges: Range[] = [];
        const patterns = [
            /^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/g,
            /```[\s\S]*?```|~~~[\s\S]*?~~~/g,
            /\$\$[\s\S]*?\$\$/g
        ];
        for (const pattern of patterns) for (const match of content.matchAll(pattern)) {
            ranges.push({ start: match.index!, end: match.index! + match[0].length });
        }
        return ranges;
    }

    private overlaps(start: number, end: number, ranges: Range[]): boolean {
        return ranges.some(range => Math.max(start, range.start) < Math.min(end, range.end));
    }

    private neighbor(lines: string[], line: number, offsets: number[], protectedRanges: Range[]): string {
        if (line < 0 || line >= lines.length) return '';
        if (this.overlaps(offsets[line], offsets[line] + lines[line].length, protectedRanges)) return '';
        return this.toPlainText(lines[line]).slice(0, 240);
    }

    private hasMarkdownSyntax(text: string): boolean {
        return /[`<>[\]]|(?:^|\s)[*_~]{1,2}\S/.test(text);
    }

    private isSafe(text: string): boolean {
        if (text.includes('\n') || text.includes('==') || text.includes('`') || /^\s*#/.test(text)) return false;
        if (/\$[^$\n]+\$|<\/?[a-z][^>]*>/i.test(text)) return false;
        if ((text.match(/`/g)?.length ?? 0) % 2 !== 0) return false;
        for (const marker of ['**', '__', '~~']) {
            if ((text.split(marker).length - 1) % 2 !== 0) return false;
        }
        return true;
    }

    private toPlainText(value: string): string {
        return value
            .replace(/^\s*(?:[-+*]|\d+[.)]|>)\s+/, '')
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias || target)
            .replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
    }
}

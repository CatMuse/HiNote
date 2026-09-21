import { isFileComment, type HighlightInfo } from '../../types/highlight';
import type { RelatedDocumentProfile, RelatedHighlightResult } from './types';

const ENGLISH_STOP = new Set('the a an and or but of to in on for with is are was were be been this that it as at by from into about can could should would'.split(' '));
const CJK_STOP = new Set(['的', '了', '是', '在', '和', '与', '及', '或', '这', '那', '一个', '我们', '可以']);

export class RelatedHighlightRetriever {
    search(currentPath: string, currentContent: string, highlights: HighlightInfo[], limit = 40): RelatedHighlightResult[] {
        const candidates = highlights.filter(item => !isFileComment(item) && item.filePath &&
            item.filePath !== currentPath && item.text.trim().length > 0);
        if (!candidates.length) return [];
        const docs = candidates.map(item => this.termCounts(this.searchableText(item)));
        const documentFrequency = new Map<string, number>();
        for (const terms of docs) for (const term of terms.keys()) {
            documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
        }
        const query = this.queryWeights(currentPath, currentContent);
        const averageLength = docs.reduce((sum, terms) => sum + this.totalTerms(terms), 0) / docs.length || 1;
        const raw = candidates.map((highlight, index) => ({
            highlight,
            score: this.bm25(docs[index], query, documentFrequency, docs.length, averageLength)
        })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
        const maximum = raw[0]?.score || 1;
        const perFile = new Map<string, number>();
        const result: RelatedHighlightResult[] = [];
        for (const item of raw) {
            const path = item.highlight.filePath!;
            const seen = perFile.get(path) || 0;
            if (seen >= 3) continue;
            perFile.set(path, seen + 1);
            const localScore = item.score / maximum;
            result.push({
                highlight: item.highlight, localScore, relevanceScore: localScore,
                finalScore: localScore, aiRanked: false
            });
            if (result.length >= limit) break;
        }
        return result;
    }

    profile(path: string, content: string): RelatedDocumentProfile {
        const headings = [...content.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)]
            .map(match => match[1]).slice(0, 30);
        const plain = content.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '')
            .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
            .replace(/[#>*_`=()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
        return { title: path.split('/').pop()?.replace(/\.md$/i, '') || '', headings, excerpt: plain.slice(0, 4000) };
    }

    private queryWeights(path: string, content: string): Map<string, number> {
        const weights = new Map<string, number>();
        const add = (text: string, weight: number) => {
            for (const term of this.tokenize(text)) weights.set(term, Math.max(weights.get(term) || 0, weight));
        };
        add(path.split('/').pop()?.replace(/\.md$/i, '') || '', 3);
        for (const heading of content.match(/^\s{0,3}#{1,6}\s+(.+)$/gm) || []) add(heading.replace(/^\s*#+\s*/, ''), 2);
        add(content.slice(0, 30000), 1);
        return weights;
    }

    private searchableText(item: HighlightInfo): string {
        return [item.text.slice(0, 4000), item.fileName || item.filePath || '',
            ...(item.comments || []).map(comment => comment.content.slice(0, 2000))].join(' ');
    }

    private bm25(terms: Map<string, number>, query: Map<string, number>, df: Map<string, number>,
        count: number, averageLength: number): number {
        const length = this.totalTerms(terms), k1 = 1.2, b = 0.75;
        let score = 0;
        for (const [term, queryWeight] of query) {
            const tf = terms.get(term) || 0;
            if (!tf) continue;
            const idf = Math.log(1 + (count - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
            score += queryWeight * idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * length / averageLength));
        }
        return score;
    }

    private termCounts(text: string): Map<string, number> {
        const result = new Map<string, number>();
        for (const term of this.tokenize(text)) result.set(term, (result.get(term) || 0) + 1);
        return result;
    }
    private totalTerms(terms: Map<string, number>): number {
        let total = 0; terms.forEach(value => { total += value; }); return total;
    }
    private tokenize(text: string): string[] {
        const normalized = text.toLowerCase();
        const terms = (normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) || []).filter(term => !ENGLISH_STOP.has(term));
        for (const sequence of normalized.match(/[\u3400-\u9fff]+/g) || []) {
            if (sequence.length === 1) { if (!CJK_STOP.has(sequence)) terms.push(sequence); continue; }
            for (let index = 0; index < sequence.length - 1; index++) {
                const gram = sequence.slice(index, index + 2);
                if (!CJK_STOP.has(gram)) terms.push(gram);
            }
        }
        return terms;
    }
}

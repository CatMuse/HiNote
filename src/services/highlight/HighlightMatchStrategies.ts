import { getHighlightScan } from './HighlightScan';
import { isFileComment, type HighlightContent, type HighlightRecordKind } from '../../types/highlight';
import { getHighlightSource } from '../../models/HighlightModels';

import { parseHighlightColor } from './HighlightColor';

type HiNote = HighlightContent & { id?: string; kind?: HighlightRecordKind };

export type HighlightMatchConfidence = 'id' | 'block-text' | 'context' | 'unique-text';
export interface HighlightMatchResult<R extends HiNote = HiNote> { highlight: R; confidence: HighlightMatchConfidence; }
export interface HighlightMatchOptions { usedIds?: Set<string>; }

// Exact text is indexed. Expensive fuzzy work has a per-file budget; exceeding it
// leaves records unresolved rather than blocking typing or guessing an association.
const MAX_CONTEXT_CANDIDATES = 64;
const MAX_CONTEXT_COMPARISONS = 8192;
const TIE_MARGIN = 0.2;

function comparableText(value: HiNote, markdown: boolean): string {
    if (!markdown || value.syntax || isFileComment(value)) return value.text;
    return parseHighlightColor(value.text).text;
}

function indexBy<T extends HiNote>(records: T[], key: (record: T) => string): Map<string, T[]> {
    const index = new Map<string, T[]>();
    for (const record of records) {
        const value = key(record);
        const group = index.get(value);
        if (group) group.push(record); else index.set(value, [record]);
    }
    return index;
}

/** Resolve a complete file, reserving certain pairs before considering edits.
 * Source-derived IDs and proximity alone cannot identify repeated text.
 */
export function matchFileHighlights<T extends HiNote, R extends HiNote>(targets: T[], records: R[]): Map<T, HighlightMatchResult<R>> {
    const result = new Map<T, HighlightMatchResult<R>>();
    if (!targets.length || !records.length) return result;
    const stored = records.filter(record => !isFileComment(record));
    const current = targets.filter(record => !isFileComment(record));
    const byText = indexBy(stored, record => record.text);
    const markdownText = indexBy(stored, record => comparableText(record, true));
    const targetText = indexBy(current, record => record.text);
    const used = new Set<R>();
    const uniqueIds = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const record of stored) if (record.id) {
        if (uniqueIds.has(record.id)) duplicateIds.add(record.id);
        uniqueIds.add(record.id);
    }
    const assign = (target: T, record: R, confidence: HighlightMatchConfidence) => {
        result.set(target, { highlight: record, confidence });
        used.add(record);
    };
    const exactCandidates = (target: HiNote) =>
        (target.syntax === 'markdown' ? markdownText : byText).get(target.text) || [];

    // Count against the original sets, never a progressively shrinking pool.
    // Otherwise an unresolved duplicate could become falsely "unique".
    const claims = new Map<R, T[]>();
    for (const target of current) {
        const exact = exactCandidates(target);
        if (!target.text || exact.length !== 1 || targetText.get(target.text)!.length !== 1) continue;
        const record = exact[0];
        if (record.id && duplicateIds.has(record.id)) continue;
        const owners = claims.get(record) || [];
        owners.push(target);
        claims.set(record, owners);
    }
    for (const [record, owners] of claims) if (owners.length === 1) {
        const target = owners[0];
        assign(target, record, target.id === record.id ? 'id' : 'unique-text');
    }

    const byBlock = indexBy(stored, record => JSON.stringify([record.blockId || '', comparableText(record, true)]));
    const targetBlock = indexBy(current, record => JSON.stringify([record.blockId || '', record.text]));
    for (const target of current) {
        if (result.has(target) || !target.blockId) continue;
        const key = JSON.stringify([target.blockId, target.text]);
        const candidates = byBlock.get(key) || [];
        if (candidates.length !== 1 || targetBlock.get(key)?.length !== 1) continue;
        const record = candidates[0];
        if (used.has(record) || (record.id && duplicateIds.has(record.id))) continue;
        if (comparableText(record, target.syntax === 'markdown') !== target.text) continue;
        assign(target, record, 'block-text');
    }
    if (result.size === current.length) return result;

    // Common duplicate case: unchanged surrounding paragraphs. Resolve with
    // indexed two-sided anchors instead of repeatedly scoring the same group.
    const anchorKey = (record: HiNote, markdown: boolean) => JSON.stringify([
        comparableText(record, markdown), normalizeText(record.contextBefore || ''), normalizeText(record.contextAfter || '')
    ]);
    const exactAnchors = indexBy(stored, record => anchorKey(record, false));
    const markdownAnchors = indexBy(stored, record => anchorKey(record, true));
    const currentAnchors = indexBy(current, record => anchorKey(record, false));
    const anchorClaims = new Map<R, T[]>();
    for (const target of current) {
        if (result.has(target) || (!target.contextBefore && !target.contextAfter)) continue;
        const key = anchorKey(target, false);
        const candidates = (target.syntax === 'markdown' ? markdownAnchors : exactAnchors).get(key) || [];
        if (candidates.length !== 1 || currentAnchors.get(key)?.length !== 1) continue;
        const record = candidates[0];
        if (used.has(record) || (record.id && duplicateIds.has(record.id))) continue;
        const owners = anchorClaims.get(record) || [];
        owners.push(target);
        anchorClaims.set(record, owners);
    }
    for (const [record, owners] of anchorClaims) if (owners.length === 1) assign(owners[0], record, 'context');
    if (result.size === current.length) return result;

    // Index exact anchors to avoid scanning the file for every duplicate.
    const before = indexBy(stored, record => normalizeText(record.contextBefore || ''));
    const after = indexBy(stored, record => normalizeText(record.contextAfter || ''));
    const proposals = new Map<T, { record: R; score: number }>();
    const reverse = new Map<R, { target: T; score: number; second: number }>();
    let comparisons = 0;
    for (const target of current) {
        if (result.has(target)) continue;
        const exact = exactCandidates(target);
        let pool = exact.length ? exact : stored;
        if (pool.length > MAX_CONTEXT_CANDIDATES) {
            const a = before.get(normalizeText(target.contextBefore || '')) || [];
            const b = after.get(normalizeText(target.contextAfter || '')) || [];
            // A large ambiguous group is deliberately left unresolved. Do not
            // truncate candidates, which could hide a tied competitor.
            if (a.length + b.length > MAX_CONTEXT_CANDIDATES) continue;
            pool = [...new Set([...a, ...b])];
        }
        // Do not accept partial proposals if a competing occurrence was not
        // evaluated. Keep only the indexed certain matches when over budget.
        if (comparisons + pool.length > MAX_CONTEXT_COMPARISONS) return result;
        comparisons += pool.length;
        let best: R | undefined;
        let bestScore = 0;
        let secondScore = 0;
        for (const record of pool) {
            if (used.has(record) || (record.id && duplicateIds.has(record.id))) continue;
            const score = contextScore(target, record);
            if (score > 0) {
                const previous = reverse.get(record);
                if (!previous || score > previous.score) reverse.set(record, { target, score, second: previous?.score || 0 });
                else previous.second = Math.max(previous.second, score);
            }
            if (score > bestScore) { secondScore = bestScore; bestScore = score; best = record; }
            else secondScore = Math.max(secondScore, score);
        }
        if (!best || bestScore - secondScore < TIE_MARGIN) continue;
        proposals.set(target, { record: best, score: bestScore });
    }
    // Both directions must agree, including competitors whose own best match
    // was ambiguous. This avoids making certainty depend on traversal order.
    for (const [target, { record }] of proposals) {
        const owner = reverse.get(record)!;
        if (owner.target !== target || owner.score - owner.second < TIE_MARGIN) continue;
        assign(target, record, 'context');
    }
    return result;
}

export function findStoredHighlightMatch<R extends HiNote>(
    target: HiNote, candidates: R[], options: HighlightMatchOptions = {}
): HighlightMatchResult<R> | null {
    if (isFileComment(target)) {
        const record = candidates.find(candidate => isFileComment(candidate) && target.id && candidate.id === target.id);
        return record && !options.usedIds?.has(record.id!) ? { highlight: record, confidence: 'id' } : null;
    }
    const source = getHighlightSource(target) || target;
    const match = matchFileHighlights<HiNote, R>(getHighlightScan(target)?.highlights || [source], candidates).get(source);
    return match && !options.usedIds?.has(match.highlight.id!) ? match : null;
}

function contextScore(target: HiNote, record: HiNote): number {
    const text = comparableText(record, target.syntax === 'markdown');
    const candidate = text === record.text ? record : { ...record, text, textFingerprint: text };
    const before = getAnchorScore(target.contextBefore, candidate.contextBefore);
    const after = getAnchorScore(target.contextAfter, candidate.contextAfter);
    const similarity = getTextSimilarityScore(target, candidate);
    // At a file edge one anchor may be empty on both sides; the other must
    // match exactly. Position and generated IDs never break a duplicate tie.
    const edge = (!target.contextBefore && !candidate.contextBefore && after === 0.65) ||
        (!target.contextAfter && !candidate.contextAfter && before === 0.65);
    if (similarity < 0.3 || (!edge && (before < 0.35 || after < 0.35))) return 0;
    return before + after + similarity +
        (target.blockId && target.blockId === candidate.blockId ? 0.75 : 0);
}

function getAnchorScore(a?: string, b?: string): number {
    if (!a || !b) return 0;

    const normalizedA = normalizeText(a);
    const normalizedB = normalizeText(b);
    if (!normalizedA || !normalizedB) return 0;

    if (normalizedA === normalizedB) return 0.65;
    if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 0.45;

    const similarity = getDiceSimilarity(normalizedA, normalizedB);
    return similarity >= 0.72 ? 0.35 : 0;
}

function getTextSimilarityScore(target: HiNote, candidate: HiNote): number {
    if (target.text === candidate.text) return 0.5;

    const targetText = normalizeText((target.textFingerprint || target.text).slice(0, 512));
    const candidateText = normalizeText((candidate.textFingerprint || candidate.text).slice(0, 512));
    const similarity = getDiceSimilarity(targetText, candidateText);

    if (similarity >= 0.85) return 0.45;
    if (similarity >= 0.65) return 0.3;
    if (similarity >= 0.45) return 0.15;
    return 0;
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getDiceSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const aTokens = getBigrams(a);
    const bTokens = getBigrams(b);
    if (aTokens.length === 0 || bTokens.length === 0) {
        return a === b ? 1 : 0;
    }

    const counts = new Map<string, number>();
    for (const token of aTokens) {
        counts.set(token, (counts.get(token) || 0) + 1);
    }

    let overlap = 0;
    for (const token of bTokens) {
        const count = counts.get(token) || 0;
        if (count > 0) {
            overlap++;
            counts.set(token, count - 1);
        }
    }

    return (2 * overlap) / (aTokens.length + bTokens.length);
}

function getBigrams(value: string): string[] {
    const compact = value.replace(/\s+/g, '');
    if (compact.length < 2) return compact ? [compact] : [];

    const bigrams: string[] = [];
    for (let i = 0; i < compact.length - 1; i++) {
        bigrams.push(compact.slice(i, i + 2));
    }

    return bigrams;
}

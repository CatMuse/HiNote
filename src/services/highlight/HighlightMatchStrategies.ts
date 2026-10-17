import type { HighlightInfo } from '../../types/highlight';
import type { HighlightInfo as HiNote } from '../../types/highlight';
import { parseHighlightColor } from './HighlightColor';

export type HighlightMatchConfidence =
    | 'id'
    | 'block-text'
    | 'text-position'
    | 'context'
    | 'unique-text';

export interface HighlightMatchResult {
    highlight: HiNote;
    confidence: HighlightMatchConfidence;
}

export interface HighlightMatchOptions {
    usedIds?: Set<string>;
}

const TEXT_POSITION_THRESHOLD = 500;
const CONTEXT_POSITION_THRESHOLD = 1200;
const CONTEXT_SCORE_THRESHOLD = 1.35;
const CONTEXT_TIE_MARGIN = 0.2;

export function findStoredHighlightMatch(
    target: HiNote,
    candidates: HiNote[],
    options: HighlightMatchOptions = {}
): HighlightMatchResult | null {
    // Older records stored the leading color emoji as text. Normalize only legacy
    // candidates for a confirmed Markdown target, never virtual or normalized records.
    const comparable = candidates.map(candidate => {
        if (target.syntax !== 'markdown' || candidate.syntax || candidate.isVirtual ||
            candidate.text === target.text) return candidate;
        const parsed = parseHighlightColor(candidate.text);
        return parsed.color ? { ...candidate, text: parsed.text, textFingerprint: parsed.text } : candidate;
    });
    const match = findComparableMatch(target, comparable, options);
    return match ? { ...match, highlight: candidates[comparable.indexOf(match.highlight)] } : null;
}

function findComparableMatch(
    target: HiNote,
    candidates: HiNote[],
    options: HighlightMatchOptions = {}
): HighlightMatchResult | null {
    const availableCandidates = filterAvailableCandidates(candidates, options.usedIds);
    if (availableCandidates.length === 0) return null;

    const idMatch = findIdMatch(target, availableCandidates);
    if (idMatch) return { highlight: idMatch, confidence: 'id' };

    const blockTextMatch = findBlockTextMatch(target, availableCandidates);
    if (blockTextMatch) return { highlight: blockTextMatch, confidence: 'block-text' };

    const textPositionMatch = findTextPositionMatch(target, availableCandidates);
    if (textPositionMatch) return { highlight: textPositionMatch, confidence: 'text-position' };

    const contextMatch = findContextMatch(target, availableCandidates);
    if (contextMatch) return { highlight: contextMatch, confidence: 'context' };

    const uniqueTextMatch = findUniqueTextMatch(target, availableCandidates);
    if (uniqueTextMatch) return { highlight: uniqueTextMatch, confidence: 'unique-text' };

    return null;
}

export function canUpdateStoredHighlight(confidence: HighlightMatchConfidence): boolean {
    return confidence === 'id' ||
        confidence === 'block-text' ||
        confidence === 'text-position' ||
        confidence === 'context';
}

function filterAvailableCandidates(candidates: HiNote[], usedIds?: Set<string>): HiNote[] {
    if (!usedIds) return candidates;
    return candidates.filter(candidate => !candidate.id || !usedIds.has(candidate.id));
}

function findIdMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
    if (!target.id) return null;
    return candidates.find(candidate => candidate.id === target.id) || null;
}

function findBlockTextMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
    if (!target.blockId) return null;

    const blockCandidates = candidates.filter(candidate => candidate.blockId === target.blockId);
    if (blockCandidates.length === 0) return null;

    const exactText = blockCandidates.find(candidate => candidate.text === target.text);
    if (exactText) return exactText;

    if (blockCandidates.length === 1 && getContextScore(target, blockCandidates[0]) >= CONTEXT_SCORE_THRESHOLD) {
        return blockCandidates[0];
    }

    return null;
}

function findTextPositionMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
    if (!target.text || typeof target.position !== 'number') return null;

    const sortedCandidates = candidates
        .filter(candidate =>
            candidate.text === target.text &&
            typeof candidate.position === 'number'
        )
        .sort((a, b) =>
            Math.abs(a.position - target.position) -
            Math.abs(b.position - target.position)
        );

    const best = sortedCandidates[0];
    if (!best || typeof best.position !== 'number') return null;

    return Math.abs(best.position - target.position) < TEXT_POSITION_THRESHOLD
        ? best
        : null;
}

function findContextMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
    const scored = candidates
        .map(candidate => ({
            candidate,
            score: getContextScore(target, candidate)
        }))
        .filter(item => item.score >= CONTEXT_SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;
    if (scored.length > 1 && scored[0].score - scored[1].score < CONTEXT_TIE_MARGIN) {
        return null;
    }

    const best = scored[0].candidate;
    if (!hasPositionNear(target, best, CONTEXT_POSITION_THRESHOLD) &&
        !hasStrongTwoSidedContext(target, best)) {
        return null;
    }

    return best;
}

function findUniqueTextMatch(target: HiNote, candidates: HiNote[]): HiNote | null {
    if (!target.text) return null;

    const textMatches = candidates.filter(candidate => candidate.text === target.text);
    return textMatches.length === 1 ? textMatches[0] : null;
}

function getContextScore(target: HiNote, candidate: HiNote): number {
    let score = 0;

    if (target.blockId && candidate.blockId && target.blockId === candidate.blockId) {
        score += 0.75;
    }

    if (hasPositionNear(target, candidate, CONTEXT_POSITION_THRESHOLD)) {
        score += 0.25;
    }

    score += getAnchorScore(target.contextBefore, candidate.contextBefore);
    score += getAnchorScore(target.contextAfter, candidate.contextAfter);
    score += getTextSimilarityScore(target, candidate);

    return score;
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

    const targetText = normalizeText(target.textFingerprint || target.text);
    const candidateText = normalizeText(candidate.textFingerprint || candidate.text);
    const similarity = getDiceSimilarity(targetText, candidateText);

    if (similarity >= 0.85) return 0.45;
    if (similarity >= 0.65) return 0.3;
    if (similarity >= 0.45) return 0.15;
    return 0;
}

function hasStrongTwoSidedContext(target: HiNote, candidate: HiNote): boolean {
    return getAnchorScore(target.contextBefore, candidate.contextBefore) >= 0.35 &&
        getAnchorScore(target.contextAfter, candidate.contextAfter) >= 0.35;
}

function hasPositionNear(a: HighlightInfo, b: HighlightInfo, threshold: number): boolean {
    return typeof a.position === 'number' &&
        typeof b.position === 'number' &&
        Math.abs(a.position - b.position) < threshold;
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

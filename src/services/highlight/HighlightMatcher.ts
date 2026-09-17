import type { TFile } from 'obsidian';
import type { HighlightInfo, HighlightRecord, ScannedHighlight } from '../../types/highlight';
import type { HighlightRepository } from '../../repositories/HighlightRepository';
import { findStoredHighlightMatch, matchFileHighlights } from './HighlightMatchStrategies';
import { getHighlightScan } from './HighlightScan';
import { recordToHighlightView, scanToHighlightView } from '../../models/HighlightModels';
import { getHighlightAnchor, sameHighlightAnchor, type HighlightAnchorPatch } from '../../repositories/HighlightAnchorPatch';

/** Joins source occurrences with saved records, then projects UI-only data. */
export class HighlightMatcher {
    constructor(private getHighlightRepository?: () => HighlightRepository | undefined) {}

    static findMatch(target: HighlightInfo, candidates: HighlightRecord[]): HighlightRecord | null {
        return findStoredHighlightMatch(target, candidates)?.highlight || null;
    }

    static findExactMatch(target: HighlightInfo, candidates: HighlightRecord[]): HighlightRecord | null {
        return this.findMatch(target, candidates);
    }

    findMatchingHighlight(file: TFile, highlight: HighlightInfo, repository: HighlightRepository): HighlightRecord | null {
        return HighlightMatcher.findMatch(highlight, repository.getCachedHighlights(file.path) || []);
    }

    mergeHighlightsWithComments(
        highlights: ScannedHighlight[], stored: HighlightRecord[], file: TFile
    ): HighlightInfo[] {
        const scan = getHighlightScan(highlights[0]);
        const matches = matchFileHighlights(scan?.highlights || highlights, stored);
        const patches: HighlightAnchorPatch[] = [];
        const views = highlights.map(highlight => {
            const record = matches.get(highlight)?.highlight;
            if (record) {
                const expected = getHighlightAnchor(record);
                const anchor = getHighlightAnchor({
                    ...highlight,
                    blockId: highlight.blockId ?? record.blockId,
                    paragraphOffset: highlight.paragraphOffset ?? record.paragraphOffset
                });
                if (!sameHighlightAnchor(expected, anchor)) patches.push({ id: record.id, expected, anchor });
            }
            return scanToHighlightView(highlight, record);
        });
        const fileComments = stored
            .filter(record => record.kind === 'file-comment' && record.comments.length > 0)
            .map(recordToHighlightView);
        if (patches.length && scan) {
            void this.getHighlightRepository?.()?.patchHighlightAnchors(file.path, patches, scan.isCurrent)
                .catch(error => console.error('[HiNote] Could not update highlight anchors:', error));
        }
        return [...fileComments, ...views];
    }
}

import type { TFile } from 'obsidian';
import type { HighlightInfo, HighlightRecord, ScannedHighlight, CommentItem } from '../../types/highlight';
import type { HighlightRepository } from '../../repositories/HighlightRepository';
import { findStoredHighlightMatch, matchFileHighlights } from './HighlightMatchStrategies';
import { getHighlightScan } from './HighlightScan';
import { scanToHighlightView } from '../../models/HighlightModels';

interface CommentResolverOptions {
    onTextChanged?: (stored: HighlightRecord, current: HighlightInfo) => void;
}

/** Read-only UI projection shared by editor and reading mode. */
export class HighlightCommentResolver {
    constructor(private highlightRepository: HighlightRepository) {}

    resolveHighlights(file: TFile, highlights: ScannedHighlight[], options: CommentResolverOptions = {}): HighlightInfo[] {
        const stored = this.highlightRepository.getCachedHighlights(file.path) || [];
        const matches = matchFileHighlights(getHighlightScan(highlights[0])?.highlights || highlights, stored);
        return highlights.map(highlight => {
            const record = matches.get(highlight)?.highlight;
            const view = scanToHighlightView(highlight, record);
            if (record && record.text !== highlight.text) options.onTextChanged?.(record, view);
            return view;
        });
    }

    resolveHighlight(file: TFile, highlight: ScannedHighlight): HighlightInfo {
        return this.resolveHighlights(file, [highlight])[0];
    }

    getCommentsForHighlight(file: TFile, highlight: HighlightInfo, options: CommentResolverOptions = {}): CommentItem[] {
        const stored = this.highlightRepository.getCachedHighlights(file.path) || [];
        const record = findStoredHighlightMatch(highlight, stored)?.highlight;
        if (record && record.text !== highlight.text) options.onTextChanged?.(record, highlight);
        return (record?.comments || []).map(comment => ({ ...comment }));
    }
}

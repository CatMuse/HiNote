import { getHighlightSource } from '../../models/HighlightModels';
import type { TFile } from 'obsidian';
import type { HighlightInfo, ScannedHighlight } from '../../types/highlight';

interface HighlightScan {
    highlights: ScannedHighlight[];
    sourceContent?: string;
    isCurrent: () => boolean;
}
const scans = new WeakMap<ScannedHighlight, HighlightScan>();
const latest = new WeakMap<TFile, HighlightScan>();

/** In-memory provenance only; no source text or new fields are persisted. */
export function rememberHighlightScan(
    file: TFile, highlights: ScannedHighlight[], settingsUnchanged: () => boolean, sourceContent?: string
): void {
    const path = file.path;
    const mtime = file.stat?.mtime;
    const size = file.stat?.size;
    const scan: HighlightScan = {
        highlights, sourceContent,
        isCurrent: () => latest.get(file) === scan && file.path === path &&
            file.stat?.mtime === mtime && file.stat?.size === size && settingsUnchanged()
    };
    latest.set(file, scan);
    for (const highlight of highlights) scans.set(highlight, scan);
}

export function getHighlightScan(highlight?: HighlightInfo | ScannedHighlight): HighlightScan | undefined {
    const source = highlight && getHighlightSource(highlight);
    return source ? scans.get(source) : undefined;
}

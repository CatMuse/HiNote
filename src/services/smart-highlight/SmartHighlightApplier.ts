import type { Editor } from 'obsidian';
import { HIGHLIGHT_COLOR_CHOICES } from '../highlight/HighlightColorEdit';
import type { SmartHighlightApplyOptions } from './types';

export class SmartHighlightApplier {
    apply(editor: Editor, options: SmartHighlightApplyOptions): number {
        if (editor.getValue() !== options.snapshot) {
            throw new Error('The document changed after analysis. Run smart highlight again.');
        }
        const selected = options.evaluations.filter(item => item.selected)
            .sort((a, b) => a.candidate.start - b.candidate.start);
        for (let index = 0; index < selected.length; index++) {
            const candidate = selected[index].candidate;
            if (options.snapshot.slice(candidate.start, candidate.end) !== candidate.rawText) {
                throw new Error('A suggested highlight no longer matches the document.');
            }
            if (index && selected[index - 1].candidate.end > candidate.start) {
                throw new Error('Suggested highlights overlap.');
            }
        }
        const marker = options.color
            ? HIGHLIGHT_COLOR_CHOICES.find(choice => choice.color === options.color)?.marker || '' : '';
        editor.transaction({ changes: selected.map(item => ({
            from: editor.offsetToPos(item.candidate.start),
            to: editor.offsetToPos(item.candidate.end),
            text: `==${marker}${item.candidate.rawText}==`
        })) }, 'hinote-smart-highlight');
        return selected.length;
    }
}

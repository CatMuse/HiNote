import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView } from '@codemirror/view';

export interface NavigationRange { from: number; to: number; }
export const navigationFlashEffect = StateEffect.define<NavigationRange | null>();

/** Presentation only: no document changes or editor selection transactions. */
export const navigationFlashField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(decorations, transaction) {
        // Typing or moving the caret ends the navigation hint immediately.
        if (transaction.docChanged || transaction.selection) decorations = Decoration.none;
        for (const effect of transaction.effects) {
            if (!effect.is(navigationFlashEffect)) continue;
            const range = effect.value;
            decorations = range && range.from >= 0 && range.to <= transaction.newDoc.length && range.from < range.to
                ? Decoration.set([Decoration.mark({ class: 'hinote-navigation-flash' }).range(range.from, range.to)])
                : Decoration.none;
        }
        return decorations;
    },
    provide: field => EditorView.decorations.from(field)
});

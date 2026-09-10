import { Platform } from "obsidian";

export interface CommentInputKeyboardOptions {
    onInlineAI: () => Promise<void>;
    onSave: () => Promise<void>;
}

/** Ignore an Enter arriving this soon after compositionend (IME commit echo). */
const COMPOSITION_GUARD_MS = 100;

export function setupCommentInputKeyboard(
    textarea: HTMLTextAreaElement,
    options: CommentInputKeyboardOptions
): void {
    let composing = false;
    let compositionEndedAt = 0;

    textarea.addEventListener('compositionstart', () => {
        composing = true;
    });
    textarea.addEventListener('compositionend', () => {
        composing = false;
        compositionEndedAt = Date.now();
    });

    textarea.onkeydown = async (event: KeyboardEvent) => {
        if (composing || event.isComposing) return;

        if (event.key === 'Tab') {
            event.preventDefault();
            await options.onInlineAI();
            return;
        }

        if (event.key !== 'Enter') {
            return;
        }

        // Do not treat the Enter that confirms an IME conversion as "save".
        // With CJK input (Japanese/Chinese/Korean), Enter is used to commit the
        // candidate, so without this guard the comment is saved and the textarea
        // closes in the middle of typing a word.
        // Some environments dispatch keydown right after
        // compositionend with isComposing already false - hence the extra flag.
        if (composing || event.isComposing) {
            return;
        }

        if (Date.now() - compositionEndedAt < COMPOSITION_GUARD_MS) {
            return;
        }

        if (Platform.isMobile || event.shiftKey) {
            return;
        }

        event.preventDefault();
        await options.onSave();
    };
}

export function autoResizeCommentTextarea(textarea: HTMLTextAreaElement | undefined): void {
    if (!textarea) return;

    window.requestAnimationFrame(() => {
        if (!textarea) return;

        const scrollTop = window.scrollY || activeDocument.documentElement.scrollTop;

        textarea.setCssProps({ height: 'auto' });
        textarea.setCssProps({ height: `${textarea.scrollHeight}px` });

        window.scrollTo(0, scrollTop);
    });
}

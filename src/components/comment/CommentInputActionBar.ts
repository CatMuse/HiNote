import { Platform } from "obsidian";
import { t } from "../../i18n";

interface CommentInputActionBarOptions {
    onSave: () => Promise<void>;
    onDelete?: () => Promise<void>;
    saveHintText?: string;
}

export class CommentInputActionBar {
    constructor(
        private container: HTMLElement,
        private options: CommentInputActionBarOptions
    ) {}

    render(): HTMLElement {
        const actionHint = this.container.createDiv({
            cls: "hi-note-actions-hint"
        });

        actionHint.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        this.renderSaveHint(actionHint);
        this.renderDeleteAction(actionHint);

        return actionHint;
    }

    private renderSaveHint(actionHint: HTMLElement): void {
        if (!Platform.isMobile) {
            actionHint.createSpan({
                cls: "hi-note-hint",
                text: this.options.saveHintText || t("Tab AI, Shift + Enter Wrap, Enter Save")
            });
            return;
        }

        const saveButton = actionHint.createEl("button", {
            cls: "hi-note-save-button",
            text: t("Submit")
        });

        saveButton.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.options.onSave();
        });
    }

    private renderDeleteAction(actionHint: HTMLElement): void {
        if (!this.options.onDelete) return;

        const deleteLink = actionHint.createDiv({
            cls: "hi-note-delete-link",
            text: t("Delete comment")
        });

        deleteLink.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.options.onDelete?.();
        });
    }
}

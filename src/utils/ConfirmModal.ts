import { App, Modal } from "obsidian";
import { t } from "../i18n";

interface ConfirmModalOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}

export function showConfirmModal(app: App, options: ConfirmModalOptions): Promise<boolean> {
    return new Promise(resolve => {
        const modal = new ConfirmModal(app, options, resolve);
        modal.open();
    });
}

class ConfirmModal extends Modal {
    constructor(
        app: App,
        private options: ConfirmModalOptions,
        private resolve: (confirmed: boolean) => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.titleEl.setText(this.options.title);

        contentEl.createEl("p", { text: this.options.message });

        const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
        const cancelButton = buttonContainer.createEl("button", {
            text: this.options.cancelText ?? t("Cancel")
        });
        const confirmButton = buttonContainer.createEl("button", {
            cls: "mod-warning",
            text: this.options.confirmText ?? t("Delete")
        });

        cancelButton.addEventListener("click", () => {
            this.resolve(false);
            this.close();
        });
        confirmButton.addEventListener("click", () => {
            this.resolve(true);
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

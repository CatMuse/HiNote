import { Menu, Modal, Notice } from "obsidian";
import { HighlightCard, defaultHighlightCardRegistry } from "../../components/highlight";
import CommentPlugin from "../../../main";
import { LicenseManager } from "../../services/LicenseManager";
import { HighlightInfo } from "../../types/highlight";
import { t } from "../../i18n";

interface BatchFlashcardOperationsOptions {
    plugin: CommentPlugin;
    licenseManager: LicenseManager;
    getSelectedHighlights: () => Set<HighlightInfo>;
    clearSelection: () => void;
    refreshView: () => Promise<void>;
}

export class BatchFlashcardOperations {
    constructor(private options: BatchFlashcardOperationsOptions) {}

    async createMissingFlashcards(): Promise<void> {
        const isActivated = await this.options.licenseManager.isActivated();
        const isFeatureEnabled = isActivated
            ? await this.options.licenseManager.isFeatureEnabled("flashcard")
            : false;

        if (!isActivated || !isFeatureEnabled) {
            new Notice(t("Only HiNote Pro"));
            return;
        }

        const fsrsManager = this.options.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t("HiCard function is not initialized, please enable FSRS function"));
            return;
        }

        const selectedHighlights = this.options.getSelectedHighlights();
        let successCount = 0;
        let failCount = 0;

        for (const highlight of selectedHighlights) {
            try {
                if (!highlight.id) continue;

                const existingCards = fsrsManager.findCardsBySourceId(highlight.id, "highlight");
                if (existingCards && existingCards.length > 0) continue;

                const result = await this.withHighlightCard(highlight, (card) => card.createHiCardForHighlight(true));
                if (result) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
                console.error("Create HiCard failed:", error);
            }
        }

        if (successCount > 0) {
            this.options.plugin.eventManager.emitFlashcardChanged();
        }

        this.showResultNotice(successCount, failCount, "create");
        this.options.clearSelection();
        await this.options.refreshView();
    }

    confirmDeleteFlashcards(): void {
        const modal = new Modal(this.options.plugin.app);
        modal.titleEl.setText(t("Confirm delete HiCard"));

        modal.contentEl.createEl("p", {
            text: t("Are you sure you want to delete the HiCards of the selected highlights? This action cannot be undone.")
        });

        const buttonContainer = modal.contentEl.createEl("div", {
            cls: "modal-button-container"
        });

        buttonContainer.createEl("button", { text: t("Cancel") })
            .addEventListener("click", () => modal.close());

        const confirmButton = buttonContainer.createEl("button", {
            cls: "mod-warning",
            text: t("Delete")
        });
        confirmButton.addEventListener("click", () => {
            modal.close();
            void this.deleteExistingFlashcards();
        });

        modal.open();
    }

    showManageMenu(event: MouseEvent): void {
        const menu = new Menu();

        menu.addItem((item) => {
            item.setTitle(t("Create missing HiCard"))
                .setIcon("plus-circle")
                .onClick(async () => {
                    await this.createMissingFlashcards();
                });
        });

        menu.addItem((item) => {
            item.setTitle(t("Delete existing HiCards"))
                .setIcon("trash")
                .onClick(() => {
                    this.confirmDeleteFlashcards();
                });
        });

        const targetElement = event.currentTarget as HTMLElement;
        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left - 85, y: rect.top - 60 });
        } else {
            menu.showAtMouseEvent(event);
        }
    }

    private async deleteExistingFlashcards(): Promise<void> {
        const fsrsManager = this.options.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t("HiCard function is not initialized, please enable FSRS function"));
            return;
        }

        const selectedHighlights = this.options.getSelectedHighlights();
        let successCount = 0;
        let failCount = 0;

        for (const highlight of selectedHighlights) {
            try {
                if (!highlight.id) continue;

                const existingCards = fsrsManager.findCardsBySourceId(highlight.id, "highlight");
                if (!existingCards || existingCards.length === 0) continue;

                const result = await this.withHighlightCard(highlight, (card) => card.deleteHiCardForHighlight(true));
                if (result) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                failCount++;
                console.error("Failed to delete HiCard:", error);
            }
        }

        if (successCount > 0) {
            this.options.plugin.eventManager.emitFlashcardChanged();
        }

        this.showResultNotice(successCount, failCount, "delete");
        this.options.clearSelection();
        await this.options.refreshView();
    }

    private async withHighlightCard(
        highlight: HighlightInfo,
        action: (card: HighlightCard) => Promise<boolean>
    ): Promise<boolean> {
        if (!highlight.id) return false;

        const existingCard = defaultHighlightCardRegistry.findByHighlightId(highlight.id);
        if (existingCard) {
            return await action(existingCard);
        }

        const tempContainer = createEl("div");
        const tempCard = new HighlightCard(
            tempContainer,
            highlight,
            this.options.plugin,
            {
                onHighlightClick: async () => {},
                onCommentAdd: () => {},
                onExport: () => {},
                onCommentEdit: () => {},
                onAIResponse: async () => {}
            },
            false,
            undefined,
            undefined,
            defaultHighlightCardRegistry
        );

        try {
            return await action(tempCard);
        } finally {
            tempCard.destroy();
        }
    }

    private showResultNotice(successCount: number, failCount: number, operation: "create" | "delete"): void {
        const action = operation === "create" ? "created" : "deleted";

        if (successCount > 0 && failCount === 0) {
            new Notice(t(`Successfully ${action} ${successCount} HiCard`));
        } else if (successCount > 0 && failCount > 0) {
            new Notice(t(`Successfully ${action} ${successCount} HiCard, ${failCount} failed`));
        } else if (successCount === 0 && failCount === 0) {
            new Notice(t(`No HiCard to ${operation}`));
        } else {
            new Notice(t(`Failed to ${operation} HiCard! Please check the selected highlight content`));
        }
    }
}

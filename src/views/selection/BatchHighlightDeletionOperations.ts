import { Modal, Notice, TFile } from "obsidian";
import { defaultHighlightCardRegistry } from "../../components/highlight";
import CommentPlugin from "../../../main";
import { HighlightService } from "../../services/HighlightService";
import { HighlightInfo } from "../../types/highlight";
import { t } from "../../i18n";

interface BatchHighlightDeletionOptions {
    plugin: CommentPlugin;
    highlightService: HighlightService;
    getSelectedHighlights: () => Set<HighlightInfo>;
    clearSelection: () => void;
}

export class BatchHighlightDeletionOperations {
    constructor(private options: BatchHighlightDeletionOptions) {}

    confirmDeleteSelectedHighlights(): void {
        const selectedHighlights = this.options.getSelectedHighlights();

        if (selectedHighlights.size === 0) {
            new Notice(t("No highlights selected"));
            return;
        }

        const modal = new Modal(this.options.plugin.app);
        modal.titleEl.setText(t("Confirm delete highlights"));

        modal.contentEl.createEl("p", {
            text: t(`Are you sure you want to delete ${selectedHighlights.size} highlights and all their data, including Comments and HiCards? This action cannot be undone.`)
        });

        const buttonContainer = modal.contentEl.createDiv({
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
            void this.performDeleteSelectedHighlights();
        });

        modal.open();
    }

    private async performDeleteSelectedHighlights(): Promise<void> {
        const selectedHighlights = this.options.getSelectedHighlights();

        if (selectedHighlights.size === 0) {
            new Notice(t("No highlights selected"));
            return;
        }

        const highlightsArray = Array.from(selectedHighlights);
        let fileMarkSuccess = 0;
        let fileMarkFailed = 0;
        let dataDeleteFailed = 0;

        try {
            this.deleteRelatedFlashcards(highlightsArray);

            const result = await this.removeHighlightMarks(highlightsArray);
            fileMarkSuccess = result.success;
            fileMarkFailed = result.failed;

            dataDeleteFailed = await this.removeHighlightData(highlightsArray);
            this.cleanupRenderedCards(highlightsArray);
            this.emitDeleteEvents(highlightsArray, fileMarkSuccess);
        } catch (error) {
            console.error("[BatchDelete] 批量删除过程出错:", error);
            fileMarkFailed = highlightsArray.length;
        }

        this.options.clearSelection();
        this.showDeleteResult(fileMarkSuccess, fileMarkFailed, dataDeleteFailed);
    }

    private deleteRelatedFlashcards(highlights: HighlightInfo[]): void {
        const fsrsManager = this.options.plugin.fsrsManager;
        if (!fsrsManager) return;

        for (const highlight of highlights) {
            if (!highlight.id) continue;

            try {
                fsrsManager.deleteCardsBySourceId(highlight.id, "highlight");
            } catch (error) {
                console.error("[BatchDelete] 删除闪卡失败:", highlight.id, error);
            }
        }
    }

    private async removeHighlightMarks(highlights: HighlightInfo[]): Promise<{ success: number; failed: number }> {
        const highlightsToRemove = highlights
            .filter(h => h.filePath && h.text)
            .map(h => ({
                text: h.text,
                position: h.position,
                filePath: h.filePath!,
                originalLength: h.originalLength
            }));

        if (highlightsToRemove.length === 0) {
            return { success: 0, failed: 0 };
        }

        return await this.options.highlightService.batchRemoveHighlightMarks(highlightsToRemove);
    }

    private async removeHighlightData(highlights: HighlightInfo[]): Promise<number> {
        const highlightManager = this.options.plugin.highlightManager;
        if (!highlightManager) return 0;

        let dataDeleteFailed = 0;
        const highlightsByFile = new Map<string, HighlightInfo[]>();

        for (const highlight of highlights) {
            if (!highlight.filePath || !highlight.id) continue;

            if (!highlightsByFile.has(highlight.filePath)) {
                highlightsByFile.set(highlight.filePath, []);
            }
            highlightsByFile.get(highlight.filePath)!.push(highlight);
        }

        for (const [filePath, fileHighlights] of highlightsByFile) {
            try {
                const file = this.options.plugin.app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile)) continue;

                for (const highlight of fileHighlights) {
                    try {
                        await highlightManager.removeHighlight(file, highlight);
                    } catch (error) {
                        console.error("[BatchDelete] 从 HighlightManager 删除失败:", highlight.id, error);
                        dataDeleteFailed++;
                    }
                }
            } catch (error) {
                console.error("[BatchDelete] 处理文件失败:", filePath, error);
                dataDeleteFailed += fileHighlights.length;
            }
        }

        return dataDeleteFailed;
    }

    private cleanupRenderedCards(highlights: HighlightInfo[]): void {
        for (const highlight of highlights) {
            if (!highlight.id) continue;

            try {
                const highlightCard = defaultHighlightCardRegistry.findByHighlightId(highlight.id);
                if (!highlightCard) continue;

                const cardElement = highlightCard.getElement();
                if (cardElement) {
                    cardElement.remove();
                }
                highlightCard.destroy();
            } catch (error) {
                console.error("[BatchDelete] 清理卡片实例失败:", highlight.id, error);
            }
        }
    }

    private emitDeleteEvents(highlights: HighlightInfo[], fileMarkSuccess: number): void {
        if (fileMarkSuccess <= 0) return;

        for (const highlight of highlights) {
            if (!highlight.filePath || !highlight.id) continue;

            this.options.plugin.eventManager.emitHighlightDelete(
                highlight.filePath,
                highlight.text || "",
                highlight.id
            );
        }
    }

    private showDeleteResult(fileMarkSuccess: number, fileMarkFailed: number, dataDeleteFailed: number): void {
        const totalFailed = fileMarkFailed + dataDeleteFailed;

        if (fileMarkSuccess > 0 && totalFailed === 0) {
            new Notice(t(`成功删除 ${fileMarkSuccess} 个高亮`));
        } else if (fileMarkSuccess > 0 && totalFailed > 0) {
            let message = t(`成功删除 ${fileMarkSuccess} 个高亮`);
            if (fileMarkFailed > 0) {
                message += t(`，${fileMarkFailed} 个文件标记删除失败`);
            }
            if (dataDeleteFailed > 0) {
                message += t(`，${dataDeleteFailed} 个数据删除失败`);
            }
            new Notice(message);
        } else if (totalFailed > 0) {
            new Notice(t("删除高亮失败"));
        }
    }
}

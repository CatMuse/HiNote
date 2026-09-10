import { MarkdownView, TFile, setIcon } from "obsidian";
import CommentPlugin from "../../../main";
import { t } from "../../i18n";
import { FileListDataSource } from "./FileListDataSource";

interface FileListRenderState {
    currentFile: TFile | null;
    isFlashcardMode: boolean;
    isDraggedToMainView: boolean;
}

interface FileListItemRendererOptions {
    plugin: CommentPlugin;
    dataSource: FileListDataSource;
    getState: () => FileListRenderState;
    onFileSelect: () => ((file: TFile | null) => void) | null;
    onFlashcardModeToggle: () => ((enabled: boolean) => void) | null;
    onAllHighlightsSelect: () => (() => void) | null;
}

export class FileListItemRenderer {
    private flashcardChangedHandler: (() => void) | null = null;

    constructor(private options: FileListItemRendererOptions) {}

    createAllHighlightsItem(fileList: HTMLElement): void {
        const state = this.options.getState();
        const allFilesItem = fileList.createDiv({
            cls: `highlight-file-item highlight-file-item-all ${state.currentFile === null && !state.isFlashcardMode ? "is-active" : ""}`
        });

        const allFilesLeft = allFilesItem.createDiv({
            cls: "highlight-file-item-left"
        });

        const allIcon = allFilesLeft.createSpan({
            cls: "highlight-file-item-icon"
        });
        setIcon(allIcon, "square-library");

        allFilesLeft.createSpan({
            text: t("All Highlight"),
            cls: "highlight-file-item-name"
        });

        allFilesItem.createSpan({
            text: `${this.options.dataSource.getTotalHighlightsCount()}`,
            cls: "highlight-file-item-count"
        });

        allFilesItem.addEventListener("click", () => {
            this.options.onAllHighlightsSelect()?.();
        });
    }

    createFlashcardItem(fileList: HTMLElement): void {
        const state = this.options.getState();
        const flashcardItem = fileList.createDiv({
            cls: `highlight-file-item highlight-file-item-flashcard ${state.isFlashcardMode ? "is-active" : ""}`
        });

        const flashcardLeft = flashcardItem.createDiv({
            cls: "highlight-file-item-left"
        });

        const flashcardIcon = flashcardLeft.createSpan({
            cls: "highlight-file-item-icon"
        });
        setIcon(flashcardIcon, "book-heart");

        flashcardLeft.createSpan({
            text: t("HiCard"),
            cls: "highlight-file-item-name"
        });

        const flashcardCount = flashcardItem.createSpan({
            cls: "highlight-file-item-count"
        });

        const updateFlashcardCount = () => {
            const totalCards = this.options.plugin.fsrsManager.getTotalCardsCount();
            flashcardCount.textContent = `${totalCards}`;
        };

        updateFlashcardCount();

        this.unregisterFlashcardChangedHandler();
        this.flashcardChangedHandler = updateFlashcardCount;
        this.options.plugin.eventManager.on("flashcard:changed", this.flashcardChangedHandler);

        flashcardItem.addEventListener("click", () => {
            this.options.onFlashcardModeToggle()?.(true);
        });
    }

    updateAllHighlightsCount(container: HTMLElement): void {
        const countEl = container.querySelector(".highlight-file-item-all .highlight-file-item-count");
        if (countEl) {
            countEl.textContent = `${this.options.dataSource.getTotalHighlightsCount()}`;
        }
    }

    async createFileItem(fileList: HTMLElement, file: TFile): Promise<void> {
        const state = this.options.getState();
        const fileItem = fileList.createDiv({
            cls: `highlight-file-item ${state.currentFile?.path === file.path ? "is-active" : ""}`
        });
        fileItem.setAttribute("data-path", file.path);

        const fileItemLeft = fileItem.createDiv({
            cls: "highlight-file-item-left"
        });

        const fileIcon = fileItemLeft.createSpan({
            cls: "highlight-file-item-icon",
            attr: {
                "aria-label": t("Open (DoubleClick)")
            }
        });
        setIcon(fileIcon, "file-text");

        fileIcon.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            const leaf = this.getPreferredLeaf();
            void leaf.openFile(file);
        });

        const fileNameEl = fileItemLeft.createSpan({
            text: file.basename,
            cls: "highlight-file-item-name"
        });

        this.addPagePreview(fileNameEl, file);

        const highlightCount = await this.options.dataSource.getFileHighlightsCount(file);
        fileItem.createSpan({
            text: `${highlightCount}`,
            cls: "highlight-file-item-count"
        });

        fileItem.addEventListener("click", () => {
            this.options.onFileSelect()?.(file);
        });
    }

    updateSelection(container: HTMLElement): void {
        const state = this.options.getState();

        const allFilesItem = container.querySelector(".highlight-file-item-all");
        if (allFilesItem) {
            allFilesItem.classList.toggle("is-active", state.currentFile === null && !state.isFlashcardMode);
        }

        const flashcardItem = container.querySelector(".highlight-file-item-flashcard");
        if (flashcardItem) {
            flashcardItem.classList.toggle("is-active", state.isFlashcardMode);
        }

        const fileItems = container.querySelectorAll(".highlight-file-item:not(.highlight-file-item-all):not(.highlight-file-item-flashcard)");
        fileItems.forEach((item: HTMLElement) => {
            const isActive = state.currentFile?.path === item.getAttribute("data-path");
            item.classList.toggle("is-active", isActive);
        });
    }

    destroy(): void {
        this.unregisterFlashcardChangedHandler();
    }

    private addPagePreview(element: HTMLElement, file: TFile): void {
        let hoverTimeout: number | undefined;

        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = window.setTimeout(() => {
                const target = event.target as HTMLElement;

                this.options.plugin.app.workspace.trigger("hover-link", {
                    event,
                    source: "hi-note",
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300);
        });

        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                window.clearTimeout(hoverTimeout);
            }
        });
    }

    private getPreferredLeaf() {
        const leaves = this.options.plugin.app.workspace.getLeavesOfType("markdown");

        if (this.options.getState().isDraggedToMainView) {
            const activeMarkdownLeaf = this.options.plugin.app.workspace.getActiveViewOfType(MarkdownView)?.leaf;
            const otherLeaf = leaves.find(leaf => leaf !== activeMarkdownLeaf);
            if (otherLeaf) {
                return otherLeaf;
            }
        }

        return this.options.plugin.app.workspace.getLeaf("split", "vertical");
    }

    private unregisterFlashcardChangedHandler(): void {
        if (!this.flashcardChangedHandler) return;

        this.options.plugin.eventManager.off("flashcard:changed", this.flashcardChangedHandler);
        this.flashcardChangedHandler = null;
    }
}

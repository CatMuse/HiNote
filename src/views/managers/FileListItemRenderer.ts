import { MarkdownView, TFile, setIcon } from "obsidian";
import CommentPlugin from "../../../main";
import { t } from "../../i18n";
import { FileListDataSource } from "./FileListDataSource";

interface FileListRenderState {
    currentFile: TFile | null;
    isAllHighlights: boolean;
    isDraggedToMainView: boolean;
}

interface FileListItemRendererOptions {
    plugin: CommentPlugin;
    dataSource: FileListDataSource;
    getState: () => FileListRenderState;
    onFileSelect: () => ((file: TFile | null) => void) | null;
    onAllHighlightsSelect: () => (() => void) | null;
}

export class FileListItemRenderer {

    constructor(private options: FileListItemRendererOptions) {}

    createAllHighlightsItem(fileList: HTMLElement): void {
        const state = this.options.getState();
        const allFilesItem = fileList.createDiv({
            cls: `highlight-file-item highlight-file-item-all ${state.isAllHighlights ? "is-active" : ""}`
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

        this.makeKeyboardAction(allFilesItem);
        allFilesItem.addEventListener("click", () => {
            this.options.onAllHighlightsSelect()?.();
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

        this.makeKeyboardAction(fileItem);
        fileItem.addEventListener("click", () => {
            this.options.onFileSelect()?.(file);
        });
    }

    updateSelection(container: HTMLElement): void {
        const state = this.options.getState();

        const allFilesItem = container.querySelector(".highlight-file-item-all");
        if (allFilesItem) {
            allFilesItem.classList.toggle("is-active", state.isAllHighlights);
            allFilesItem.setAttribute("aria-current", String(state.isAllHighlights));
        }

        const fileItems = container.querySelectorAll(".highlight-file-item:not(.highlight-file-item-all)");
        fileItems.forEach((item: HTMLElement) => {
            const isActive = state.currentFile?.path === item.getAttribute("data-path");
            item.classList.toggle("is-active", isActive);
            item.setAttribute("aria-current", String(isActive));
        });
    }

    private makeKeyboardAction(element: HTMLElement): void {
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); element.click();
            }
        });
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

}

import { Notice, setIcon } from "obsidian";
import { t } from "../../../i18n";
import { showConfirmModal } from "../../../utils/ConfirmModal";
import type { CardGroup } from "../../types/FSRSTypes";
import type { FlashcardComponentContext } from "../FlashcardComponentContext";
import { FlashcardStatsPanel } from "../FlashcardStatsPanel";

interface FlashcardGroupListRendererOptions {
    isMobileView: boolean;
    onGroupSelected: () => void;
    rerender: () => void;
}

export class FlashcardGroupListRenderer {
    constructor(private component: FlashcardComponentContext) {}

    public render(
        sidebar: HTMLElement,
        container: HTMLElement,
        options: FlashcardGroupListRendererOptions
    ): void {
        const statsContainer = sidebar.createDiv({ cls: "flashcard-stats-container" });
        const statsPanel = new FlashcardStatsPanel(statsContainer, this.component.getFsrsManager());
        statsPanel.render();

        const customGroups = sidebar.createDiv({ cls: "flashcard-groups" });
        const customGroupHeader = customGroups.createDiv({ cls: "flashcard-groups-header" });
        const addButton = customGroupHeader.createDiv({
            cls: "flashcard-add-group",
            attr: { "aria-label": t("Add Group") }
        });

        setIcon(addButton, "plus");
        addButton.addEventListener("click", () => this.component.getGroupManager().showCreateGroupModal());

        const customGroupList = customGroups.createDiv({ cls: "flashcard-group-list" });
        const groupItems = this.component.getFsrsManager().getCardGroups() || [];

        groupItems.forEach((group: CardGroup) => {
            this.renderGroupItem(customGroupList, container, group, options);
        });
    }

    private renderGroupItem(
        customGroupList: HTMLElement,
        container: HTMLElement,
        group: CardGroup,
        options: FlashcardGroupListRendererOptions
    ): void {
        const groupItem = customGroupList.createDiv({
            cls: `flashcard-group-item ${group.name === this.component.getCurrentGroupName() ? "active" : ""}`
        });

        const header = groupItem.createDiv({ cls: "flashcard-group-item-header" });
        const title = header.createDiv({ cls: "flashcard-group-title" });
        const iconSpan = title.createSpan({ cls: "flashcard-group-icon" });
        setIcon(iconSpan, group.filter.startsWith("#") ? "hash" : "gallery-horizontal-end");
        title.createSpan({
            cls: "flashcard-group-name",
            text: group.name
        });

        const actions = header.createDiv({ cls: "flashcard-group-actions" });
        this.renderEditButton(actions, group);
        this.renderDeleteButton(actions, group, options.rerender);
        this.renderGroupStats(groupItem, group);

        groupItem.addEventListener("click", () => {
            this.selectGroup(groupItem, container, group);

            if (options.isMobileView) {
                options.onGroupSelected();
            }

            this.component.saveState();
            options.rerender();
        });
    }

    private renderEditButton(actions: HTMLElement, group: CardGroup): void {
        const editButton = actions.createDiv({
            cls: "flashcard-group-action",
            attr: { "aria-label": t("Edit Group") }
        });
        setIcon(editButton, "edit");
        editButton.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            this.component.getGroupManager().showEditGroupModal(group);
        });
    }

    private renderDeleteButton(actions: HTMLElement, group: CardGroup, rerender: () => void): void {
        const deleteButton = actions.createDiv({
            cls: "flashcard-group-action",
            attr: { "aria-label": t("Delete Group") }
        });
        setIcon(deleteButton, "trash");
        deleteButton.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            void this.deleteGroup(group, rerender);
        });
    }

    private async deleteGroup(group: CardGroup, rerender: () => void): Promise<void> {
        const confirmed = await showConfirmModal(this.component.getApp(), {
            title: t("Delete Group"),
            message: t("Are you sure you want to delete group \"") + group.name + t("\"?")
        });
        if (!confirmed) {
            return;
        }

        try {
            const deleted = await this.component.getFsrsManager().deleteCardGroup(group.id);
            if (deleted) {
                this.switchCurrentGroupAfterDelete(group);
                new Notice(t("Group deleted"));
                rerender();
            } else {
                new Notice(t("Delete group failed"));
            }
        } catch (error) {
            console.error("Delete group failed:", error);
            new Notice(t("Delete group failed"));
        }
    }

    private renderGroupStats(groupItem: HTMLElement, group: CardGroup): void {
        const groupStats = this.component.getFsrsManager().getGroupProgress(group.id);
        if (!groupStats) {
            return;
        }

        const statsSection = groupItem.createDiv({ cls: "flashcard-group-stats" });
        this.renderStat(statsSection, "calendar-clock", t("Due Today"), groupStats.due);
        this.renderStat(statsSection, "sparkle", t("New Cards"), groupStats.newCards);
        this.renderStat(statsSection, "check-small", t("Learned"), groupStats.learned);
    }

    private renderStat(statsSection: HTMLElement, icon: string, tooltip: string, value: number): void {
        const stat = statsSection.createDiv({
            cls: "flashcard-group-stat",
            attr: { "data-tooltip": tooltip }
        });
        const iconEl = stat.createSpan({ cls: "flashcard-stat-icon" });
        setIcon(iconEl, icon);
        stat.createSpan({ text: value.toString() });
    }

    private selectGroup(groupItem: HTMLElement, container: HTMLElement, group: CardGroup): void {
        this.component.setGroupCompletionMessage(
            this.component.getCurrentGroupName(),
            this.component.getCompletionMessage()
        );

        this.component.setCurrentGroupName(group.name);

        container.querySelectorAll(".flashcard-group-item").forEach((item: Element) => {
            item.classList.remove("active");
        });
        groupItem.classList.add("active");

        this.component.setCompletionMessage(this.component.getGroupCompletionMessage(group.name) || null);
        this.component.refreshCardList();

        const savedProgress = this.component.getGroupProgress(group.name);
        if (savedProgress && !this.component.getCompletionMessage()) {
            this.component.setCurrentIndex(savedProgress.currentIndex);
            this.component.setCardFlipped(savedProgress.isFlipped);
        } else {
            this.component.setCurrentIndex(0);
            this.component.setCardFlipped(false);
        }
    }

    private switchCurrentGroupAfterDelete(group: CardGroup): void {
        if (this.component.getCurrentGroupName() !== group.name) {
            return;
        }

        const remainingGroups = this.component.getFsrsManager().getCardGroups() || [];
        this.component.setCurrentGroupName(remainingGroups[0]?.name || "");
    }
}

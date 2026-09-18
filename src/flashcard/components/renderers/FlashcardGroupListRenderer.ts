import { Notice, setIcon } from "obsidian";
import { t } from "../../../i18n";
import { showConfirmModal } from "../../../utils/ConfirmModal";
import type { CardGroup } from "../../types/FSRSTypes";
import { isSystemCardGroup, PAUSED_CARDS_GROUP } from '../../types/FlashcardGroups';
import type { FlashcardComponentContext } from "../FlashcardComponentContext";
import { FlashcardStatsPanel } from "../FlashcardStatsPanel";

interface FlashcardGroupListRendererOptions {
    isMobileView: boolean;
    onGroupSelected: () => void;
    rerender: () => void;
}

export class FlashcardGroupListRenderer {
    constructor(private component: FlashcardComponentContext) {}

    public refreshStats(sidebar: HTMLElement): void {
        const stats = sidebar.querySelector<HTMLElement>('.flashcard-stats-container');
        if (stats) new FlashcardStatsPanel(stats, this.component.getFsrsManager()).render();
        for (const item of Array.from(sidebar.querySelectorAll<HTMLElement>('.flashcard-group-item'))) {
            const group = this.component.getFsrsManager().getCardGroups().find(group => group.id === item.dataset.groupId);
            if (!group) continue;
            item.querySelector('.flashcard-group-stats')?.remove();
            this.renderGroupStats(item, group);
        }
    }

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
            cls: `flashcard-group-item ${group.id === this.component.getCurrentGroupId() ? "active" : ""}`
        });
        groupItem.dataset.groupId = group.id;

        const header = groupItem.createDiv({ cls: "flashcard-group-item-header" });
        const title = header.createDiv({ cls: "flashcard-group-title" });
        const iconSpan = title.createSpan({ cls: "flashcard-group-icon" });
        setIcon(iconSpan, group.filter.startsWith("#") ? "hash" : "gallery-horizontal-end");
        title.createSpan({
            cls: "flashcard-group-name",
            text: isSystemCardGroup(group.id) ? t(group.name) : group.name
        });

        const actions = header.createDiv({ cls: "flashcard-group-actions" });
        if (!isSystemCardGroup(group.id)) {
            this.renderEditButton(actions, group);
            this.renderDeleteButton(actions, group, options.rerender);
        }
        this.renderGroupStats(groupItem, group);

        groupItem.addEventListener("click", () => {
            this.selectGroup(groupItem, container, group);

            options.onGroupSelected();

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
        if (group.id === PAUSED_CARDS_GROUP) {
            this.renderStat(statsSection, 'pause', t('Paused cards'), this.component.getFsrsManager().getCardsByGroupId(group.id).length);
            return;
        }
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
            this.component.getCurrentGroupId(),
            this.component.getCompletionMessage()
        );

        this.component.setCurrentGroupId(group.id);

        container.querySelectorAll(".flashcard-group-item").forEach((item: Element) => {
            item.classList.remove("active");
        });
        groupItem.classList.add("active");

        this.component.setCompletionMessage(this.component.getGroupCompletionMessage(group.id) || null);
        this.component.refreshCardList();

        this.component.getContainer().focus();
    }

    private switchCurrentGroupAfterDelete(group: CardGroup): void {
        if (this.component.getCurrentGroupId() !== group.id) {
            return;
        }

        const remainingGroups = this.component.getFsrsManager().getCardGroups() || [];
        this.component.setCurrentGroupId(remainingGroups[0]?.id || "");
        this.component.refreshCardList();
    }
}

import { Notice } from "obsidian";
import { CardGroup } from "../../types/FSRSTypes";
import { t } from "../../../i18n";
import type { FlashcardComponentContext } from "../FlashcardComponentContext";
import { createFlashcardGroupModal, FlashcardGroupFormValues } from "./FlashcardGroupModal";

/**
 * 闪卡分组管理器，负责处理分组的创建、编辑和删除
 */
export class FlashcardGroupManager {
    private activeModal: ReturnType<typeof createFlashcardGroupModal> | null = null;

    dispose(): void {
        this.activeModal?.close();
        this.activeModal = null;
    }

    private component: FlashcardComponentContext;

    constructor(component: FlashcardComponentContext) {
        this.component = component;
    }

    /**
     * 显示创建分组模态框
     */
    public showCreateGroupModal() {
        this.showEditGroupModal();
    }

    /**
     * 显示编辑分组模态框
     * @param group 要编辑的分组
     */
    public showEditGroupModal(group?: CardGroup) {
        this.dispose();
        const modal = createFlashcardGroupModal(group);
        this.activeModal = modal;

        modal.saveButton.addEventListener('click', () => {
            void this.saveGroupFromModal(modal, group);
        });

        modal.cancelButton.addEventListener('click', () => {
            modal.close();

            if (group) {
                this.component.getRenderer().render();
            }
        });
    }

    private async saveGroupFromModal(modal: ReturnType<typeof createFlashcardGroupModal>, group?: CardGroup): Promise<void> {
        const values = modal.getValues();
        if (!values.name) {
            new Notice(t('Group name cannot be empty'));
            return;
        }

        const fsrsManager = this.component.getFsrsManager();

        if (group) {
            await this.updateExistingGroup(group, values);
        } else {
            await fsrsManager.createCardGroup({
                name: values.name,
                filter: values.filter,
                isReversed: values.isReversed,
                createdTime: Date.now(),
                sortOrder: fsrsManager.getCardGroups().length,
                settings: this.createGroupSettings(values)
            });

            new Notice(t('Group created'));
            this.refreshFlashcardView();
        }

        modal.close();

        if (group) {
            this.component.getRenderer().render();
        }
    }

    private async updateExistingGroup(group: CardGroup, values: FlashcardGroupFormValues): Promise<void> {
        const fsrsManager = this.component.getFsrsManager();
        const oldName = group.name;

        try {
            await fsrsManager.updateCardGroup(group.id, this.createGroupUpdate(values));
            await fsrsManager.renameGroupUIState(oldName, values.name);

            if (this.component.getCurrentGroupName() === oldName) {
                this.component.setCurrentGroupName(values.name);
            }

            this.refreshFlashcardView();
            new Notice(t('Group update successful'));
        } catch (error) {
            console.error('Update group failed:', error);
            new Notice(t('Update group failed'));
        }
    }

    private refreshFlashcardView(): void {
        this.component.refreshCardList();
        this.component.getRenderer().render();
    }

    private createGroupUpdate(values: FlashcardGroupFormValues): Partial<CardGroup> {
        return {
            name: values.name,
            filter: values.filter,
            isReversed: values.isReversed,
            settings: this.createGroupSettings(values),
            lastUpdated: Date.now()
        };
    }

    private createGroupSettings(values: FlashcardGroupFormValues): CardGroup['settings'] {
        return {
            useGlobalSettings: values.useGlobalSettings,
            newCardsPerDay: values.useGlobalSettings ? undefined : values.newCardsPerDay,
            reviewsPerDay: values.useGlobalSettings ? undefined : values.reviewsPerDay
        };
    }
}

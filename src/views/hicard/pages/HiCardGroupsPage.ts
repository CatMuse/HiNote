import { Notice, setIcon } from 'obsidian';
import type CommentPlugin from '../../../../main';
import { t } from '../../../i18n';
import type { CardGroup } from '../../../flashcard';
import { isSystemCardGroup } from '../../../flashcard/types/FlashcardGroups';
import {
    createFlashcardGroupModal,
    type FlashcardGroupModal
} from '../../../flashcard/components/controllers/FlashcardGroupModal';
import { showConfirmModal } from '../../../utils/ConfirmModal';
import { renderHiCardPageHeader } from './HiCardPageHeader';

export class HiCardGroupsPage {
    private container: HTMLElement | null = null;
    private modal: FlashcardGroupModal | null = null;

    constructor(
        private plugin: CommentPlugin,
        private openStudyGroup: (groupId: string) => Promise<void>
    ) {}

    render(container: HTMLElement): void {
        this.container = container;
        container.empty();
        container.addClass('hicard-page', 'hicard-groups-page');
        const actions = renderHiCardPageHeader(
            container,
            t('Study groups'),
            t('Organize cards and configure group learning limits.')
        );
        const create = actions.createEl('button', { cls: 'mod-cta', text: t('Create group') });
        create.addEventListener('click', () => this.openGroupModal());

        const table = container.createDiv({ cls: 'hicard-management-table hicard-groups-table' });
        this.renderHeader(table);
        for (const group of this.plugin.fsrsManager.getCardGroups()) this.renderGroup(table, group);
    }

    destroy(): void {
        this.modal?.close();
        this.modal = null;
    }

    private renderHeader(table: HTMLElement): void {
        const row = table.createDiv({ cls: 'hicard-management-row hicard-management-table-header' });
        row.createSpan({ text: t('Group') });
        row.createSpan({ text: t('Type') });
        row.createSpan({ text: t('Cards') });
        row.createSpan({ text: t('Due today') });
        row.createSpan({ text: t('Actions') });
    }

    private renderGroup(table: HTMLElement, group: CardGroup): void {
        const cards = this.plugin.fsrsManager.getCardsByGroupId(group.id);
        const progress = this.plugin.fsrsManager.getGroupProgress(group.id);
        const system = isSystemCardGroup(group.id);
        const row = table.createDiv({ cls: 'hicard-management-row' });
        const identity = row.createDiv({ cls: 'hicard-management-identity' });
        const icon = identity.createSpan();
        setIcon(icon, system ? 'folder-cog' : group.filter?.trim() ? 'list-filter' : 'folder');
        identity.createSpan({ text: system ? t(group.name) : group.name });
        row.createSpan({ text: t(system ? 'System group' : group.filter?.trim() ? 'Filtered group' : 'Manual group') });
        row.createSpan({ text: String(cards.length) });
        row.createSpan({ text: String(progress?.due ?? 0) });
        const actions = row.createDiv({ cls: 'hicard-management-actions' });
        this.addIconButton(actions, 'play', t('Study'), () => { void this.openStudyGroup(group.id); });
        if (!system) {
            this.addIconButton(actions, 'pencil', t('Edit'), () => this.openGroupModal(group));
            this.addIconButton(actions, 'trash-2', t('Delete'), () => { void this.deleteGroup(group); }, true);
        }
    }

    private addIconButton(
        container: HTMLElement,
        iconName: string,
        label: string,
        action: () => void,
        destructive = false
    ): void {
        const button = container.createEl('button', {
            cls: `clickable-icon${destructive ? ' hicard-destructive-action' : ''}`,
            attr: { type: 'button', 'aria-label': label, 'data-tooltip-position': 'top' }
        });
        button.setAttribute('data-tooltip', label);
        setIcon(button, iconName);
        button.addEventListener('click', action);
    }

    private openGroupModal(group?: CardGroup): void {
        this.modal?.close();
        const modal = createFlashcardGroupModal(group);
        this.modal = modal;
        modal.cancelButton.addEventListener('click', () => modal.close());
        modal.saveButton.addEventListener('click', () => {
            if (modal.saveButton.disabled) return;
            modal.saveButton.disabled = true;
            void this.saveGroup(modal, group).finally(() => { modal.saveButton.disabled = false; });
        });
    }

    private async saveGroup(modal: FlashcardGroupModal, group?: CardGroup): Promise<void> {
        const values = modal.getValues();
        const name = values.name.trim();
        if (!name) {
            new Notice(t('Group name cannot be empty'));
            return;
        }
        if (this.plugin.fsrsManager.getCardGroups().some(item => item.id !== group?.id && item.name === name)) {
            new Notice(t('A group with this name already exists.'));
            return;
        }
        const settings: CardGroup['settings'] = {
            useGlobalSettings: values.useGlobalSettings,
            newCardsPerDay: values.useGlobalSettings ? undefined : values.newCardsPerDay,
            reviewsPerDay: values.useGlobalSettings ? undefined : values.reviewsPerDay
        };
        if (group) {
            await this.plugin.fsrsManager.updateCardGroup(group.id, {
                name,
                filter: values.filter,
                isReversed: values.isReversed,
                settings,
                lastUpdated: Date.now()
            });
        } else {
            await this.plugin.fsrsManager.createCardGroup({
                name,
                filter: values.filter,
                isReversed: values.isReversed,
                settings,
                createdTime: Date.now(),
                sortOrder: this.plugin.fsrsManager.getCardGroups().length
            });
        }
        modal.close();
        this.modal = null;
        if (this.container) this.render(this.container);
        new Notice(t(group ? 'Group update successful' : 'Group created'));
    }

    private async deleteGroup(group: CardGroup): Promise<void> {
        const confirmed = await showConfirmModal(this.plugin.app, {
            title: t('Delete Group'),
            message: t('Delete this group? Cards will be kept.')
        });
        if (!confirmed) return;
        if (!await this.plugin.fsrsManager.deleteCardGroup(group.id)) {
            new Notice(t('Delete group failed'));
            return;
        }
        if (this.container) this.render(this.container);
        new Notice(t('Group deleted'));
    }
}

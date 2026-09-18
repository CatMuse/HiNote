import type {
    CardGroup,
    FlashcardProgress,
    FlashcardState,
    FSRSStorage
} from '../types/FSRSTypes';
import type { CardGroupRepository } from './CardGroupRepository';

interface FlashcardGroupServiceOptions {
    getStorage: () => FSRSStorage;
    getGroupRepository: () => CardGroupRepository;
    saveStorage: () => Promise<void>;
    saveDebounced: () => void;
}

export class FlashcardGroupService {
    constructor(private options: FlashcardGroupServiceOptions) {}

    async createCardGroup(group: Omit<CardGroup, 'id'>): Promise<CardGroup> {
        const storage = this.options.getStorage();
        if (!Array.isArray(storage.cardGroups)) {
            storage.cardGroups = [];
        }

        const newGroup = await this.options.getGroupRepository().createCardGroup(group);
        if (!storage.cardGroups.some(existingGroup => existingGroup.id === newGroup.id)) {
            storage.cardGroups.push(newGroup);
        }

        await this.options.saveStorage();
        return newGroup;
    }

    async updateCardGroup(groupId: string, updates: Partial<Omit<CardGroup, 'id'>>): Promise<boolean> {
        const groupRepository = this.options.getGroupRepository();

        const result = await groupRepository.updateCardGroup(groupId, updates);
        if (!result) {
            return false;
        }

        await this.options.saveStorage();
        return true;
    }

    async deleteCardGroup(groupId: string): Promise<boolean> {
        const result = await this.options.getGroupRepository().deleteCardGroup(groupId, false);
        if (!result) {
            return false;
        }

        try {
            await this.options.saveStorage();
            return true;
        } catch {
            return false;
        }
    }

    getCardsInGroup(group: CardGroup): FlashcardState[] {
        return this.options.getGroupRepository().getCardsByGroupId(group.id);
    }

    addCardToGroup(cardId: string, groupId: string): boolean {
        const result = this.options.getGroupRepository().addCardToGroup(cardId, groupId);
        if (result) {
            this.options.saveDebounced();
        }
        return result;
    }

    removeCardFromGroup(cardId: string, groupId: string): boolean {
        const result = this.options.getGroupRepository().removeCardFromGroup(cardId, groupId);
        if (result) {
            this.options.saveDebounced();
        }
        return result;
    }

    getGroupProgress(groupId: string): FlashcardProgress | null {
        return this.options.getGroupRepository().getGroupProgress(groupId);
    }

    getCardsByGroupId(groupId: string): FlashcardState[] {
        return this.options.getGroupRepository().getCardsByGroupId(groupId);
    }

    getCardGroups(): CardGroup[] {
        return this.options.getGroupRepository().getCardGroups();
    }

    cleanupInvalidCardReferences(): number {
        return this.options.getGroupRepository().cleanupInvalidCardReferences();
    }
}

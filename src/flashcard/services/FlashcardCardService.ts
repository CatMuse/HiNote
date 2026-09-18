import type { FlashcardState, FSRSStorage } from '../types/FSRSTypes';
import { CardGroupFilterMatcher } from './CardGroupFilterMatcher';
import type { CardGroupRepository } from './CardGroupRepository';
import type { FlashcardFactory } from './FlashcardFactory';

interface FlashcardCardServiceOptions {
    getStorage: () => FSRSStorage;
    getCardFactory: () => FlashcardFactory;
    getGroupRepository: () => CardGroupRepository;
    addCardToGroup: (cardId: string, groupId: string) => boolean;
    removeCardFromGroup: (cardId: string, groupId: string) => boolean;
    saveDebounced: () => void;
    emitFlashcardChanged: () => void;
}

export class FlashcardCardService {
    constructor(private options: FlashcardCardServiceOptions) {}

    addCard(
        text: string,
        answer: string,
        filePath?: string,
        sourceId?: string,
        sourceType?: 'highlight' | 'comment'
    ): FlashcardState {
        const card = this.options.getCardFactory().createCard(text, answer, filePath);

        if (sourceId && sourceType) {
            card.sourceId = sourceId;
            card.sourceType = sourceType;
        }

        this.options.getStorage().cards[card.id] = card;
        this.checkAndAddCardToGroups(card);
        this.options.saveDebounced();

        return card;
    }

    deleteCard(cardId: string): boolean {
        const storage = this.options.getStorage();
        const card = storage.cards[cardId];
        if (!card) {
            return false;
        }

        if (card.groupIds) {
            for (const groupId of card.groupIds) {
                this.options.removeCardFromGroup(cardId, groupId);
            }
        }

        delete storage.cards[cardId];
        this.options.saveDebounced();
        this.options.emitFlashcardChanged();
        return true;
    }

    getCardsByFile(filePath: string): FlashcardState[] {
        return this.options.getCardFactory().getCardsByFile(filePath);
    }

    getAllCards(): FlashcardState[] {
        return Object.values(this.options.getStorage().cards);
    }

    getTotalCardsCount(): number {
        const allGroups = this.options.getGroupRepository().getCardGroups() || [];
        if (allGroups.length === 0) {
            return 0;
        }



        const customGroupCards = new Set<string>();
        allGroups.forEach(group => this.options.getGroupRepository().getCardsByGroupId(group.id).forEach(card => customGroupCards.add(card.id)));

        return customGroupCards.size;
    }

    private checkAndAddCardToGroups(card: FlashcardState): number {
        if (!card || !card.id) {
            return 0;
        }

        const allGroups = this.options.getGroupRepository().getCardGroups();
        if (!allGroups || allGroups.length === 0) {
            return 0;
        }

        let addedCount = 0;
        for (const group of allGroups) {
            if (!group.filter || group.filter.trim().length === 0) {
                continue;
            }

            if (CardGroupFilterMatcher.matches(card, group.filter)
                && this.options.addCardToGroup(card.id, group.id)) {
                addedCount++;
            }
        }

        return addedCount;
    }
}

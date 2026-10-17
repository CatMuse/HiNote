import type { FlashcardState, FSRSStorage } from "../types/FSRSTypes";

export type FlashcardSourceType = "highlight" | "comment";

interface SourceCardServiceOptions {
    getStorage: () => FSRSStorage;
    removeCardFromGroup: (cardId: string, groupId: string) => boolean;
    saveDebounced: () => void;
}

export class SourceCardService {
    constructor(private options: SourceCardServiceOptions) {}

    public findCardsBySourceId(sourceId: string, sourceType?: FlashcardSourceType): FlashcardState[] {
        const storage = this.options.getStorage();
        if (!storage.cards || !sourceId) {
            return [];
        }

        return Object.values(storage.cards).filter((card: FlashcardState) =>
            card.sourceId === sourceId &&
            (!sourceType || card.sourceType === sourceType)
        );
    }

    public deleteCardsBySourceId(sourceId: string, sourceType?: FlashcardSourceType): number {
        const storage = this.options.getStorage();
        const cardsToDelete = this.findCardsBySourceId(sourceId, sourceType);
        let deletedCount = 0;

        for (const card of cardsToDelete) {
            if (card.groupIds) {
                for (const groupId of card.groupIds) {
                    this.options.removeCardFromGroup(card.id, groupId);
                }
            }

            delete storage.cards[card.id];
            deletedCount++;
        }

        if (deletedCount > 0) {
            this.options.saveDebounced();
        }

        return deletedCount;
    }

    public updateCardsBySourceId(
        sourceId: string,
        sourceType: FlashcardSourceType,
        newText?: string,
        newAnswer?: string
    ): number {
        const cardsToUpdate = this.findCardsBySourceId(sourceId, sourceType);
        let updatedCount = 0;

        for (const card of cardsToUpdate) {
            if (newText !== undefined && !card.frontCustomized) {
                card.text = newText;
            }

            if (newAnswer !== undefined) {
                card.answer = newAnswer;
            }

            card.updatedAt = Date.now();
            updatedCount++;
        }

        if (updatedCount > 0) {
            this.options.saveDebounced();
        }

        return updatedCount;
    }
}

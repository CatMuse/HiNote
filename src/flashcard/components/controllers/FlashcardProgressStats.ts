import type { CardGroup, FlashcardProgress, FlashcardState } from "../../types/FSRSTypes";
import type { FSRSManager } from "../../services/FSRSManager";

export interface FlashcardIndexProgress {
    current: number;
    total: number;
}

export function getCardsForProgress(fsrsManager: FSRSManager, groupId: string): FlashcardState[] {
    if (groupId) {
        return fsrsManager.getCardsByGroupId(groupId);
    }

    return getAllGroupedCards(fsrsManager);
}

export function calculateFlashcardProgress(
    cards: FlashcardState[],
    fsrsManager: FSRSManager
): FlashcardProgress {
    cards = cards.filter(card => !card.suspended);
    const due = cards.filter(card => card.reviews > 0 && fsrsManager.fsrsService.isDue(card)).length;
    const newCards = cards.filter(card => card.reviews === 0).length;
    const learned = cards.filter(card => card.reviews > 0).length;

    return {
        due,
        newCards,
        learned,
        retention: calculateRetention(cards)
    };
}

export function calculateRetention(cards: FlashcardState[]): number {
    const learnedCards = cards.filter(card => card.reviews > 0);

    if (learnedCards.length === 0) {
        return 1;
    }

    const history = learnedCards.flatMap(card => card.reviewHistory);
    return history.length ? history.filter(review => review.rating !== 1).length / history.length : 1;
}

export function calculateProgressPercent(progress: FlashcardProgress, remainingCards: number): number {
    const total = progress.due + progress.newCards;
    return total > 0 ? Math.round(((total - remainingCards) / total) * 100) : 100;
}

export function calculateIndexProgress(
    fsrsManager: FSRSManager,
    groupId: string,
    remainingCards: number
): FlashcardIndexProgress {
    const cardsForToday = groupId ? fsrsManager.getCardsForStudy(groupId) : [];
    const totalTodayCards = cardsForToday.length;

    if (totalTodayCards <= 0 && remainingCards <= 0) {
        return { current: 0, total: 0 };
    }

    const total = Math.max(totalTodayCards, remainingCards);
    const current = remainingCards > 0 ? total - remainingCards + 1 : total;

    return { current, total };
}

export function findGroupByName(fsrsManager: FSRSManager, groupName: string): CardGroup | undefined {
    return fsrsManager.getCardGroups().find((group: CardGroup) => group.name === groupName);
}

function getAllGroupedCards(fsrsManager: FSRSManager): FlashcardState[] {
    const cardIds = new Set<string>();
    const allGroupCards: FlashcardState[] = [];

    fsrsManager.getCardGroups().forEach((group: CardGroup) => {
        const groupCards = fsrsManager.getCardsByGroupId(group.id);
        groupCards.forEach((card: FlashcardState) => {
            if (!cardIds.has(card.id)) {
                cardIds.add(card.id);
                allGroupCards.push(card);
            }
        });
    });

    return allGroupCards;
}

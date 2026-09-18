import type { CardGroup, FlashcardState, GroupProgressState } from "../../types/FSRSTypes";
import type { FSRSManager } from "../../services/FSRSManager";
import { t } from "../../../i18n";

export interface RestoredReviewPosition {
    currentIndex: number;
    isFlipped: boolean;
}

export function getCompletionMessage(fsrsManager: FSRSManager, groupName: string): string {
    if (!groupName) {
        return t('All flashcards completed for today!');
    }

    const group = findGroupByName(fsrsManager, groupName);
    if (!group) {
        return t('No cards due for review');
    }

    return t('Group completed: ') + group.name + t('. Add more cards in Settings, but remember: more cards = more reviews.');
}

export function getDueCardsForToday(
    cards: FlashcardState[],
    fsrsManager: FSRSManager
): FlashcardState[] {
    const fsrsService = fsrsManager.fsrsService;

    return cards.filter((card: FlashcardState) => {
        if (card.reviews === 0 && card.lastReview === 0) return true;
        if (fsrsService.isDue(card)) return true;
        return false;
    });
}

export function restoreReviewPosition(
    cards: FlashcardState[],
    savedProgress: GroupProgressState | null
): RestoredReviewPosition {
    if (!savedProgress) {
        return {
            currentIndex: 0,
            isFlipped: false
        };
    }

    const currentIndex = Math.max(0, findRestoredCardIndex(cards, savedProgress));
    const sameCard = !savedProgress.currentCardId || cards[currentIndex]?.id === savedProgress.currentCardId;
    return { currentIndex, isFlipped: sameCard && savedProgress.isFlipped };
}

export function clearGroupCompletionMessage(fsrsManager: FSRSManager, groupName: string): void {
    const uiState = fsrsManager.getUIState();
    if (!uiState.groupProgress) {
        uiState.groupProgress = {};
    }

    if (!uiState.groupProgress[groupName]) {
        uiState.groupProgress[groupName] = {
            currentIndex: 0,
            isFlipped: false,
            currentCardId: undefined,
            completionMessage: undefined
        };
    } else {
        uiState.groupProgress[groupName].completionMessage = undefined;
    }

    fsrsManager.updateUIState(uiState);
}

export function resetGroupProgressForCompletion(
    fsrsManager: FSRSManager,
    groupName: string,
    message: string
): void {
    const uiState = fsrsManager.getUIState();
    if (!uiState.groupProgress) {
        uiState.groupProgress = {};
    }

    uiState.groupProgress[groupName] = {
        currentIndex: 0,
        isFlipped: false,
        currentCardId: undefined,
        completionMessage: message
    };

    fsrsManager.updateUIState(uiState);
}

export function findGroupByName(fsrsManager: FSRSManager, groupName: string): CardGroup | undefined {
    return fsrsManager.getCardGroups().find((group: CardGroup) => group.name === groupName);
}

function findRestoredCardIndex(
    cards: FlashcardState[],
    savedProgress: GroupProgressState
): number {
    if (savedProgress.currentCardId) {
        const foundIndex = cards.findIndex((card: FlashcardState) => card.id === savedProgress.currentCardId);
        if (foundIndex !== -1) {
            return foundIndex;
        }
    }

    return Math.min(savedProgress.currentIndex, cards.length - 1);
}

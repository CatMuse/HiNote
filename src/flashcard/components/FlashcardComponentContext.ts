import type { App } from "obsidian";
import type CommentPlugin from "../../../main";
import type { FSRSManager } from "../services/FSRSManager";
import type { FSRSRating, FlashcardState, GroupProgressState } from "../types/FSRSTypes";
import type { LicenseManager } from "../../services/LicenseManager";
import type { FlashcardRenderer } from "./FlashcardRenderer";
import type { FlashcardGroupManager, FlashcardUtils } from "./controllers";

export interface FlashcardComponentContext {
    getPlugin(): CommentPlugin;
    getApp(): App;
    getContainer(): HTMLElement;
    getIsActive(): boolean;
    canStudy(): boolean;
    activate(): Promise<void>;
    setProgressContainer(container: HTMLElement): void;
    getLicenseManager(): LicenseManager;
    getCards(): FlashcardState[];
    setCards(cards: FlashcardState[]): void;
    getCurrentIndex(): number;
    setCurrentIndex(index: number): void;
    isCardFlipped(): boolean;
    setCardFlipped(flipped: boolean): void;
    getCurrentGroupId(): string;
    setCurrentGroupId(groupId: string): void;
    getCurrentGroupName(): string;
    setCurrentGroupName(groupName: string): void;
    getFsrsManager(): FSRSManager;
    getProgressContainer(): HTMLElement | null;
    getCompletionMessage(): string | null;
    setCompletionMessage(message: string | null): void;
    setGroupCompletionMessage(groupName: string, message: string | null): void;
    getGroupCompletionMessage(groupName: string): string | null;
    getGroupProgress(groupName?: string): GroupProgressState | null;
    saveState(): void;
    updateProgress(): void;
    refreshCardList(): void;
    getRenderer(): FlashcardRenderer;
    getGroupManager(): FlashcardGroupManager;
    getUtils(): FlashcardUtils;
    getRatingButtons(): FlashcardRatingButton[];
    flipCard(): void;
    undoReview(): void;
    setCardSuspended(cardId: string, suspended: boolean): void;
    getSessionProgress(): { completed: number; total: number };
    rateCard(rating: FSRSRating): void;
}

export interface FlashcardRatingButton {
    label: string;
    rating: FSRSRating;
    key: string;
    ratingText: string;
}

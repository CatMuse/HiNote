import type { HighlightCard } from './HighlightCard';

export class HighlightCardRegistry {
    private instances = new Set<HighlightCard>();

    register(card: HighlightCard): void {
        this.instances.add(card);
    }

    unregister(card: HighlightCard): void {
        this.instances.delete(card);
    }

    clearWithin(container: HTMLElement): void {
        Array.from(this.instances).filter(card => container.contains(card.getElement())).forEach(card => card.destroy());
    }

    refreshMetadataWithin(container: HTMLElement): void {
        this.instances.forEach(card => {
            if (container.contains(card.getElement())) card.refreshMetadata();
        });
    }

    clearAll(): void {
        Array.from(this.instances).forEach(card => card.destroy());
        this.instances.clear();
    }

    clearAllUnfocusedInputs(): void {
        this.instances.forEach(card => card.clearUnfocusedInput());
    }

    findByHighlightId(highlightId: string, container?: HTMLElement): HighlightCard | null {
        for (const instance of this.instances) {
            if (instance.getHighlightId() === highlightId && (!container || container.contains(instance.getElement()))) {
                return instance;
            }
        }

        return null;
    }

    findByElement(element: HTMLElement): HighlightCard | null {
        for (const instance of this.instances) {
            const cardElement = instance.getElement();
            if (cardElement === element || cardElement.contains(element)) {
                return instance;
            }
        }

        return null;
    }

    updateCardUIByHighlightId(highlightId: string): void {
        this.findByHighlightId(highlightId)?.updateIconsAfterCardCreation();
    }
}

export const defaultHighlightCardRegistry = new HighlightCardRegistry();

interface SelectionBoxControllerOptions {
    highlightContainer: HTMLElement;
    clearSelection: () => void;
    updateSelectedHighlights: () => void;
}

export class SelectionBoxController {
    private selectionBox: HTMLElement | null = null;
    private selectionStartX = 0;
    private selectionStartY = 0;
    private readonly mouseMoveThreshold = 5;
    private mouseMoved = false;
    private selectionMode = false;

    constructor(private options: SelectionBoxControllerOptions) {}

    initialize(): void {
        this.options.highlightContainer.removeEventListener("mousedown", this.handleSelectionStart);
        this.cleanupMouseEvents();
        this.cleanupSelectionEvents();
        this.options.highlightContainer.addEventListener("mousedown", this.handleSelectionStart);
    }

    isInSelectionMode(): boolean {
        return this.selectionMode;
    }

    destroy(): void {
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }

        this.options.highlightContainer.removeEventListener("mousedown", this.handleSelectionStart);
        this.cleanupMouseEvents();
        this.cleanupSelectionEvents();
        this.selectionMode = false;
    }

    private handleSelectionStart = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest(".highlight-card") ||
            target.closest(".flashcard-mode") ||
            target.closest(".flashcard-add-group") ||
            target.closest(".flashcard-group-action")) {
            return;
        }

        this.selectionStartX = e.clientX;
        this.selectionStartY = e.clientY;
        this.mouseMoved = false;

        activeDocument.addEventListener("mousemove", this.handleMouseMove);
        activeDocument.addEventListener("mouseup", this.handleMouseUp);
    };

    private handleMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - this.selectionStartX;
        const dy = e.clientY - this.selectionStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= this.mouseMoveThreshold) {
            this.mouseMoved = true;
            activeDocument.removeEventListener("mousemove", this.handleMouseMove);
            this.startSelection(e);
        }
    };

    private handleMouseUp = () => {
        this.cleanupMouseEvents();

        if (!this.mouseMoved) {
            this.options.clearSelection();
        }
    };

    private startSelection(_e: MouseEvent): void {
        this.cleanupMouseEvents();
        this.options.clearSelection();

        this.selectionBox = createDiv();
        this.selectionBox.className = "selection-box";
        this.selectionBox.style.left = `${this.selectionStartX}px`;
        this.selectionBox.style.top = `${this.selectionStartY}px`;
        activeDocument.body.appendChild(this.selectionBox);

        this.selectionMode = true;

        activeDocument.addEventListener("mousemove", this.handleSelectionMove);
        activeDocument.addEventListener("mouseup", this.handleSelectionEnd);
    }

    private handleSelectionMove = (e: MouseEvent) => {
        if (!this.selectionMode || !this.selectionBox) return;

        const width = e.clientX - this.selectionStartX;
        const height = e.clientY - this.selectionStartY;

        if (width < 0) {
            this.selectionBox.setCssProps({
                left: `${e.clientX}px`,
                width: `${-width}px`
            });
        } else {
            this.selectionBox.setCssProps({ width: `${width}px` });
        }

        if (height < 0) {
            this.selectionBox.setCssProps({
                top: `${e.clientY}px`,
                height: `${-height}px`
            });
        } else {
            this.selectionBox.setCssProps({ height: `${height}px` });
        }

        this.selectCardsInBox();
    };

    private handleSelectionEnd = () => {
        if (!this.selectionMode) return;

        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }

        this.selectionMode = false;
        this.cleanupSelectionEvents();
        this.options.updateSelectedHighlights();
    };

    private selectCardsInBox(): void {
        if (!this.selectionBox) return;

        const boxRect = this.selectionBox.getBoundingClientRect();
        const cards = this.options.highlightContainer.querySelectorAll(".highlight-card");

        cards.forEach(card => {
            const cardRect = card.getBoundingClientRect();
            const overlap = !(boxRect.right < cardRect.left ||
                boxRect.left > cardRect.right ||
                boxRect.bottom < cardRect.top ||
                boxRect.top > cardRect.bottom);

            if (overlap) {
                card.addClass("selected");
            } else if (!activeDocument.querySelector(".multi-select-mode")) {
                card.removeClass("selected");
            }
        });
    }

    private cleanupMouseEvents(): void {
        activeDocument.removeEventListener("mousemove", this.handleMouseMove);
        activeDocument.removeEventListener("mouseup", this.handleMouseUp);
    }

    private cleanupSelectionEvents(): void {
        activeDocument.removeEventListener("mousemove", this.handleSelectionMove);
        activeDocument.removeEventListener("mouseup", this.handleSelectionEnd);
    }
}

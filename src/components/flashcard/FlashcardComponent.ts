import { HiNote } from "../../CommentStore";

export class FlashcardComponent {
    private container: HTMLElement;
    private currentIndex: number = 0;
    private isFlipped: boolean = false;
    private cards: Array<{
        front: string;
        back: string;
        id: string;
        sourceFile?: string;
    }> = [];

    constructor(container: HTMLElement) {
        this.container = container;
    }

    setCards(highlights: HiNote[]) {
        this.cards = highlights.map(highlight => ({
            id: highlight.id,
            front: highlight.text,
            back: highlight.comments?.[0]?.content || "",
            sourceFile: highlight.filePath
        }));
        this.currentIndex = 0;
        this.isFlipped = false;
        this.render();
    }

    cleanup() {
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }

    private render() {
        this.container.empty();
        this.container.addClass('flashcard-mode');

        // 创建闪卡容器
        const cardContainer = this.container.createEl("div", { cls: "flashcard-container" });
        
        if (this.cards.length === 0) {
            cardContainer.createEl("div", { 
                cls: "flashcard-empty", 
                text: "No flashcards available" 
            });
            return;
        }

        // 创建卡片
        const card = cardContainer.createEl("div", { cls: "flashcard" });
        
        // 创建卡片正面
        const frontSide = card.createEl("div", { 
            cls: "flashcard-side flashcard-front",
            text: this.getCurrentCard()?.front || ""
        });

        // 创建卡片背面
        const backSide = card.createEl("div", { 
            cls: "flashcard-side flashcard-back",
            text: this.getCurrentCard()?.back || ""
        });

        // 创建导航按钮
        const navContainer = cardContainer.createEl("div", { cls: "flashcard-nav" });
        
        const prevButton = navContainer.createEl("button", { 
            cls: "flashcard-nav-btn",
            text: "Previous"
        });
        prevButton.addEventListener("click", () => this.previousCard());

        const flipButton = navContainer.createEl("button", { 
            cls: "flashcard-nav-btn",
            text: "Flip"
        });
        flipButton.addEventListener("click", () => this.flipCard());

        const nextButton = navContainer.createEl("button", { 
            cls: "flashcard-nav-btn",
            text: "Next"
        });
        nextButton.addEventListener("click", () => this.nextCard());

        // 显示进度
        const progress = cardContainer.createEl("div", { 
            cls: "flashcard-progress",
            text: `Card ${this.currentIndex + 1} of ${this.cards.length}`
        });
    }

    private getCurrentCard() {
        return this.cards[this.currentIndex];
    }

    private flipCard() {
        this.isFlipped = !this.isFlipped;
        const cardEl = this.container.querySelector(".flashcard");
        if (cardEl) {
            cardEl.classList.toggle("is-flipped", this.isFlipped);
        }
    }

    private nextCard() {
        if (this.currentIndex < this.cards.length - 1) {
            this.currentIndex++;
            this.isFlipped = false;
            this.render();
        }
    }

    private previousCard() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.isFlipped = false;
            this.render();
        }
    }

    // 清理方法
    destroy() {
        this.container.removeClass('flashcard-mode');
        this.container.empty();
    }
}

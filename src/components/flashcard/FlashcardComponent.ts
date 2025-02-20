import { Notice } from "obsidian";
import { HiNote } from "../../CommentStore";
import { LicenseManager } from "../../services/LicenseManager";

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
    private isActive: boolean = false;
    private licenseManager: LicenseManager;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    setLicenseManager(licenseManager: LicenseManager) {
        this.licenseManager = licenseManager;
    }



    setCards(highlights: HiNote[]) {
        // Filter out virtual highlights
        const realHighlights = highlights.filter(highlight => !highlight.isVirtual);
        this.cards = realHighlights.map(highlight => ({
            id: highlight.id,
            front: highlight.text,
            back: highlight.comments?.[0]?.content || "",
            sourceFile: highlight.filePath
        }));
        this.currentIndex = 0;
        this.isFlipped = false;
        
        // 只有在激活状态下才渲染
        if (this.isActive) {
            this.activate();
        }
    }

    cleanup() {
        this.deactivate();
    }

    async activate() {
        // 检查许可证
        if (!this.licenseManager) {
            console.error('License manager not set');
            return;
        }

        const isActivated = await this.licenseManager.isActivated();
        this.isActive = true;
        
        if (!isActivated) {
            this.renderActivation();
        } else {
            this.render();
        }
    }

    private renderActivation() {
        this.container.empty();
        this.container.addClass('flashcard-mode');

        const activationContainer = this.container.createEl('div', {
            cls: 'flashcard-activation-container'
        });

        const header = activationContainer.createEl('div', {
            cls: 'flashcard-activation-header',
            text: 'Activate HiCard'
        });

        const description = activationContainer.createEl('div', {
            cls: 'flashcard-activation-description',
            text: 'Enter your license key to activate HiCard feature.'
        });

        const inputContainer = activationContainer.createEl('div', {
            cls: 'flashcard-activation-input-container'
        });

        const input = inputContainer.createEl('input', {
            cls: 'flashcard-activation-input',
            type: 'text',
            placeholder: 'Enter license key'
        });

        const button = inputContainer.createEl('button', {
            cls: 'flashcard-activation-button',
            text: 'Activate'
        });

        button.addEventListener('click', async () => {
            const licenseKey = input.value.trim();
            if (!licenseKey) {
                new Notice('Please enter a license key');
                return;
            }

            const activated = await this.licenseManager.activateLicense(licenseKey);
            if (activated) {
                new Notice('HiCard activated successfully!');
                this.render();
            } else {
                new Notice('Invalid license key');
            }
        });
    }

    deactivate() {
        this.isActive = false;
        this.container.empty();
        this.container.removeClass('flashcard-mode');
        // 移除所有可能的 flashcard 相关类
        this.container.removeClass('flashcard-container');
        this.container.removeClass('is-flipped');
        // 确保移除所有子元素
        const cardContainer = this.container.querySelector('.flashcard-container');
        if (cardContainer) {
            cardContainer.remove();
        }
    }

    private render() {
        if (!this.isActive) {
            this.deactivate();
            return;
        }
        
        this.container.empty();
        // 添加 flashcard-mode 类以启用特定样式
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

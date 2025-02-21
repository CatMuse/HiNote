import { Notice, setIcon } from "obsidian";
import { HiNote } from "../../CommentStore";
import { LicenseManager } from "../../services/LicenseManager";
import { FSRSManager } from "../../services/FSRSManager";
import { FlashcardState, FSRS_RATING, FSRSRating } from "../../types/FSRSTypes";
import { t } from "../../i18n";

export class FlashcardComponent {
    private container: HTMLElement;
    private currentIndex: number = 0;
    private isFlipped: boolean = false;
    private cards: FlashcardState[] = [];
    private isActive: boolean = false;
    private licenseManager: LicenseManager;
    private fsrsManager: FSRSManager;
    private currentCard: FlashcardState | null = null;
    
    // 评分按钮配置
    private readonly ratingButtons = [
        { label: 'Again', rating: FSRS_RATING.AGAIN, key: '1', color: 'red', icon: 'cross' },
        { label: 'Hard', rating: FSRS_RATING.HARD, key: '2', color: 'orange', icon: 'alert-circle' },
        { label: 'Good', rating: FSRS_RATING.GOOD, key: '3', color: 'green', icon: 'check' },
        { label: 'Easy', rating: FSRS_RATING.EASY, key: '4', color: 'blue', icon: 'check-circle' }
    ];

    constructor(container: HTMLElement, plugin: any) {
        this.container = container;
        this.fsrsManager = new FSRSManager(plugin);
        
        // 添加键盘快捷键
        this.setupKeyboardShortcuts();
    }

    setLicenseManager(licenseManager: LicenseManager) {
        this.licenseManager = licenseManager;
    }



    setCards(highlights: HiNote[]) {
        // Filter out virtual highlights and convert to FlashcardState
        const realHighlights = highlights.filter(highlight => !highlight.isVirtual);
        realHighlights.forEach(highlight => {
            const filePath = highlight.filePath || '';
            const existingCard = this.fsrsManager.getCardsByFile(filePath)
                .find(card => card.text === highlight.text);
            
            if (!existingCard) {
                this.fsrsManager.addCard(
                    highlight.text,
                    highlight.comments?.[0]?.content || "",
                    filePath
                );
            }
        });
        
        // 获取所有到期的卡片
        this.cards = this.fsrsManager.getDueCards();
        this.currentIndex = 0;
        this.isFlipped = false;
        this.currentCard = this.cards[0] || null;
        
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
        if (!this.isActive || !this.currentCard) {
            this.deactivate();
            return;
        }
        
        this.container.empty();
        this.container.addClass('flashcard-mode');

        // 创建进度指示器
        const progressContainer = this.container.createEl("div", { cls: "flashcard-progress-container" });
        const progress = this.fsrsManager.getProgress();
        
        progressContainer.createEl("div", {
            cls: "flashcard-stats",
            text: `Due: ${progress.due} | New: ${progress.newCards} | Learned: ${progress.learned} | Retention: ${(progress.retention * 100).toFixed(1)}%`
        });

        // 创建闪卡容器
        const cardContainer = this.container.createEl("div", { cls: "flashcard-container" });
        
        if (this.cards.length === 0) {
            cardContainer.createEl("div", { 
                cls: "flashcard-empty", 
                text: t("No cards due for review") 
            });
            return;
        }

        // 创建卡片
        const card = cardContainer.createEl("div", { cls: "flashcard" });
        
        // 创建卡片正面
        const frontSide = card.createEl("div", { 
            cls: "flashcard-side flashcard-front"
        });
        frontSide.createEl("div", {
            cls: "flashcard-content",
            text: this.currentCard.text
        });

        // 创建卡片背面
        const backSide = card.createEl("div", { 
            cls: "flashcard-side flashcard-back"
        });
        backSide.createEl("div", {
            cls: "flashcard-content",
            text: this.currentCard.answer
        });

        if (this.isFlipped) {
            card.addClass('is-flipped');
            
            // 创建评分按钮
            const ratingContainer = cardContainer.createEl("div", { cls: "flashcard-rating" });
            
            this.ratingButtons.forEach(btn => {
                const button = ratingContainer.createEl("button", {
                    cls: `flashcard-rating-btn flashcard-rating-${btn.color}`,
                    attr: {
                        'data-rating': btn.rating.toString(),
                        'title': `${btn.label} (${btn.key})`
                    }
                });
                
                // 添加图标和文本
                const iconSpan = button.createSpan({ cls: 'flashcard-rating-icon' });
                setIcon(iconSpan, btn.icon);
                button.createSpan({ text: btn.label, cls: 'flashcard-rating-text' });
                button.addEventListener("click", () => this.rateCard(btn.rating));
            });
        } else {
            // 只在正面显示翻转按钮
            const flipButton = cardContainer.createEl("button", { 
                cls: "flashcard-flip-btn",
                text: t("Show Answer")
            });
            flipButton.addEventListener("click", () => this.flipCard());
        }

        // 显示进度
        cardContainer.createEl("div", { 
            cls: "flashcard-counter",
            text: `${this.currentIndex + 1} / ${this.cards.length}`
        });

        // 如果有关联文件，显示文件名
        if (this.currentCard.filePath) {
            cardContainer.createEl("div", {
                cls: "flashcard-source",
                text: this.currentCard.filePath.split('/').pop() || ""
            });
        }
    }

    private setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                this.flipCard();
            } else if (this.isFlipped) {
                const rating = this.ratingButtons.find(btn => btn.key === e.key);
                if (rating) {
                    e.preventDefault();
                    this.rateCard(rating.rating);
                }
            }
        });
    }

    private rateCard(rating: FSRSRating) {
        if (!this.currentCard) return;
        
        // 更新卡片状态
        const updatedCard = this.fsrsManager.reviewCard(this.currentCard.id, rating);
        if (updatedCard) {
            // 移除当前卡片
            this.cards.splice(this.currentIndex, 1);
            
            // 如果还有卡片，继续显示
            if (this.cards.length > 0) {
                this.currentIndex = this.currentIndex % this.cards.length;
                this.currentCard = this.cards[this.currentIndex];
            } else {
                this.currentCard = null;
            }
            
            this.isFlipped = false;
            this.render();
        }
    }

    private flipCard() {
        if (!this.currentCard) return;
        
        this.isFlipped = !this.isFlipped;
        const cardEl = this.container.querySelector(".flashcard");
        if (!cardEl) return;
        
        if (this.isFlipped) {
            cardEl.addClass('is-flipped');
        } else {
            cardEl.removeClass('is-flipped');
        }
        
        // 重新渲染以显示或隐藏评分按钮
        this.render();
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

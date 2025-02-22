import { 
    FlashcardState, 
    FSRSParameters, 
    DEFAULT_FSRS_PARAMETERS,
    FSRSRating,
    FSRS_RATING
} from '../types/FSRSTypes';

export class FSRSService {
    private params: FSRSParameters;

    constructor(params: Partial<FSRSParameters> = {}) {
        this.params = { ...DEFAULT_FSRS_PARAMETERS, ...params };
    }

    private calculateRetrievability(elapsedDays: number, stability: number): number {
        const DECAY = -0.5;
        const FACTOR = 19/81;
        return Math.pow(1 + FACTOR * (elapsedDays / stability), DECAY);
    }

    public calculateNextInterval(requestedRetention: number, stability: number): number {
        const DECAY = -0.5;
        const FACTOR = 19/81;
        const interval = (stability / FACTOR) * (Math.pow(requestedRetention, 1/DECAY) - 1);
        
        // 确保间隔在合理范围内
        return Math.min(Math.max(1, interval), this.params.maximum_interval);
    }

    private calculateInitialDifficulty(rating: FSRSRating): number {
        const w = this.params.w;
        return w[3] - Math.exp(w[4] * (rating - 1)) + 1;
    }

    private updateDifficulty(oldDifficulty: number, rating: FSRSRating): number {
        const w = this.params.w;
        // 计算难度变化
        const difficultyDelta = -w[5] * (rating - 3);
        // 应用线性阻尼
        let newDifficulty = oldDifficulty + difficultyDelta * (10 - oldDifficulty) / 9;
        
        // 均值回归
        const meanReversionTarget = this.calculateInitialDifficulty(FSRS_RATING.GOOD);
        newDifficulty = w[6] * meanReversionTarget + (1 - w[6]) * newDifficulty;
        
        // 确保难度在合理范围内
        return Math.min(Math.max(1, newDifficulty), 10);
    }

    private updateStability(oldStability: number, retrievability: number, rating: FSRSRating): number {
        const w = this.params.w;
        let stabilityMultiplier = 0;

        if (rating === FSRS_RATING.AGAIN) {
            stabilityMultiplier = w[7];
        } else if (rating === FSRS_RATING.HARD) {
            stabilityMultiplier = w[8];
        } else if (rating === FSRS_RATING.GOOD) {
            stabilityMultiplier = w[9] + w[10] * (1 - retrievability);
        } else if (rating === FSRS_RATING.EASY) {
            stabilityMultiplier = w[11] + w[12] * (1 - retrievability);
        }

        const newStability = oldStability * stabilityMultiplier;
        
        // 确保稳定性在合理范围内
        return Math.max(0.1, newStability);
    }

    public initializeCard(text: string, answer: string, filePath?: string): FlashcardState {
        const now = Date.now();
        return {
            id: `card-${now}-${Math.random().toString(36).substr(2, 9)}`,
            difficulty: 5, // 初始难度设为中等
            stability: 0.1, // 初始稳定性很低
            retrievability: 1, // 初始可提取性为最高
            lastReview: 0, // 从未复习过
            nextReview: now, // 立即可以复习
            reviewHistory: [],
            text,
            answer,
            filePath,
            createdAt: now // 创建时间为当前时间
        };
    }

    public reviewCard(card: FlashcardState, rating: FSRSRating): FlashcardState {
        const now = Date.now();
        const elapsedDays = card.lastReview === 0 ? 0 : 
            (now - card.lastReview) / (24 * 60 * 60 * 1000);

        // 首次复习
        if (card.lastReview === 0) {
            const difficulty = this.calculateInitialDifficulty(rating);
            const stability = rating === FSRS_RATING.AGAIN ? 0.1 : 
                rating === FSRS_RATING.HARD ? 0.5 : 
                rating === FSRS_RATING.GOOD ? 2 : 4;
            
            return {
                ...card,
                difficulty,
                stability,
                retrievability: 1,
                lastReview: now,
                nextReview: now + stability * 24 * 60 * 60 * 1000,
                reviewHistory: [...card.reviewHistory, { timestamp: now, rating, elapsed: elapsedDays }]
            };
        }

        // 计算当前可提取性
        const retrievability = this.calculateRetrievability(elapsedDays, card.stability);
        
        // 更新难度和稳定性
        const newDifficulty = this.updateDifficulty(card.difficulty, rating);
        const newStability = this.updateStability(card.stability, retrievability, rating);
        
        // 计算下次复习时间
        const nextInterval = this.calculateNextInterval(this.params.request_retention, newStability);
        
        return {
            ...card,
            difficulty: newDifficulty,
            stability: newStability,
            retrievability,
            lastReview: now,
            nextReview: now + nextInterval * 24 * 60 * 60 * 1000,
            reviewHistory: [...card.reviewHistory, { timestamp: now, rating, elapsed: elapsedDays }]
        };
    }

    public isDue(card: FlashcardState): boolean {
        return Date.now() >= card.nextReview;
    }

    public getReviewableCards(cards: FlashcardState[]): FlashcardState[] {
        return cards.filter(card => this.isDue(card))
            .sort((a, b) => a.nextReview - b.nextReview);
    }
}

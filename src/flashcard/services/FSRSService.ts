import { 
    FlashcardState, 
    FSRSParameters, 
    DEFAULT_FSRS_PARAMETERS,
    FSRSRating
} from '../types/FSRSTypes';
import { FSRSAdapter } from './FSRSAdapter';
import { normalizeFSRSParameters } from './FSRSParameters';

export class FSRSService {
    private params: FSRSParameters;
    private adapter: FSRSAdapter;

    constructor(params: Partial<FSRSParameters> = {}) {
        this.params = normalizeFSRSParameters({ ...DEFAULT_FSRS_PARAMETERS, ...params });
        this.adapter = new FSRSAdapter(this.params);
    }

    // 所有的算法实现都委托给 FSRSAdapter 处理

    public initializeCard(text: string, answer: string, filePath?: string): FlashcardState {
        // 使用 adapter 初始化卡片
        return this.adapter.initializeCard(text, answer, filePath);
    }

    public reviewCard(card: FlashcardState, rating: FSRSRating): FlashcardState {
        // 使用 adapter 复习卡片
        return this.adapter.reviewCard(card, rating);
    }

    public isDue(card: FlashcardState): boolean {
        // 使用 adapter 判断卡片是否到期
        return this.adapter.isDue(card);
    }

    public getReviewableCards(cards: FlashcardState[]): FlashcardState[] {
        return cards.filter(card => this.isDue(card))
            .sort((a, b) => a.nextReview - b.nextReview);
    }

    /**
     * 获取当前 FSRS 参数
     * @returns 当前使用的 FSRS 参数
     */
    public getParameters(): FSRSParameters {
        return { ...this.params, w: [...this.params.w] };
    }

    /**
     * 设置 FSRS 参数
     * @param params 要设置的 FSRS 参数
     */
    public setParameters(params: Partial<FSRSParameters>): void {
        const next = normalizeFSRSParameters({ ...this.params, ...params });
        const adapter = new FSRSAdapter(next);
        this.params = next;
        this.adapter = adapter;
    }

    /** Upgrade only the exact legacy defaults; never replace custom weights. */
    public loadParameters(params: Partial<FSRSParameters>): void {
        this.setParameters(normalizeFSRSParameters({ ...DEFAULT_FSRS_PARAMETERS, ...params }, true));
    }

    /**
     * 重置 FSRS 参数为默认值
     */
    public resetParameters(): void {
        this.setParameters(DEFAULT_FSRS_PARAMETERS);
    }
    
    /**
     * 获取卡片在不同评分下的预测结果
     * @param card 要预测的卡片
     * @returns 不同评分下的预测结果
     */
    public getSchedulingCards(card: FlashcardState): Record<FSRSRating, FlashcardState> {
        return this.adapter.getSchedulingCards(card);
    }
}

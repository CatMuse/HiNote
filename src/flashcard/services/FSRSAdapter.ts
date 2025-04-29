import { 
    Card, 
    createEmptyCard, 
    fsrs, 
    generatorParameters, 
    FSRSParameters as TsFSRSParameters, 
    Rating,
    Grade,
    State, 
    RecordLog,
    RecordLogItem
} from 'ts-fsrs';

import { 
    FlashcardState, 
    FSRSParameters, 
    FSRSRating, 
    FSRS_RATING 
} from '../types/FSRSTypes';

/**
 * FSRSAdapter 类
 * 用于将 ts-fsrs 库与现有的 FSRS 系统进行适配
 */
export class FSRSAdapter {
    private fsrsInstance: ReturnType<typeof fsrs>;
    private params: TsFSRSParameters;

    constructor(customParams: Partial<FSRSParameters> = {}) {
        // 将自定义参数转换为 ts-fsrs 库所需的格式
        this.params = this.convertToTsFSRSParams(customParams);
        this.fsrsInstance = fsrs(this.params);
    }

    /**
     * 将自定义参数转换为 ts-fsrs 库所需的格式
     */
    private convertToTsFSRSParams(customParams: Partial<FSRSParameters>): TsFSRSParameters {
        // 从自定义参数中提取相关配置
        const { 
            request_retention = 0.9, 
            maximum_interval = 36500,
            w = [] 
        } = customParams;

        // 使用 ts-fsrs 的 generatorParameters 生成参数
        return generatorParameters({
            request_retention,
            maximum_interval,
            // 可以根据需要添加更多参数
            enable_fuzz: true,
            enable_short_term: false
        });
    }

    /**
     * 将 FlashcardState 转换为 ts-fsrs 的 Card 类型
     */
    public toTsFSRSCard(card: FlashcardState): Card {
        // 如果是新卡片，使用 createEmptyCard
        if (card.lastReview === 0) {
            return createEmptyCard(new Date(card.createdAt));
        }

        // 确定卡片状态
        let state: State = State.New;
        if (card.reviews > 0) {
            if (card.lapses > 0) {
                state = State.Relearning;
            } else {
                state = State.Review;
            }
        }

        // 创建 ts-fsrs Card 对象
        return {
            due: new Date(card.nextReview),
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: card.lastReview ? (Date.now() - card.lastReview) / (24 * 60 * 60 * 1000) : 0,
            scheduled_days: card.lastReview ? (card.nextReview - card.lastReview) / (24 * 60 * 60 * 1000) : 0,
            reps: card.reviews,
            lapses: card.lapses,
            state: state,
            last_review: card.lastReview ? new Date(card.lastReview) : undefined
        };
    }

    /**
     * 将 FSRSRating 转换为 ts-fsrs 的 Rating
     */
    public convertRating(rating: FSRSRating): Rating {
        switch (rating) {
            case FSRS_RATING.AGAIN:
                return Rating.Again;
            case FSRS_RATING.HARD:
                return Rating.Hard;
            case FSRS_RATING.GOOD:
                return Rating.Good;
            case FSRS_RATING.EASY:
                return Rating.Easy;
            default:
                return Rating.Good;
        }
    }

    /**
     * 将 ts-fsrs 的 Card 和 ReviewLog 转换回 FlashcardState
     */
    public fromTsFSRSCard(originalCard: FlashcardState, recordItem: RecordLogItem): FlashcardState {
        const { card, log } = recordItem;
        
        return {
            ...originalCard,
            difficulty: card.difficulty,
            stability: card.stability,
            retrievability: Math.exp(Math.log(0.9) * card.elapsed_days / card.stability), // 计算可提取性
            lastReview: log.review.getTime(),
            nextReview: card.due.getTime(),
            reviews: card.reps,
            lapses: card.lapses,
            reviewHistory: [
                ...originalCard.reviewHistory,
                {
                    timestamp: log.review.getTime(),
                    rating: this.convertTsFSRSRatingToFSRSRating(log.rating),
                    elapsed: log.elapsed_days
                }
            ]
        };
    }

    /**
     * 将 ts-fsrs 的 Rating 转换回 FSRSRating
     */
    private convertTsFSRSRatingToFSRSRating(rating: Rating): FSRSRating {
        switch (rating) {
            case Rating.Again:
                return FSRS_RATING.AGAIN;
            case Rating.Hard:
                return FSRS_RATING.HARD;
            case Rating.Good:
                return FSRS_RATING.GOOD;
            case Rating.Easy:
                return FSRS_RATING.EASY;
            default:
                return FSRS_RATING.GOOD;
        }
    }

    /**
     * 初始化新卡片
     */
    public initializeCard(text: string, answer: string, filePath?: string): FlashcardState {
        const now = Date.now();
        const emptyCard = createEmptyCard(new Date(now));
        
        return {
            id: `card-${now}-${Math.random().toString(36).substr(2, 9)}`,
            difficulty: emptyCard.difficulty,
            stability: emptyCard.stability,
            retrievability: 1,
            lastReview: 0,
            nextReview: now,
            reviews: 0,
            lapses: 0,
            reviewHistory: [],
            text,
            answer,
            filePath,
            createdAt: now
        };
    }

    /**
     * 复习卡片
     */
    public reviewCard(card: FlashcardState, rating: FSRSRating): FlashcardState {
        // 转换为 ts-fsrs 卡片
        const tsCard = this.toTsFSRSCard(card);
        const tsRating = this.convertRating(rating);
        const now = new Date();
        
        // 使用 ts-fsrs 的 next 方法进行评分
        // 确保 tsRating 不是 Rating.Manual，因为 next 方法期望一个 Grade 类型
        // Grade 类型是排除了 Rating.Manual 的 Rating 类型
        if (tsRating !== Rating.Manual) {
            const result = this.fsrsInstance.next(tsCard, now, tsRating as Grade);
            
            // 转换回 FlashcardState
            return this.fromTsFSRSCard(card, result);
        } else {
            // 如果是 Manual 评分，返回原始卡片
            return card;
        }
    }

    /**
     * 获取卡片在不同评分下的预测结果
     */
    public getSchedulingCards(card: FlashcardState): Record<FSRSRating, FlashcardState> {
        // 转换为 ts-fsrs 卡片
        const tsCard = this.toTsFSRSCard(card);
        const now = new Date();
        
        // 使用 ts-fsrs 的 repeat 方法获取所有可能的评分结果
        // 在 ts-fsrs 4.x 版本中，repeat 返回的是一个 Record<Grade, RecordLogItem>
        const recordLog = this.fsrsInstance.repeat(tsCard, now);
        
        // 转换回 FlashcardState 并按评分分类
        // 使用类型断言确保类型安全
        return {
            [FSRS_RATING.AGAIN]: this.fromTsFSRSCard(card, recordLog[Rating.Again as Grade]),
            [FSRS_RATING.HARD]: this.fromTsFSRSCard(card, recordLog[Rating.Hard as Grade]),
            [FSRS_RATING.GOOD]: this.fromTsFSRSCard(card, recordLog[Rating.Good as Grade]),
            [FSRS_RATING.EASY]: this.fromTsFSRSCard(card, recordLog[Rating.Easy as Grade])
        };
    }

    /**
     * 判断卡片是否到期
     */
    public isDue(card: FlashcardState): boolean {
        return Date.now() >= card.nextReview;
    }

    /**
     * 获取当前参数
     */
    public getParameters(): TsFSRSParameters {
        return { ...this.params };
    }

    /**
     * 设置参数
     */
    public setParameters(params: Partial<FSRSParameters>): void {
        this.params = this.convertToTsFSRSParams(params);
        this.fsrsInstance = fsrs(this.params);
    }
}

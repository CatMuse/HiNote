export interface ReviewLog {
    timestamp: number;
    rating: number;     // 1-4 分别对应 Again/Hard/Good/Easy
    elapsed: number;    // 距离上次复习的天数
}

export interface FlashcardState {
    id: string;           // 卡片唯一标识符
    difficulty: number;   // 卡片难度
    stability: number;    // 记忆稳定性
    retrievability: number; // 可提取性
    lastReview: number;   // 上次复习时间戳
    nextReview: number;   // 下次复习时间戳
    reviewHistory: ReviewLog[];
    text: string;         // 卡片正面内容
    answer: string;       // 卡片背面内容
    filePath?: string;    // 关联的文件路径
}

export interface FlashcardProgress {
    due: number;        // 今天待复习数量
    newCards: number;   // 新卡片数量
    learned: number;    // 已学习数量
    retention: number;  // 记忆保持率
}

export interface FSRSGlobalStats {
    totalReviews: number;
    averageRetention: number;
    streakDays: number;
    lastReviewDate: number;
}

export interface CardGroup {
    id: string;           // 分组唯一标识符
    name: string;         // 分组名称
    filter: string;       // 过滤条件，支持文件名和标签
    createdTime: number;  // 创建时间
    sortOrder: number;    // 排序顺序
}

export interface HiCardState {
    currentGroupName: string;
    currentIndex: number;
    isFlipped: boolean;
}

export interface FSRSStorage {
    version: string;
    cards: { [id: string]: FlashcardState };
    globalStats: FSRSGlobalStats;
    cardGroups: CardGroup[];  // 用户自定义的卡片分组
    uiState: HiCardState;  // 保存UI状态
}

export const FSRS_RATING = {
    AGAIN: 1,
    HARD: 2,
    GOOD: 3,
    EASY: 4,
} as const;

export type FSRSRating = typeof FSRS_RATING[keyof typeof FSRS_RATING];

export interface FSRSParameters {
    request_retention: number;   // 目标记忆保持率
    maximum_interval: number;    // 最大间隔天数
    w: number[];                // FSRS 算法参数
}

export const DEFAULT_FSRS_PARAMETERS: FSRSParameters = {
    request_retention: 0.9,
    maximum_interval: 36500,
    w: [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 
        0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755]
};

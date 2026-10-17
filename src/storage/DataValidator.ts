import { HighlightRecord as HiNote, CommentItem } from '../types/highlight';

type JsonRecord = Record<string, unknown>;
type SanitizedHighlight = Partial<HiNote> & {
    created?: number;
    updated?: number;
};
type SanitizedComment = Partial<CommentItem> & {
    created?: number;
    updated?: number;
};

/**
 * 数据验证器
 */
export class DataValidator {
    private static isRecord(value: unknown): value is JsonRecord {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    private static isFiniteNumber(value: unknown): value is number {
        return typeof value === 'number' && Number.isFinite(value);
    }

    private static isStringArray(value: unknown): value is string[] {
        return Array.isArray(value) && value.every(item => typeof item === 'string');
    }

    /**
     * 验证高亮数据结构
     * @param data 高亮数据
     * @returns 验证结果
     */
    static validateHighlightData(data: unknown): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!this.isRecord(data)) {
            errors.push('数据必须是对象');
            return { valid: false, errors };
        }

        // 验证版本
        if (!data.version || typeof data.version !== 'string') {
            errors.push('缺少有效的版本信息');
        }

        // 验证lastModified
        if (data.lastModified && typeof data.lastModified !== 'number') {
            errors.push('lastModified必须是数字');
        }

        // 验证highlights对象
        if (!this.isRecord(data.highlights)) {
            errors.push('缺少highlights对象');
            return { valid: false, errors };
        }

        // 验证每个高亮
        for (const [id, highlight] of Object.entries(data.highlights)) {
            const highlightErrors = this.validateHighlight(id, highlight);
            errors.push(...highlightErrors);
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * 验证单个高亮
     * @param id 高亮ID
     * @param highlight 高亮数据
     * @returns 错误列表
     */
    static validateHighlight(id: string, highlight: unknown): string[] {
        const errors: string[] = [];

        if (!this.isRecord(highlight)) {
            errors.push(`高亮 ${id}: 数据必须是对象`);
            return errors;
        }

        // 必需字段验证
        if (!highlight.text || typeof highlight.text !== 'string') {
            errors.push(`高亮 ${id}: 缺少有效的text字段`);
        }

        if (typeof highlight.position !== 'number') {
            errors.push(`高亮 ${id}: position必须是数字`);
        }

        if (typeof highlight.created !== 'number') {
            errors.push(`高亮 ${id}: created必须是数字`);
        }

        if (typeof highlight.updated !== 'number') {
            errors.push(`高亮 ${id}: updated必须是数字`);
        }

        // 可选字段验证
        if (highlight.syntax !== undefined && highlight.syntax !== 'markdown' &&
            highlight.syntax !== 'html' && highlight.syntax !== 'custom') {
            errors.push(`高亮 ${id}: syntax必须是有效的高亮格式`);
        }
        if (highlight.backgroundColor && typeof highlight.backgroundColor !== 'string') {
            errors.push(`高亮 ${id}: backgroundColor必须是字符串`);
        }

        if (highlight.favoritedAt !== undefined && (typeof highlight.favoritedAt !== 'number' ||
            !Number.isFinite(highlight.favoritedAt) || highlight.favoritedAt <= 0)) {
            errors.push(`高亮 ${id}: favoritedAt必须是有效时间戳`);
        }

        if (highlight.blockId && typeof highlight.blockId !== 'string') {
            errors.push(`高亮 ${id}: blockId必须是字符串`);
        }

        if (highlight.contextBefore && typeof highlight.contextBefore !== 'string') {
            errors.push(`高亮 ${id}: contextBefore必须是字符串`);
        }

        if (highlight.contextAfter && typeof highlight.contextAfter !== 'string') {
            errors.push(`高亮 ${id}: contextAfter必须是字符串`);
        }

        if (highlight.textFingerprint && typeof highlight.textFingerprint !== 'string') {
            errors.push(`高亮 ${id}: textFingerprint必须是字符串`);
        }

        if (highlight.isCloze && typeof highlight.isCloze !== 'boolean') {
            errors.push(`高亮 ${id}: isCloze必须是布尔值`);
        }

        // 验证评论数组
        if (highlight.comments) {
            if (!Array.isArray(highlight.comments)) {
                errors.push(`高亮 ${id}: comments必须是数组`);
            } else {
                highlight.comments.forEach((comment: unknown, index: number) => {
                    const commentErrors = this.validateComment(comment, `${id}.comments[${index}]`);
                    errors.push(...commentErrors);
                });
            }
        }

        return errors;
    }

    /**
     * 验证评论数据
     * @param comment 评论数据
     * @param path 路径（用于错误信息）
     * @returns 错误列表
     */
    static validateComment(comment: unknown, path: string): string[] {
        const errors: string[] = [];

        if (!this.isRecord(comment)) {
            errors.push(`${path}: 评论数据必须是对象`);
            return errors;
        }

        if (!comment.id || typeof comment.id !== 'string') {
            errors.push(`${path}: 缺少有效的id字段`);
        }

        if (!comment.content || typeof comment.content !== 'string') {
            errors.push(`${path}: 缺少有效的content字段`);
        }

        if (typeof comment.created !== 'number') {
            errors.push(`${path}: created必须是数字`);
        }

        if (typeof comment.updated !== 'number') {
            errors.push(`${path}: updated必须是数字`);
        }

        return errors;
    }

    /**
     * 验证闪卡数据结构
     * @param data 闪卡数据
     * @returns 验证结果
     */
    static validateFlashcardData(data: unknown): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!this.isRecord(data)) {
            errors.push('闪卡数据必须是对象');
            return { valid: false, errors };
        }

        // 验证版本
        if (!data.version || typeof data.version !== 'string') {
            errors.push('缺少有效的版本信息');
        }

        if (!this.isRecord(data.cards)) {
            errors.push('缺少有效的cards对象');
        } else {
            for (const [id, card] of Object.entries(data.cards)) {
                errors.push(...this.validateFlashcard(id, card));
            }
        }

        if (!this.isRecord(data.globalStats)) {
            errors.push('缺少有效的globalStats对象');
        } else {
            for (const field of ['totalReviews', 'averageRetention', 'streakDays', 'lastReviewDate']) {
                if (!this.isFiniteNumber(data.globalStats[field])) errors.push(`globalStats.${field}必须是有限数字`);
            }
        }

        if (!Array.isArray(data.cardGroups)) {
            errors.push('缺少有效的cardGroups数组');
        } else {
            data.cardGroups.forEach((group, index) => errors.push(...this.validateCardGroup(group, index)));
        }

        if (!this.isRecord(data.uiState)) errors.push('缺少有效的uiState对象');

        if (!Array.isArray(data.dailyStats)) {
            errors.push('缺少有效的dailyStats数组');
        } else {
            data.dailyStats.forEach((stats, index) => {
                if (!this.isRecord(stats)) {
                    errors.push(`dailyStats[${index}]必须是对象`);
                    return;
                }
                for (const field of ['date', 'newCardsLearned', 'cardsReviewed', 'reviewCount', 'newCount', 'againCount', 'hardCount', 'goodCount', 'easyCount']) {
                    if (!this.isFiniteNumber(stats[field])) errors.push(`dailyStats[${index}].${field}必须是有限数字`);
                }
            });
        }

        if (data.parameters !== undefined) errors.push(...this.validateFlashcardParameters(data.parameters));

        return { valid: errors.length === 0, errors };
    }

    private static validateFlashcard(id: string, card: unknown): string[] {
        const errors: string[] = [];
        const path = `cards.${id}`;
        if (!this.isRecord(card)) return [`${path}必须是对象`];
        if (card.id !== id) errors.push(`${path}.id必须与存储键一致`);
        for (const field of ['text', 'answer']) {
            if (typeof card[field] !== 'string') errors.push(`${path}.${field}必须是字符串`);
        }
        for (const field of ['difficulty', 'stability', 'retrievability', 'lastReview', 'nextReview', 'createdAt', 'reviews', 'lapses']) {
            if (!this.isFiniteNumber(card[field])) errors.push(`${path}.${field}必须是有限数字`);
        }
        if (!Array.isArray(card.reviewHistory)) {
            errors.push(`${path}.reviewHistory必须是数组`);
        } else {
            card.reviewHistory.forEach((review, index) => {
                if (!this.isRecord(review)
                    || !this.isFiniteNumber(review.timestamp)
                    || !this.isFiniteNumber(review.elapsed)
                    || !this.isFiniteNumber(review.rating)
                    || review.rating < 1 || review.rating > 4) {
                    errors.push(`${path}.reviewHistory[${index}]不是有效的复习记录`);
                }
            });
        }
        if (card.groupIds !== undefined && !this.isStringArray(card.groupIds)) errors.push(`${path}.groupIds必须是字符串数组`);
        if (card.suspended !== undefined && typeof card.suspended !== 'boolean') errors.push(`${path}.suspended必须是布尔值`);
        if (card.frontCustomized !== undefined && typeof card.frontCustomized !== 'boolean') errors.push(`${path}.frontCustomized必须是布尔值`);
        if (card.sourceType !== undefined && card.sourceType !== 'highlight' && card.sourceType !== 'comment') errors.push(`${path}.sourceType无效`);
        return errors;
    }

    private static validateCardGroup(group: unknown, index: number): string[] {
        const errors: string[] = [];
        const path = `cardGroups[${index}]`;
        if (!this.isRecord(group)) return [`${path}必须是对象`];
        for (const field of ['id', 'name', 'filter']) {
            if (typeof group[field] !== 'string') errors.push(`${path}.${field}必须是字符串`);
        }
        for (const field of ['createdTime', 'sortOrder']) {
            if (!this.isFiniteNumber(group[field])) errors.push(`${path}.${field}必须是有限数字`);
        }
        if (group.cardIds !== undefined && !this.isStringArray(group.cardIds)) errors.push(`${path}.cardIds必须是字符串数组`);
        return errors;
    }

    private static validateFlashcardParameters(parameters: unknown): string[] {
        if (!this.isRecord(parameters)) return ['parameters必须是对象'];
        const errors: string[] = [];
        for (const field of ['request_retention', 'maximum_interval', 'newCardsPerDay', 'reviewsPerDay']) {
            if (!this.isFiniteNumber(parameters[field])) errors.push(`parameters.${field}必须是有限数字`);
        }
        if (!Array.isArray(parameters.w) || !parameters.w.every(value => this.isFiniteNumber(value))) errors.push('parameters.w必须是有限数字数组');
        return errors;
    }

    /**
     * 验证文件映射数据
     * @param data 映射数据
     * @returns 验证结果
     */
    static validateFileMappingData(data: unknown): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!this.isRecord(data)) {
            errors.push('映射数据必须是对象');
            return { valid: false, errors };
        }

        if (!data.version || typeof data.version !== 'string') {
            errors.push('缺少有效的版本信息');
        }

        if (!data.mapping || typeof data.mapping !== 'object') {
            errors.push('缺少mapping对象');
        }

        if (typeof data.lastUpdated !== 'number') {
            errors.push('lastUpdated必须是数字');
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * 清理和标准化高亮数据
     * @param highlight 原始高亮数据
     * @returns 清理后的高亮数据
     */
    static sanitizeHighlight(highlight: unknown): SanitizedHighlight {
        const sanitized: SanitizedHighlight = {};

        if (!this.isRecord(highlight)) {
            return sanitized;
        }

        // 必需字段
        if (highlight.text && typeof highlight.text === 'string') {
            sanitized.text = highlight.text;
        }

        if (typeof highlight.position === 'number') {
            sanitized.position = highlight.position;
        }

        if (typeof highlight.created === 'number') {
            sanitized.created = highlight.created;
        } else if (typeof highlight.createdAt === 'number') {
            sanitized.created = highlight.createdAt;
        }

        if (typeof highlight.updated === 'number') {
            sanitized.updated = highlight.updated;
        } else if (typeof highlight.updatedAt === 'number') {
            sanitized.updated = highlight.updatedAt;
        }

        if (typeof highlight.favoritedAt === "number" && Number.isFinite(highlight.favoritedAt) && highlight.favoritedAt > 0) {
            sanitized.favoritedAt = highlight.favoritedAt;
        }

        // 可选字段
        if (highlight.syntax === 'markdown' || highlight.syntax === 'html' || highlight.syntax === 'custom') {
            sanitized.syntax = highlight.syntax;
        }
        if (highlight.backgroundColor && typeof highlight.backgroundColor === 'string') {
            sanitized.backgroundColor = highlight.backgroundColor;
        }

        if (highlight.blockId && typeof highlight.blockId === 'string') {
            sanitized.blockId = highlight.blockId;
        }

        if (highlight.contextBefore && typeof highlight.contextBefore === 'string') {
            sanitized.contextBefore = highlight.contextBefore;
        }

        if (highlight.contextAfter && typeof highlight.contextAfter === 'string') {
            sanitized.contextAfter = highlight.contextAfter;
        }

        if (highlight.textFingerprint && typeof highlight.textFingerprint === 'string') {
            sanitized.textFingerprint = highlight.textFingerprint;
        }

        if (typeof highlight.isCloze === 'boolean') {
            sanitized.isCloze = highlight.isCloze;
        }

        if (typeof highlight.paragraphOffset === 'number') {
            sanitized.paragraphOffset = highlight.paragraphOffset;
        }

        // 处理评论数组
        if (Array.isArray(highlight.comments)) {
            sanitized.comments = highlight.comments
                .filter((comment: unknown) => this.isRecord(comment))
                .map((comment: unknown) => this.sanitizeComment(comment))
                .filter((comment: SanitizedComment): comment is CommentItem => Boolean(comment.id && comment.content));
        }

        return sanitized;
    }

    /**
     * 清理和标准化评论数据
     * @param comment 原始评论数据
     * @returns 清理后的评论数据
     */
    static sanitizeComment(comment: unknown): SanitizedComment {
        const sanitized: SanitizedComment = {};

        if (!this.isRecord(comment)) {
            return sanitized;
        }

        if (comment.id && typeof comment.id === 'string') {
            sanitized.id = comment.id;
        }

        if (comment.content && typeof comment.content === 'string') {
            sanitized.content = comment.content;
        }

        if (typeof comment.created === 'number') {
            sanitized.created = comment.created;
        } else if (typeof comment.createdAt === 'number') {
            sanitized.created = comment.createdAt;
        }

        if (typeof comment.updated === 'number') {
            sanitized.updated = comment.updated;
        } else if (typeof comment.updatedAt === 'number') {
            sanitized.updated = comment.updatedAt;
        }

        return sanitized;
    }
}

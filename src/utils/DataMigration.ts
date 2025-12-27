import { IdGenerator } from './IdGenerator';
import { HighlightInfo as HiNote } from '../types';
import { FlashcardState } from '../flashcard/types/FSRSTypes';

/**
 * 数据迁移工具类
 * 用于将旧的ID格式迁移到新的统一ID格式
 */
export class DataMigration {
    /**
     * 迁移高亮ID到新格式
     * @param highlights 高亮数据
     * @param filePath 文件路径
     * @returns 迁移后的高亮数据和ID映射
     */
    static migrateHighlightIds(highlights: Record<string, HiNote>, filePath: string): {
        migratedHighlights: Record<string, HiNote>;
        idMapping: Record<string, string>; // 旧ID -> 新ID
    } {
        const migratedHighlights: Record<string, HiNote> = {};
        const idMapping: Record<string, string> = {};

        for (const [oldId, highlight] of Object.entries(highlights)) {
            // 生成新的稳定ID
            const newId = IdGenerator.generateHighlightId(
                filePath,
                highlight.position || 0,
                highlight.text
            );

            // 如果ID已经是新格式，则不需要迁移
            if (IdGenerator.isValidHighlightId(oldId) && oldId === newId) {
                migratedHighlights[oldId] = highlight;
                continue;
            }

            // 更新高亮对象的ID
            const migratedHighlight = {
                ...highlight,
                id: newId
            };

            migratedHighlights[newId] = migratedHighlight;
            idMapping[oldId] = newId;
        }

        return { migratedHighlights, idMapping };
    }

    /**
     * 迁移闪卡ID到新格式
     * @param cards 闪卡数据
     * @returns 迁移后的闪卡数据和ID映射
     */
    static migrateCardIds(cards: Record<string, FlashcardState>): {
        migratedCards: Record<string, FlashcardState>;
        idMapping: Record<string, string>; // 旧ID -> 新ID
    } {
        const migratedCards: Record<string, FlashcardState> = {};
        const idMapping: Record<string, string> = {};

        for (const [oldId, card] of Object.entries(cards)) {
            // 如果ID已经是新格式，则不需要迁移
            if (IdGenerator.isValidCardId(oldId)) {
                migratedCards[oldId] = card;
                continue;
            }

            // 生成新的ID
            const newId = IdGenerator.generateCardId();

            // 更新闪卡对象的ID
            const migratedCard = {
                ...card,
                id: newId
            };

            migratedCards[newId] = migratedCard;
            idMapping[oldId] = newId;
        }

        return { migratedCards, idMapping };
    }

    /**
     * 更新闪卡中的sourceId引用
     * @param cards 闪卡数据
     * @param highlightIdMapping 高亮ID映射
     * @returns 更新后的闪卡数据
     */
    static updateCardSourceIds(
        cards: Record<string, FlashcardState>, 
        highlightIdMapping: Record<string, string>
    ): Record<string, FlashcardState> {
        const updatedCards: Record<string, FlashcardState> = {};

        for (const [cardId, card] of Object.entries(cards)) {
            let updatedCard = { ...card };

            // 更新sourceId引用
            if (card.sourceId && highlightIdMapping[card.sourceId]) {
                updatedCard.sourceId = highlightIdMapping[card.sourceId];
            }

            updatedCards[cardId] = updatedCard;
        }

        return updatedCards;
    }

    /**
     * 检查数据是否需要迁移
     * @param data 插件数据
     * @returns 是否需要迁移
     */
    static needsMigration(data: any): boolean {
        // 检查高亮ID格式
        for (const filePath in data.highlights || {}) {
            const highlights = data.highlights[filePath];
            for (const highlightId in highlights) {
                if (!IdGenerator.isValidHighlightId(highlightId)) {
                    return true;
                }
            }
        }

        // 检查闪卡ID格式
        for (const cardId in data.cards || {}) {
            if (!IdGenerator.isValidCardId(cardId)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 执行完整的数据迁移
     * @param data 插件数据
     * @returns 迁移后的数据
     */
    static migrateData(data: any): any {
        const migratedData = { ...data };
        const allHighlightIdMappings: Record<string, string> = {};

        // 迁移高亮数据
        if (migratedData.highlights) {
            const migratedHighlights: Record<string, Record<string, HiNote>> = {};

            for (const [filePath, highlights] of Object.entries(migratedData.highlights)) {
                const { migratedHighlights: fileHighlights, idMapping } = 
                    this.migrateHighlightIds(highlights as Record<string, HiNote>, filePath);
                
                migratedHighlights[filePath] = fileHighlights;
                Object.assign(allHighlightIdMappings, idMapping);
            }

            migratedData.highlights = migratedHighlights;
        }

        // 迁移闪卡数据
        if (migratedData.cards) {
            const { migratedCards, idMapping: cardIdMapping } = 
                this.migrateCardIds(migratedData.cards);

            // 更新闪卡中的sourceId引用
            const updatedCards = this.updateCardSourceIds(migratedCards, allHighlightIdMappings);
            
            migratedData.cards = updatedCards;
        }

        return migratedData;
    }
}

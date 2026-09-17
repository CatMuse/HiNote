import { Notice, TFile } from 'obsidian';
import { HighlightInfo } from '../../../types/highlight';
import CommentPlugin from '../../../../main';
import { t } from '../../../i18n';

/**
 * 高亮闪卡管理器
 * 负责高亮相关的闪卡创建、删除和状态检查
 */
export class HighlightFlashcardManager {
    private plugin: CommentPlugin;
    
    constructor(plugin: CommentPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 检查高亮是否已创建闪卡
     */
    checkHasFlashcard(highlightId: string): boolean {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager || !highlightId) return false;
        
        // 通过 sourceId 查找闪卡
        const cards = fsrsManager.findCardsBySourceId(highlightId, 'highlight');
        return cards && cards.length > 0;
    }
    
    /**
     * 为高亮创建闪卡
     * @param highlight 高亮信息
     * @param fileName 文件名（可选）
     * @param silent 是否静默模式（不显示通知）
     * @returns 创建是否成功
     */
    async createFlashcard(
        highlight: HighlightInfo,
        _fileName?: string,
        silent: boolean = false
    ): Promise<boolean> {
        try {
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                if (!silent) new Notice(t('FSRS 管理器未初始化'));
                return false;
            }

            const file = highlight.filePath ? this.plugin.app.vault.getAbstractFileByPath(highlight.filePath) : null;
            if (!(file instanceof TFile)) throw new Error(t('No corresponding file found.'));
            const record = await this.plugin.highlightManager.ensureStoredHighlight(file, highlight);
            // Recheck after awaiting persistence: another view may have created it.
            if (fsrsManager.findCardsBySourceId(record.id, 'highlight').length > 0) return true;

            // 构建闪卡内容
            const text = highlight.text;
            const answer = this.buildFlashcardAnswer(highlight);
            
            // 创建闪卡
            const card = fsrsManager.addCard(
                text, 
                answer, 
                highlight.filePath || _fileName,
                record.id,
                'highlight'
            );
            
            if (!card) {
                if (!silent) new Notice(t('Failed to create flashcard, please check highlight content'));
                return false;
            }
            
            // 触发事件，让 FSRSManager 来处理保存
            this.plugin.eventManager.emitFlashcardChanged();
            
            // 只在非静默模式下显示成功消息
            if (!silent) {
                new Notice(t('Flashcard created successfully!'));
            }
            
            return true;
        } catch (error) {
            console.error('创建闪卡时出错:', error);
            if (!silent) new Notice(t(`Failed to create flashcard: ${error.message}`));
            return false;
        }
    }

    private buildFlashcardAnswer(highlight: HighlightInfo): string {
        const answerParts: string[] = [];
        const clozeAnswers = this.extractClozeAnswers(highlight.text);
        const commentContents = (highlight.comments || [])
            .map(comment => comment.content || '')
            .filter(content => content.trim() !== '');

        if (clozeAnswers.length > 0) {
            answerParts.push(clozeAnswers.join('\n'));
        }

        if (commentContents.length > 0) {
            answerParts.push(commentContents.join('\n\n'));
        }

        return answerParts.join('\n\n');
    }

    private extractClozeAnswers(text: string): string[] {
        const answers: string[] = [];
        const clozeRegex = /\{\{([^{}]+)\}\}/g;
        let match: RegExpExecArray | null;

        while ((match = clozeRegex.exec(text)) !== null) {
            answers.push(match[1]);
        }

        return answers;
    }
    
    /**
     * 删除高亮的闪卡
     * @param highlight 高亮信息
     * @param silent 是否静默模式（不显示通知，不触发事件）
     * @returns 删除结果 { success: boolean, shouldDeleteHighlight: boolean }
     */
    async deleteFlashcard(
        highlight: HighlightInfo,
        silent: boolean = false
    ): Promise<{ success: boolean; shouldDeleteHighlight: boolean }> {
        try {
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                if (!silent) new Notice(t('FSRS 管理器未初始化'));
                return { success: false, shouldDeleteHighlight: false };
            }

            // 根据 sourceId 删除闪卡
            const deletedCount = fsrsManager.deleteCardsBySourceId(highlight.id || '', 'highlight');
            
            if (deletedCount > 0) {
                // 清理可能残留的无效卡片引用
                fsrsManager.cleanupInvalidCardReferences();
                
                // 检查是否有批注，决定是否删除高亮
                const hasComments = highlight.comments && highlight.comments.length > 0;
                const shouldDeleteHighlight = !hasComments;
                
                if (!silent) {
                    if (shouldDeleteHighlight) {
                        new Notice(t('Flashcard and highlight deleted'));
                    } else {
                        new Notice(t('Flashcard deleted, highlight and comments preserved'));
                    }
                }
                
                // 触发闪卡变化事件（在批量删除时不触发）
                if (!silent) {
                    this.plugin.eventManager.emitFlashcardChanged();
                }
                
                return { success: true, shouldDeleteHighlight };
            } else {
                if (!silent) new Notice(t('Flashcard not found'));
                return { success: false, shouldDeleteHighlight: false };
            }
        } catch (error) {
            console.error('删除闪卡时出错:', error);
            if (!silent) new Notice(t(`Failed to delete flashcard: ${error.message}`));
            return { success: false, shouldDeleteHighlight: false };
        }
    }
}

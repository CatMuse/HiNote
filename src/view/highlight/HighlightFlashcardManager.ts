import { Notice, TFile } from 'obsidian';
import { HighlightInfo } from '../../types';
import { HiNote } from '../../CommentStore';
import CommentPlugin from '../../../main';
import { t } from '../../i18n';

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
        fileName?: string,
        silent: boolean = false
    ): Promise<boolean> {
        try {
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                if (!silent) new Notice(t('FSRS 管理器未初始化'));
                return false;
            }

            // 确保高亮有 ID
            if (!highlight.id) {
                console.warn('高亮缺少 ID，正在生成...');
                // 使用 IdGenerator 生成稳定的 ID
                const IdGenerator = (await import('../../utils/IdGenerator')).IdGenerator;
                highlight.id = IdGenerator.generateHighlightId(
                    highlight.filePath || '',
                    highlight.position || 0,
                    highlight.text
                );
            }
            
            // 如果高亮有文件路径，需要先保存到存储中
            if (highlight.filePath) {
                const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                if (file instanceof TFile) {
                    // 创建 HiNote 对象
                    const hiNote: HiNote = {
                        id: highlight.id,
                        text: highlight.text,
                        position: highlight.position || 0,
                        paragraphOffset: highlight.paragraphOffset,
                        blockId: highlight.blockId,
                        comments: highlight.comments || [],
                        createdAt: highlight.createdAt || Date.now(),
                        updatedAt: highlight.updatedAt || Date.now(),
                        filePath: highlight.filePath,
                        fileName: highlight.fileName,
                        fileIcon: highlight.fileIcon,
                        backgroundColor: highlight.backgroundColor,
                        originalLength: highlight.originalLength,
                        isVirtual: highlight.isVirtual,
                        isCloze: highlight.isCloze
                    };
                    
                    // 保存到 CommentStore
                    await this.plugin.commentStore.addComment(file, hiNote);
                }
            }
            
            // 构建闪卡内容
            const text = highlight.text;
            let answer = '';
            const answerParts: string[] = [];
            
            // 如果有文件路径，添加到答案部分
            if (highlight.filePath) {
                const displayFileName = fileName || highlight.filePath.split('/').pop() || highlight.filePath;
                answerParts.push(`From: [[${displayFileName}]]`);
            }
            
            // 如果有批注内容，添加到答案部分
            if (highlight.comments && highlight.comments.length > 0) {
                answerParts.push(highlight.comments.map(c => c.content || '').join('\n'));
            }
            
            // 合并所有答案部分，如果没有内容则使用默认文本
            answer = answerParts.length > 0 ? answerParts.join('\n\n') : t('Add answer');
            
            // 创建闪卡
            const card = fsrsManager.addCard(
                text, 
                answer, 
                highlight.filePath || fileName, 
                highlight.id, 
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

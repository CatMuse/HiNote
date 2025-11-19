import { TFile, Editor, Notice } from 'obsidian';
import { HighlightInfo } from '../../types';
import { HighlightRegexUtils } from '../../utils/HighlightRegexUtils';
import CommentPlugin from '../../../main';
import { t } from '../../i18n';

/**
 * 高亮删除管理器
 * 负责高亮的删除逻辑，包括文件操作和格式移除
 */
export class HighlightDeletionManager {
    private plugin: CommentPlugin;
    
    constructor(plugin: CommentPlugin) {
        this.plugin = plugin;
    }
    
    /**
     * 删除高亮（包括文件中的格式和存储的数据）
     * @param highlight 高亮信息
     * @param skipConfirmation 是否跳过确认对话框
     * @param skipNotice 是否跳过成功通知
     * @returns 删除是否成功
     */
    async deleteHighlight(
        highlight: HighlightInfo,
        skipConfirmation: boolean = false,
        skipNotice: boolean = false
    ): Promise<boolean> {
        try {
            // 显示确认对话框
            if (!skipConfirmation) {
                const confirmDelete = confirm(
                    t('Delete this highlight and all its data, including Comments and HiCards? Can\'t undo.')
                );
                if (!confirmDelete) {
                    return false;
                }
            }
            
            // 删除文件中的高亮格式
            if (highlight.filePath) {
                await this.removeHighlightFromFile(highlight);
                
                // 从 CommentStore 中删除高亮
                const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                if (file instanceof TFile) {
                    await this.plugin.commentStore.removeComment(file, highlight as any);
                }
                
                // 触发高亮删除事件
                this.plugin.eventManager.emitHighlightDelete(
                    highlight.filePath,
                    highlight.text || '',
                    highlight.id || ''
                );
            }
            
            if (!skipNotice) {
                new Notice(t('Highlight deleted successfully'));
            }
            
            return true;
        } catch (error) {
            console.error('删除高亮时出错:', error);
            if (!skipNotice) {
                new Notice(t(`Failed to delete highlight: ${error.message}`));
            }
            return false;
        }
    }
    
    /**
     * 从文件中移除高亮格式
     * @param highlight 高亮信息
     */
    private async removeHighlightFromFile(highlight: HighlightInfo): Promise<void> {
        if (!highlight.filePath) return;
        
        const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
        if (!(file instanceof TFile)) return;
        
        // 获取文件内容
        const fileContent = await this.plugin.app.vault.read(file);
        const highlightText = highlight.text;
        
        // 尝试获取编辑器实例（如果文件已打开）
        let editor: Editor | null = null;
        const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view.getViewType() === 'markdown') {
                const mdView = view as any;
                if (mdView.file && mdView.file.path === file.path && mdView.editor) {
                    editor = mdView.editor;
                    break;
                }
            }
        }
        
        // 获取自定义正则表达式（如果有）
        const customRegex = (this.plugin.settings as any)?.customHighlightRegex;
        
        let newContent: string;
        
        // 如果有位置信息，在指定范围内移除格式
        if (typeof highlight.position === 'number') {
            const endPos = highlight.position + (highlight.originalLength || highlightText.length);
            newContent = HighlightRegexUtils.removeHighlightFormatInRange(
                fileContent,
                highlightText,
                highlight.position,
                endPos,
                customRegex
            );
        } else {
            // 如果没有位置信息，在整个文件中移除格式
            newContent = HighlightRegexUtils.removeHighlightFormat(
                fileContent,
                highlightText,
                customRegex
            );
        }
        
        // 更新文件内容
        if (editor) {
            editor.setValue(newContent);
        } else {
            await this.plugin.app.vault.modify(file, newContent);
        }
    }
    
    /**
     * 完全删除高亮（当没有批注时使用）
     * @param highlight 高亮信息
     */
    async deleteHighlightCompletely(highlight: HighlightInfo): Promise<void> {
        try {
            if (highlight.filePath) {
                const file = this.plugin.app.vault.getAbstractFileByPath(highlight.filePath);
                if (file instanceof TFile) {
                    // 从 CommentStore 中删除高亮
                    await this.plugin.commentStore.removeComment(file, highlight as any);
                    
                    // 触发高亮删除事件
                    this.plugin.eventManager.emitHighlightDelete(
                        highlight.filePath,
                        highlight.text || '',
                        highlight.id || ''
                    );
                }
            }
        } catch (error) {
            console.error('完全删除高亮时出错:', error);
            throw error;
        }
    }
}

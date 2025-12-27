import { Notice, Modal, setIcon, TFile } from "obsidian";
import { HighlightInfo } from "../../types";
import { HighlightCard } from "../../components/highlight/HighlightCard";
import CommentPlugin from "../../../main";
import { ExportService } from "../../services/ExportService";
import { LicenseManager } from "../../services/LicenseManager";
import { HighlightService } from "../../services/HighlightService";
import { t } from "../../i18n";

/**
 * 批量操作处理器
 * 负责处理选中高亮的批量操作，包括：
 * - 批量导出
 * - 批量创建/删除闪卡
 * - 批量删除高亮
 */
export class BatchOperationsHandler {
    private plugin: CommentPlugin;
    private exportService: ExportService;
    private licenseManager: LicenseManager;
    private highlightService: HighlightService;
    private containerEl: HTMLElement;
    private multiSelectActionsContainer: HTMLElement | null = null;
    
    // 回调函数
    private getSelectedHighlightsCallback: () => Set<HighlightInfo>;
    private onClearSelectionCallback: () => void;
    private onRefreshViewCallback: () => Promise<void>;
    
    constructor(
        plugin: CommentPlugin,
        exportService: ExportService,
        licenseManager: LicenseManager,
        highlightService: HighlightService,
        containerEl: HTMLElement
    ) {
        this.plugin = plugin;
        this.exportService = exportService;
        this.licenseManager = licenseManager;
        this.highlightService = highlightService;
        this.containerEl = containerEl;
    }
    
    /**
     * 设置回调函数
     */
    setCallbacks(
        getSelectedHighlights: () => Set<HighlightInfo>,
        onClearSelection: () => void,
        onRefreshView: () => Promise<void>
    ) {
        this.getSelectedHighlightsCallback = getSelectedHighlights;
        this.onClearSelectionCallback = onClearSelection;
        this.onRefreshViewCallback = onRefreshView;
    }
    
    /**
     * 显示多选操作按钮
     */
    async showMultiSelectActions(selectedCount: number) {
        if (selectedCount <= 1) {
            this.hideMultiSelectActions();
            return;
        }
        
        // 如果已经存在，先移除
        this.hideMultiSelectActions();
        
        // 创建多选操作容器
        if (!this.multiSelectActionsContainer) {
            this.multiSelectActionsContainer = this.containerEl.createEl('div', {
                cls: 'multi-select-actions'
            });
        }
        
        this.multiSelectActionsContainer.show();
        this.multiSelectActionsContainer.empty();
        
        // 添加标题
        this.multiSelectActionsContainer.createEl('div', {
            cls: 'selected-count',
            text: `selected ${selectedCount}`
        });
        
        // 添加导出按钮
        this.createExportButton();
        
        // 添加闪卡相关按钮
        await this.createFlashcardButtons();
        
        // 添加删除按钮
        this.createDeleteButton();
    }
    
    /**
     * 隐藏多选操作按钮
     */
    hideMultiSelectActions() {
        if (this.multiSelectActionsContainer) {
            this.multiSelectActionsContainer.empty();
            this.multiSelectActionsContainer.hide();
        }
    }
    
    /**
     * 创建导出按钮
     */
    private createExportButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const exportButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        exportButton.setAttribute('aria-label', t('Export'));
        setIcon(exportButton, 'file-input');
        exportButton.addEventListener('click', () => {
            this.exportSelectedHighlights();
        });
    }
    
    /**
     * 创建闪卡相关按钮
     */
    private async createFlashcardButtons() {
        if (!this.multiSelectActionsContainer) return;
        
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            this.createDefaultFlashcardButton();
            return;
        }
        
        // 检查选中的高亮中有多少已经创建了闪卡
        const selectedHighlights = this.getSelectedHighlightsCallback();
        let existingFlashcardCount = 0;
        
        for (const highlight of selectedHighlights) {
            if (highlight.id) {
                const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                if (existingCards && existingCards.length > 0) {
                    existingFlashcardCount++;
                }
            }
        }
        
        // 根据已有闪卡的数量决定显示哪个按钮
        if (existingFlashcardCount === 0) {
            this.createFlashcardCreateButton();
        } else if (existingFlashcardCount === selectedHighlights.size) {
            this.createFlashcardDeleteButton();
        } else {
            this.createFlashcardManageButton();
        }
    }
    
    /**
     * 创建默认闪卡按钮
     */
    private createDefaultFlashcardButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const button = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        button.setAttribute('aria-label', t('Create HiCard'));
        setIcon(button, 'book-plus');
        button.addEventListener('click', () => {
            new Notice(t('HiCard function is not initialized, please enable FSRS function'));
        });
    }
    
    /**
     * 创建闪卡创建按钮
     */
    private createFlashcardCreateButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const createButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        createButton.setAttribute('aria-label', t('Create HiCard'));
        setIcon(createButton, 'book-plus');
        
        // 检查许可证状态
        this.licenseManager.isActivated().then(isActivated => {
            if (isActivated) {
                this.licenseManager.isFeatureEnabled('flashcard').then(isEnabled => {
                    if (!isEnabled) {
                        createButton.addClass('disabled-button');
                        createButton.setAttribute('aria-label', t('Only HiNote Pro'));
                    }
                });
            } else {
                createButton.addClass('disabled-button');
                createButton.setAttribute('aria-label', t('Only HiNote Pro'));
            }
        });
        
        createButton.addEventListener('click', async () => {
            if (createButton.hasClass('disabled-button')) {
                new Notice(t('Only HiNote Pro'));
                return;
            }
            await this.createMissingFlashcards();
        });
    }
    
    /**
     * 创建闪卡删除按钮
     */
    private createFlashcardDeleteButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const deleteButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button delete-flashcard-button'
        });
        deleteButton.setAttribute('aria-label', t('Delete HiCard'));
        setIcon(deleteButton, 'book-x');
        deleteButton.addEventListener('click', () => {
            this.deleteFlashcardsFromSelected();
        });
    }
    
    /**
     * 创建闪卡管理按钮
     */
    private createFlashcardManageButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const manageButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        manageButton.setAttribute('aria-label', t('Manage HiCard'));
        setIcon(manageButton, 'book-heart');
        manageButton.addEventListener('click', (event) => {
            this.showFlashcardManageMenu(event);
        });
    }
    
    /**
     * 创建删除按钮
     */
    private createDeleteButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const deleteButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        deleteButton.setAttribute('aria-label', t('Delete'));
        setIcon(deleteButton, 'trash');
        deleteButton.addEventListener('click', () => {
            this.deleteSelectedHighlights();
        });
    }
    
    /**
     * 导出选中的高亮
     */
    private async exportSelectedHighlights() {
        const selectedHighlights = this.getSelectedHighlightsCallback();
        
        if (selectedHighlights.size === 0) {
            new Notice(t('Please select highlights to export'));
            return;
        }
        
        try {
            const selectedHighlightsArray = Array.from(selectedHighlights);
            const newFile = await this.exportService.exportHighlightsAsMarkdown(selectedHighlightsArray);
            
            new Notice(t('Successfully exported selected highlights to: ') + newFile.path);
            this.onClearSelectionCallback();
        } catch (error) {
            console.error('Failed to export highlights:', error);
            new Notice(t('Failed to export highlights: ') + (error instanceof Error ? error.message : String(error)));
        }
    }
    
    /**
     * 创建缺失的闪卡
     */
    private async createMissingFlashcards() {
        const isActivated = await this.licenseManager.isActivated();
        const isFeatureEnabled = isActivated ? await this.licenseManager.isFeatureEnabled('flashcard') : false;
        
        if (!isActivated || !isFeatureEnabled) {
            new Notice(t('Only HiNote Pro'));
            return;
        }
        
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t('HiCard function is not initialized, please enable FSRS function'));
            return;
        }
        
        const selectedHighlights = this.getSelectedHighlightsCallback();
        let successCount = 0;
        let failCount = 0;
        
        for (const highlight of selectedHighlights) {
            try {
                if (highlight.id) {
                    const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                    if (existingCards && existingCards.length > 0) continue;
                    
                    let highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                    let result = false;
                    let tempCard: HighlightCard | null = null;
                    
                    if (highlightCard) {
                        result = await highlightCard.createHiCardForHighlight(true);
                    } else {
                        // 创建临时实例
                        const tempContainer = document.createElement('div');
                        tempCard = new HighlightCard(
                            tempContainer,
                            highlight,
                            this.plugin,
                            {
                                onHighlightClick: async () => {},
                                onCommentAdd: () => {},
                                onExport: () => {},
                                onCommentEdit: () => {},
                                onAIResponse: async () => {}
                            },
                            false
                        );
                        try {
                            result = await tempCard.createHiCardForHighlight(true);
                        } finally {
                            // 清理临时实例,防止内存泄漏
                            tempCard.destroy();
                        }
                    }
                    
                    if (result) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                }
            } catch (error) {
                failCount++;
                console.error('Create HiCard failed:', error);
            }
        }
        
        if (successCount > 0) {
            this.plugin.eventManager.emitFlashcardChanged();
        }
        
        this.showResultNotice(successCount, failCount, 'create');
        this.onClearSelectionCallback();
        await this.onRefreshViewCallback();
    }
    
    /**
     * 删除选中高亮的闪卡
     */
    private deleteFlashcardsFromSelected() {
        const modal = new Modal(this.plugin.app);
        modal.titleEl.setText(t('Confirm delete HiCard'));
        
        modal.contentEl.createEl('p', {
            text: t('Are you sure you want to delete the HiCards of the selected highlights? This action cannot be undone.')
        });
        
        const buttonContainer = modal.contentEl.createEl('div', {
            cls: 'modal-button-container'
        });
        
        buttonContainer.createEl('button', { text: t('Cancel') })
            .addEventListener('click', () => modal.close());
        
        const confirmButton = buttonContainer.createEl('button', {
            cls: 'mod-warning',
            text: t('Delete')
        });
        confirmButton.addEventListener('click', async () => {
            modal.close();
            await this.deleteExistingFlashcards();
        });
        
        modal.open();
    }
    
    /**
     * 删除已存在的闪卡
     */
    private async deleteExistingFlashcards() {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t('HiCard function is not initialized, please enable FSRS function'));
            return;
        }
        
        const selectedHighlights = this.getSelectedHighlightsCallback();
        let successCount = 0;
        let failCount = 0;
        
        for (const highlight of selectedHighlights) {
            try {
                if (highlight.id) {
                    const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                    if (!existingCards || existingCards.length === 0) continue;
                    
                    let highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                    let result = false;
                    let tempCard: HighlightCard | null = null;
                    
                    if (highlightCard) {
                        result = await highlightCard.deleteHiCardForHighlight(true);
                    } else {
                        // 创建临时实例
                        const tempContainer = document.createElement('div');
                        tempCard = new HighlightCard(
                            tempContainer,
                            highlight,
                            this.plugin,
                            {
                                onHighlightClick: async () => {},
                                onCommentAdd: () => {},
                                onExport: () => {},
                                onCommentEdit: () => {},
                                onAIResponse: async () => {}
                            },
                            false
                        );
                        try {
                            result = await tempCard.deleteHiCardForHighlight(true);
                        } finally {
                            // 清理临时实例,防止内存泄漏
                            tempCard.destroy();
                        }
                    }
                    
                    if (result) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                }
            } catch (error) {
                failCount++;
                console.error('Failed to delete HiCard:', error);
            }
        }
        
        if (successCount > 0) {
            this.plugin.eventManager.emitFlashcardChanged();
        }
        
        this.showResultNotice(successCount, failCount, 'delete');
        this.onClearSelectionCallback();
        await this.onRefreshViewCallback();
    }
    
    /**
     * 删除选中的高亮
     */
    private deleteSelectedHighlights() {
        const selectedHighlights = this.getSelectedHighlightsCallback();
        
        if (selectedHighlights.size === 0) {
            new Notice(t('No highlights selected'));
            return;
        }
        
        const modal = new Modal(this.plugin.app);
        modal.titleEl.setText(t('Confirm delete highlights'));
        
        modal.contentEl.createEl('p', {
            text: t(`Are you sure you want to delete ${selectedHighlights.size} highlights and all their data, including Comments and HiCards? This action cannot be undone.`)
        });
        
        const buttonContainer = modal.contentEl.createEl('div', {
            cls: 'modal-button-container'
        });
        
        buttonContainer.createEl('button', { text: t('Cancel') })
            .addEventListener('click', () => modal.close());
        
        const confirmButton = buttonContainer.createEl('button', {
            cls: 'mod-warning',
            text: t('Delete')
        });
        confirmButton.addEventListener('click', async () => {
            modal.close();
            await this.performDeleteSelectedHighlights();
        });
        
        modal.open();
    }
    
    /**
     * 执行删除选中高亮
     * 重构后的批量删除逻辑:
     * 1. 先删除所有闪卡(如果存在)
     * 2. 批量删除文件中的高亮标记(一次性处理,避免多次文件读写)
     * 3. 从 HighlightManager 中删除数据
     * 4. 清理 DOM 和卡片实例
     */
    private async performDeleteSelectedHighlights() {
        const selectedHighlights = this.getSelectedHighlightsCallback();
        
        if (selectedHighlights.size === 0) {
            new Notice(t('No highlights selected'));
            return;
        }
        
        const highlightsArray = Array.from(selectedHighlights);
        let fileMarkSuccess = 0;
        let fileMarkFailed = 0;
        let dataDeleteFailed = 0;
        
        try {
            // 第一步: 删除闪卡(如果存在)
            const fsrsManager = this.plugin.fsrsManager;
            if (fsrsManager) {
                for (const highlight of highlightsArray) {
                    if (highlight.id) {
                        try {
                            fsrsManager.deleteCardsBySourceId(highlight.id, 'highlight');
                        } catch (error) {
                            console.error('[BatchDelete] 删除闪卡失败:', highlight.id, error);
                        }
                    }
                }
            }
            
            // 第二步: 批量删除文件中的高亮标记
            const highlightsToRemove = highlightsArray
                .filter(h => h.filePath && h.text)
                .map(h => ({
                    text: h.text,
                    position: h.position,
                    filePath: h.filePath!,
                    originalLength: h.originalLength
                }));
            
            if (highlightsToRemove.length > 0) {
                const result = await this.highlightService.batchRemoveHighlightMarks(highlightsToRemove);
                fileMarkSuccess = result.success;
                fileMarkFailed = result.failed;
            }
            
            // 第三步: 从 HighlightManager 中批量删除数据
            const highlightManager = this.plugin.highlightManager;
            if (highlightManager) {
                // 按文件分组,减少保存次数
                const highlightsByFile = new Map<string, typeof highlightsArray>();
                for (const highlight of highlightsArray) {
                    if (highlight.filePath && highlight.id) {
                        if (!highlightsByFile.has(highlight.filePath)) {
                            highlightsByFile.set(highlight.filePath, []);
                        }
                        highlightsByFile.get(highlight.filePath)!.push(highlight);
                    }
                }
                
                // 对每个文件批量删除
                for (const [filePath, fileHighlights] of highlightsByFile) {
                    try {
                        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                        if (file instanceof TFile) {
                            // 批量删除该文件的所有高亮
                            for (const highlight of fileHighlights) {
                                try {
                                    await highlightManager.removeHighlight(file, highlight as any);
                                } catch (error) {
                                    console.error('[BatchDelete] 从 HighlightManager 删除失败:', highlight.id, error);
                                    dataDeleteFailed++;
                                }
                            }
                        }
                    } catch (error) {
                        console.error('[BatchDelete] 处理文件失败:', filePath, error);
                        dataDeleteFailed += fileHighlights.length;
                    }
                }
            }
            
            // 第四步: 清理 DOM 和卡片实例
            for (const highlight of highlightsArray) {
                if (highlight.id) {
                    try {
                        const highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                        if (highlightCard) {
                            // 移除 DOM 元素
                            const cardElement = (highlightCard as any).card;
                            if (cardElement) {
                                cardElement.remove();
                            }
                            // 从实例集合中移除
                            highlightCard.destroy();
                        }
                    } catch (error) {
                        console.error('[BatchDelete] 清理卡片实例失败:', highlight.id, error);
                    }
                }
            }
            
            // 第五步: 批量触发事件(只触发一次)
            if (fileMarkSuccess > 0) {
                // 可以扩展 eventManager 支持批量删除事件
                // 暂时保持逐个触发,但添加注释说明可优化
                for (const highlight of highlightsArray) {
                    if (highlight.filePath && highlight.id) {
                        this.plugin.eventManager.emitHighlightDelete(
                            highlight.filePath,
                            highlight.text || '',
                            highlight.id
                        );
                    }
                }
            }
            
        } catch (error) {
            console.error('[BatchDelete] 批量删除过程出错:', error);
            fileMarkFailed = highlightsArray.length;
        }
        
        // 清除选择状态
        this.onClearSelectionCallback();
        
        // 显示详细的结果通知
        const totalSuccess = fileMarkSuccess;
        const totalFailed = fileMarkFailed + dataDeleteFailed;
        
        if (totalSuccess > 0 && totalFailed === 0) {
            new Notice(t(`成功删除 ${totalSuccess} 个高亮`));
        } else if (totalSuccess > 0 && totalFailed > 0) {
            let message = t(`成功删除 ${totalSuccess} 个高亮`);
            if (fileMarkFailed > 0) {
                message += t(`，${fileMarkFailed} 个文件标记删除失败`);
            }
            if (dataDeleteFailed > 0) {
                message += t(`，${dataDeleteFailed} 个数据删除失败`);
            }
            new Notice(message);
        } else if (totalFailed > 0) {
            new Notice(t('删除高亮失败'));
        }
    }
    
    /**
     * 显示闪卡管理菜单
     */
    private showFlashcardManageMenu(event: MouseEvent) {
        const { Menu } = require('obsidian');
        const menu = new Menu();
        
        menu.addItem((item: any) => {
            item.setTitle(t('Create missing HiCard'))
                .setIcon('plus-circle')
                .onClick(async () => {
                    await this.createMissingFlashcards();
                });
        });
        
        menu.addItem((item: any) => {
            item.setTitle(t('Delete existing HiCards'))
                .setIcon('trash')
                .onClick(() => {
                    this.deleteFlashcardsFromSelected();
                });
        });
        
        const targetElement = event.currentTarget as HTMLElement;
        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            menu.showAtPosition({ x: rect.left - 85, y: rect.top - 60 });
        } else {
            menu.showAtMouseEvent(event);
        }
    }
    
    /**
     * 显示操作结果通知
     */
    private showResultNotice(successCount: number, failCount: number, operation: 'create' | 'delete') {
        const action = operation === 'create' ? 'created' : 'deleted';
        
        if (successCount > 0 && failCount === 0) {
            new Notice(t(`Successfully ${action} ${successCount} HiCard`));
        } else if (successCount > 0 && failCount > 0) {
            new Notice(t(`Successfully ${action} ${successCount} HiCard, ${failCount} failed`));
        } else if (successCount === 0 && failCount === 0) {
            new Notice(t(`No HiCard to ${operation}`));
        } else {
            new Notice(t(`Failed to ${operation} HiCard! Please check the selected highlight content`));
        }
    }
    
    /**
     * 清理资源
     */
    destroy() {
        this.hideMultiSelectActions();
        if (this.multiSelectActionsContainer) {
            this.multiSelectActionsContainer.remove();
            this.multiSelectActionsContainer = null;
        }
    }
}

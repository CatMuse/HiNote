import { Notice, Modal, setIcon } from "obsidian";
import { HighlightInfo } from "../../types";
import { HighlightCard } from "../../components/highlight/HighlightCard";
import CommentPlugin from "../../../main";
import { ExportService } from "../../services/ExportService";
import { LicenseManager } from "../../services/LicenseManager";
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
        containerEl: HTMLElement
    ) {
        this.plugin = plugin;
        this.exportService = exportService;
        this.licenseManager = licenseManager;
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
            
            if (newFile) {
                new Notice(t('Successfully exported selected highlights to: ') + newFile.path);
                this.onClearSelectionCallback();
            } else {
                new Notice(t('No highlights to export'));
            }
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
                    
                    if (highlightCard) {
                        result = await highlightCard.createHiCardForHighlight(true);
                    } else {
                        const tempContainer = document.createElement('div');
                        highlightCard = new HighlightCard(
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
                        result = await highlightCard.createHiCardForHighlight(true);
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
                    
                    if (highlightCard) {
                        result = await highlightCard.deleteHiCardForHighlight(true);
                    } else {
                        const tempContainer = document.createElement('div');
                        highlightCard = new HighlightCard(
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
                        result = await highlightCard.deleteHiCardForHighlight(true);
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
     */
    private async performDeleteSelectedHighlights() {
        const selectedHighlights = this.getSelectedHighlightsCallback();
        
        if (selectedHighlights.size === 0) {
            new Notice(t('No highlights selected'));
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
        
        for (const highlight of selectedHighlights) {
            try {
                if (!highlight.id) continue;
                
                const highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                
                if (highlightCard) {
                    await highlightCard.handleDeleteHighlight(true, true);
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error('删除高亮时出错:', error);
                failCount++;
            }
        }
        
        this.onClearSelectionCallback();
        
        if (successCount > 0 && failCount === 0) {
            new Notice(t(`成功删除 ${successCount} 个高亮`));
        } else if (successCount > 0 && failCount > 0) {
            new Notice(t(`成功删除 ${successCount} 个高亮，${failCount} 个删除失败`));
        } else if (successCount === 0 && failCount > 0) {
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

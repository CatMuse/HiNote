import { Notice, setIcon } from "obsidian";
import { HighlightInfo } from "../../types/highlight";
import CommentPlugin from "../../../main";
import { ExportService } from "../../services/ExportService";
import { LicenseManager } from "../../services/LicenseManager";
import { HighlightService } from "../../services/HighlightService";
import { t } from "../../i18n";
import { BatchFlashcardOperations } from "./BatchFlashcardOperations";
import { BatchHighlightDeletionOperations } from "./BatchHighlightDeletionOperations";
import { BatchExportOperations } from "./BatchExportOperations";

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
    private exportOperations: BatchExportOperations | null = null;
    private flashcardOperations: BatchFlashcardOperations | null = null;
    private deletionOperations: BatchHighlightDeletionOperations | null = null;
    
    // 回调函数
    private getSelectedHighlightsCallback: () => Set<HighlightInfo>;
    
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
        this.exportOperations = new BatchExportOperations({
            exportService: this.exportService,
            getSelectedHighlights,
            clearSelection: onClearSelection
        });
        this.flashcardOperations = new BatchFlashcardOperations({
            plugin: this.plugin,
            licenseManager: this.licenseManager,
            getSelectedHighlights,
            clearSelection: onClearSelection,
            refreshView: onRefreshView
        });
        this.deletionOperations = new BatchHighlightDeletionOperations({
            plugin: this.plugin,
            highlightService: this.highlightService,
            getSelectedHighlights,
            clearSelection: onClearSelection
        });
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
            this.multiSelectActionsContainer = this.containerEl.createDiv({
                cls: 'multi-select-actions'
            });
        }
        
        this.multiSelectActionsContainer.show();
        this.multiSelectActionsContainer.empty();
        
        // 添加标题
        this.multiSelectActionsContainer.createDiv({
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
        
        const exportButton = this.multiSelectActionsContainer.createDiv({
            cls: 'multi-select-action-button'
        });
        exportButton.setAttribute('aria-label', t('Export'));
        setIcon(exportButton, 'file-input');
        exportButton.addEventListener('click', () => {
            void this.exportOperations?.exportSelectedHighlights();
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
        
        const button = this.multiSelectActionsContainer.createDiv({
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
        
        const createButton = this.multiSelectActionsContainer.createDiv({
            cls: 'multi-select-action-button'
        });
        createButton.setAttribute('aria-label', t('Create HiCard'));
        setIcon(createButton, 'book-plus');
        
        // 检查许可证状态
        void this.licenseManager.isActivated().then(isActivated => {
            if (isActivated) {
                return this.licenseManager.isFeatureEnabled('flashcard').then(isEnabled => {
                    if (!isEnabled) {
                        createButton.addClass('disabled-button');
                        createButton.setAttribute('aria-label', t('Only HiNote Pro'));
                    }
                });
            }

            createButton.addClass('disabled-button');
            createButton.setAttribute('aria-label', t('Only HiNote Pro'));
        }).catch(error => {
            console.error('[HiNote] Failed to check flashcard license:', error);
            createButton.addClass('disabled-button');
            createButton.setAttribute('aria-label', t('Only HiNote Pro'));
        });

        createButton.addEventListener('click', () => {
            if (createButton.hasClass('disabled-button')) {
                new Notice(t('Only HiNote Pro'));
                return;
            }
            void this.flashcardOperations?.createMissingFlashcards();
        });
    }
    
    /**
     * 创建闪卡删除按钮
     */
    private createFlashcardDeleteButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const deleteButton = this.multiSelectActionsContainer.createDiv({
            cls: 'multi-select-action-button delete-flashcard-button'
        });
        deleteButton.setAttribute('aria-label', t('Delete HiCard'));
        setIcon(deleteButton, 'book-x');
        deleteButton.addEventListener('click', () => {
            this.flashcardOperations?.confirmDeleteFlashcards();
        });
    }
    
    /**
     * 创建闪卡管理按钮
     */
    private createFlashcardManageButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const manageButton = this.multiSelectActionsContainer.createDiv({
            cls: 'multi-select-action-button'
        });
        manageButton.setAttribute('aria-label', t('Manage HiCard'));
        setIcon(manageButton, 'book-heart');
        manageButton.addEventListener('click', (event) => {
            this.flashcardOperations?.showManageMenu(event);
        });
    }
    
    /**
     * 创建删除按钮
     */
    private createDeleteButton() {
        if (!this.multiSelectActionsContainer) return;
        
        const deleteButton = this.multiSelectActionsContainer.createDiv({
            cls: 'multi-select-action-button'
        });
        deleteButton.setAttribute('aria-label', t('Delete'));
        setIcon(deleteButton, 'trash');
        deleteButton.addEventListener('click', () => {
            this.deletionOperations?.confirmDeleteSelectedHighlights();
        });
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

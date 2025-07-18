import { ItemView, WorkspaceLeaf, MarkdownView, TFile, Notice, Platform, Modal, Menu, setIcon, getIcon, debounce } from "obsidian";
import { CanvasService } from './services/CanvasService';
import { FlashcardComponent } from './flashcard/components/FlashcardComponent';
import { FlashcardState } from './flashcard/types/FSRSTypes';
import { CommentStore, HiNote, CommentItem } from './CommentStore';
import { ExportPreviewModal } from './templates/ExportModal';
import { HighlightInfo, CommentUpdateEvent } from './types';
import { HighlightCard } from './components/highlight/HighlightCard';
import CommentPlugin from '../main';
import { AIService } from './services/AIService';
import { HighlightService } from './services/HighlightService';
import { AIButton } from './components/AIButton';
import { LocationService } from './services/LocationService';
import { ExportService } from './services/ExportService';
import { CommentInput } from './components/comment/CommentInput';
import { ChatView } from './components/ChatView';
import {t} from "./i18n";
import { LicenseManager } from './services/LicenseManager';
import { IdGenerator } from './utils/IdGenerator'; // 导入 IdGenerator

export const VIEW_TYPE_COMMENT = "comment-view";

// /**
//  * 将高亮笔记转换为闪卡状态
//  * @param highlights 高亮笔记数组
//  * @returns 闪卡状态数组
//  */
// function convertToFlashcardState(highlights: HiNote[]): FlashcardState[] {
//     return highlights.map(highlight => ({
//         id: highlight.id,
//         difficulty: 0.3,  // 默认难度
//         stability: 0.5,   // 默认稳定性
//         retrievability: 0.9, // 默认可提取性
//         lastReview: Date.now(), // 当前时间作为上次复习时间
//         nextReview: Date.now() + 86400000, // 默认一天后复习
//         reviewHistory: [],
//         text: highlight.text,
//         answer: highlight.comments?.map(c => c.content).join("\n") || "", // 使用评论作为答案
//         filePath: highlight.filePath,
//         createdAt: highlight.createdAt,
//         reviews: 0,
//         lapses: 0
//     }));
// }

export class CommentView extends ItemView {
    // 搜索提示事件处理器引用
    private searchHintsEventHandlers: {
        input: (e: Event) => void;
        blur: (e: FocusEvent) => void;
        click: (e: MouseEvent) => void;
    } | null = null;
    // 添加活动视图变化的事件处理器
    private activeLeafChangeHandler: (() => void) | undefined;
    // 清除所有选中状态的方法
    private clearSelection() {
        // 清除DOM中的选中状态
        this.highlightContainer.querySelectorAll('.highlight-card.selected').forEach(card => {
            card.removeClass('selected');
        });
        
        // 清除HighlightCard类中的选中状态
        if (HighlightCard && typeof HighlightCard.clearSelection === 'function') {
            HighlightCard.clearSelection();
        }
        
        // 清空选中的高亮集合
        this.selectedHighlights.clear();
        
        // 隐藏多选操作按钮
        this.hideMultiSelectActions();
        
        // 重置选择模式
        this.isSelectionMode = false;
    }
    
    private handleMultiSelect(e: CustomEvent) {
        const detail = e.detail;
        if (detail && detail.selectedCards) {
            // 更新选中的高亮列表
            this.updateSelectedHighlights();
        }
    }
    
    // 更新选中的高亮列表
    private updateSelectedHighlights() {
        this.selectedHighlights.clear();
        const selectedCards = Array.from(this.highlightContainer.querySelectorAll('.highlight-card.selected'));
        
        selectedCards.forEach(card => {
            const highlightData = card.getAttribute('data-highlight');
            if (highlightData) {
                try {
                    const highlight = JSON.parse(highlightData) as HighlightInfo;
                    this.selectedHighlights.add(highlight);
                } catch (e) {
                    console.error('Error parsing highlight data:', e);
                }
            }
        });
        
        // 只有在多选情况下才显示批量操作按钮
        if (this.selectedHighlights.size > 1) {
            this.showMultiSelectActions();
        } else {
            this.hideMultiSelectActions();
        }
    }
    
    // 显示多选操作按钮
    private async showMultiSelectActions() {
        // 如果已经存在，先移除
        this.hideMultiSelectActions();
        
        // 如果没有创建过多选操作容器，则创建一个
        if (!this.multiSelectActionsContainer) {
            this.multiSelectActionsContainer = this.containerEl.createEl('div', {
                cls: 'multi-select-actions'
            });
        }
        
        // 显示容器
        this.multiSelectActionsContainer.show();
        
        // 清空容器
        this.multiSelectActionsContainer.empty();
        
        // 添加操作按钮容器的标题
        const titleEl = this.multiSelectActionsContainer.createEl('div', {
            cls: 'selected-count',
            text: `selected ${this.selectedHighlights.size}`
        });
        
        // 添加操作按钮 - 导出按钮
        const exportButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        exportButton.setAttribute('aria-label', t('Export'));
        setIcon(exportButton, 'file-input');
        exportButton.addEventListener('click', () => {
            this.exportSelectedHighlights();
        });
        
        // 检查选中高亮的闪卡状态
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            // 如果FSRSManager未初始化，显示默认的创建闪卡按钮
            this.createDefaultFlashcardButton(this.multiSelectActionsContainer);
            return;
        }
        
        // 检查选中的高亮中有多少已经创建了闪卡
        let existingFlashcardCount = 0;
        for (const highlight of this.selectedHighlights) {
            if (highlight.id) {
                const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                if (existingCards && existingCards.length > 0) {
                    existingFlashcardCount++;
                }
            }
        }
        
        // 根据已有闪卡的数量决定显示哪个按钮
        if (existingFlashcardCount === 0) {
            // 如果没有闪卡，显示创建按钮
            const createButton = this.multiSelectActionsContainer.createEl('div', {
                cls: 'multi-select-action-button'
            });
            createButton.setAttribute('aria-label', t('Create HiCard'));
            setIcon(createButton, 'book-plus');
            
            // 检查许可证状态
            const checkLicenseStatus = async () => {
                const isActivated = await this.licenseManager.isActivated();
                const isFeatureEnabled = isActivated ? await this.licenseManager.isFeatureEnabled('flashcard') : false;
                return isActivated && isFeatureEnabled;
            };
            
            // 异步检查许可证状态并设置按钮样式
            checkLicenseStatus().then(isLicensed => {
                if (!isLicensed) {
                    // 如果没有许可证，置灰按钮
                    createButton.addClass('disabled-button');
                    createButton.setAttribute('aria-label', t('Only HiNote Pro'));
                }
            });
            
            createButton.addEventListener('click', async () => {
                // 如果按钮被禁用，显示提示并不执行操作
                if (createButton.hasClass('disabled-button')) {
                    new Notice(t('Only HiNote Pro'));
                    return;
                }
                
                await this.createMissingFlashcards();
            });
        } else if (existingFlashcardCount === this.selectedHighlights.size) {
            // 全部是已创建闪卡的高亮
            const deleteButton = this.multiSelectActionsContainer.createEl('div', {
                cls: 'multi-select-action-button delete-flashcard-button'
            });
            deleteButton.setAttribute('aria-label', t('Delete HiCard'));
            setIcon(deleteButton, 'book-x');
            deleteButton.addEventListener('click', () => {
                this.deleteFlashcardsFromSelected();
            });
        } else {
            // 如果部分有闪卡，显示管理按钮
            const manageButton = this.multiSelectActionsContainer.createEl('div', {
                cls: 'multi-select-action-button'
            });
            manageButton.setAttribute('aria-label', t('Manage HiCard'));
            setIcon(manageButton, 'book-heart');
            manageButton.addEventListener('click', (event) => {
                this.showFlashcardManageMenu(event);
            });
        }
        
        // 添加操作按钮 - 删除按钮（放在最后）
        const deleteButton = this.multiSelectActionsContainer.createEl('div', {
            cls: 'multi-select-action-button'
        });
        deleteButton.setAttribute('aria-label', t('Delete'));
        setIcon(deleteButton, 'trash');
        deleteButton.addEventListener('click', () => {
            this.deleteSelectedHighlights();
        });
    }
    
    // 隐藏多选操作按钮
    private hideMultiSelectActions() {
        // 清空容器
        if (this.multiSelectActionsContainer) {
            this.multiSelectActionsContainer.empty();
            this.multiSelectActionsContainer.hide();
        }
    }
    
    // 处理全局点击事件，用于隐藏批量操作容器
    private handleGlobalClick = (e: MouseEvent) => {
        // 如果正在进行框选操作，不处理全局点击事件
        if (this.isSelectionMode) {
            return;
        }
        
        // 如果没有选中的高亮或者没有显示批量操作容器，则不处理
        if (this.selectedHighlights.size <= 1 || !this.multiSelectActionsContainer || this.multiSelectActionsContainer.style.display === 'none') {
            return;
        }
        
        // 检查点击的目标是否是批量操作容器本身或其子元素
        const target = e.target as HTMLElement;
        if (target.closest('.multi-select-actions')) {
            return; // 点击的是批量操作容器，不隐藏
        }
        
        // 检查点击的是否是已选中的卡片
        if (target.closest('.highlight-card.selected')) {
            return; // 点击的是已选中的卡片，不隐藏
        }
        
        // 检查点击的是否是高亮容器，如果是，让原有的点击处理逻辑处理
        if (target.closest('.highlight-container')) {
            return;
        }
        
        // 点击了其他区域，清除选择
        this.clearSelection();
    }
    
    // 创建默认的闪卡按钮（当FSRSManager未初始化时）
    private createDefaultFlashcardButton(container: HTMLElement) {
        const button = container.createEl('div', {
            cls: 'multi-select-action-button'
        });
        button.setAttribute('aria-label', t('Create HiCard'));
        setIcon(button, 'plus-circle');
        button.addEventListener('click', () => {
            new Notice(t('HiCard function is not initialized, please enable FSRS function'));
        });
    }
    
    // 显示闪卡管理菜单
    private showFlashcardManageMenu(event: MouseEvent) {
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
        
        // 获取触发事件的按钮元素
        const targetElement = event.currentTarget as HTMLElement;
        
        // 计算菜单应该显示的位置
        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            // 在按钮上方显示菜单
            menu.showAtPosition({ x: rect.left - 85, y: rect.top - 60 });
        } else {
            // 如果无法获取按钮位置，则在鼠标位置显示
            menu.showAtMouseEvent(event);
        }
    }
    
    // 创建缺失的闪卡
    private async createMissingFlashcards() {
        // 检查许可证状态
        const isActivated = await this.licenseManager.isActivated();
        const isFeatureEnabled = isActivated ? await this.licenseManager.isFeatureEnabled('flashcard') : false;
        
        if (!isActivated || !isFeatureEnabled) {
            // 未激活或未启用闪卡功能，显示提示
            new Notice(t('Only HiNote Pro'));
            return;
        }
        
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t('HiCard function is not initialized, please enable FSRS function'));
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
        
        for (const highlight of this.selectedHighlights) {
            try {
                if (highlight.id) {
                    // 检查是否已存在闪卡
                    const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                    if (existingCards && existingCards.length > 0) continue; // 跳过已有闪卡的高亮
                    
                    // 查找当前高亮对应的 HighlightCard 实例
                    let highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                    let result = false;
                    
                    if (highlightCard) {
                        // 如果找到了实例，直接使用该实例的创建方法（静默模式）
                        result = await highlightCard.createHiCardForHighlight(true);
                    } else {
                        // 如果没有找到实例，创建一个临时容器元素
                        const tempContainer = document.createElement('div');
                        
                        // 创建一个临时实例并使用它的创建方法
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
                        console.error(`Create HiCard failed: ${highlight.text}`);
                    }
                }
            } catch (error) {
                failCount++;
                console.error('Create HiCard failed:', error);
            }
        }

        // 触发事件，让 FSRSManager 来处理保存
        if (successCount > 0) {
            this.plugin.eventManager.emitFlashcardChanged();
        }

        // 显示结果消息
        if (successCount > 0 && failCount === 0) {
            new Notice(t(`Successfully created ${successCount} HiCard`));
        } else if (successCount > 0 && failCount > 0) {
            new Notice(t(`Successfully created ${successCount} HiCard, ${failCount} failed`));
        } else if (successCount === 0 && failCount === 0) {
            new Notice(t(`No HiCard to create`));
        } else {
            new Notice(t(`Failed to create HiCard! Please check the selected highlight content`));
        }
        
        // 清除选中状态
        this.clearSelection();
        
        // 重新渲染高亮列表，确保闪卡图标状态更新
        this.renderHighlights(this.highlights);
    }
    
    // 导出选中的高亮内容
    private async exportSelectedHighlights() {
        if (this.selectedHighlights.size === 0) {
            new Notice(t('Please select highlights to export'));
            return;
        }
        try {
            const selectedHighlightsArray = Array.from(this.selectedHighlights);
            const newFile = await this.exportService.exportHighlightsAsMarkdown(selectedHighlightsArray);
            
            if (newFile) {
                new Notice(t('Successfully exported selected highlights to: ') + newFile.path);
                this.clearSelection();
            } else {
                new Notice(t('No highlights to export'));
            }
        } catch (error) {
            console.error('Failed to export highlights:', error);
            new Notice(t('Failed to export highlights: ') + (error instanceof Error ? error.message : String(error)));
        }
    }
    
    // 从选中的高亮删除闪卡
    private deleteFlashcardsFromSelected() {
        // 创建确认对话框
        const modal = new Modal(this.app);
        modal.titleEl.setText(t('Confirm delete HiCard'));
        
        const contentEl = modal.contentEl;
        contentEl.empty();
        
        contentEl.createEl('p', {
            text: t('Are you sure you want to delete the HiCards of the selected highlights? This action cannot be undone.')
        });
        
        const buttonContainer = contentEl.createEl('div', {
            cls: 'modal-button-container'
        });
        
        const cancelButton = buttonContainer.createEl('button', {
            text: t('Cancel')
        });
        cancelButton.addEventListener('click', () => {
            modal.close();
        });
        
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
    
    // 删除选中的高亮
    private deleteSelectedHighlights() {
        if (this.selectedHighlights.size === 0) {
            new Notice(t('No highlights selected'));
            return;
        }
        
        // 创建确认对话框
        const modal = new Modal(this.app);
        modal.titleEl.setText(t('Confirm delete highlights'));
        
        const contentEl = modal.contentEl;
        contentEl.empty();
        
        contentEl.createEl('p', {
            text: t(`Are you sure you want to delete ${this.selectedHighlights.size} highlights and all their data, including Comments and HiCards? This action cannot be undone.`)
        });
        
        const buttonContainer = contentEl.createEl('div', {
            cls: 'modal-button-container'
        });
        
        const cancelButton = buttonContainer.createEl('button', {
            text: t('Cancel')
        });
        cancelButton.addEventListener('click', () => {
            modal.close();
        });
        
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
    
    // 执行删除选中高亮的操作
    private async performDeleteSelectedHighlights() {
        if (this.selectedHighlights.size === 0) {
            new Notice(t('No highlights selected'));
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
        
        // 获取所有高亮卡片元素
        const highlightCards = Array.from(this.highlightContainer.querySelectorAll('.highlight-card.selected'));
        
        for (const card of highlightCards) {
            try {
                // 获取高亮数据
                const highlightData = card.getAttribute('data-highlight');
                if (!highlightData) continue;
                
                const highlight = JSON.parse(highlightData);
                if (!highlight.id) continue;
                
                // 查找当前高亮对应的 HighlightCard 实例
                let highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                
                if (highlightCard) {
                    // 如果找到了实例，直接使用该实例的删除方法（跳过确认对话框和单个通知）
                    await highlightCard.handleDeleteHighlight(true, true);
                    successCount++;
                } else {
                    // 如果没有找到实例，可能是因为卡片不在视图中或其他原因
                    failCount++;
                    console.error(`无法找到高亮卡片实例: ${highlight.id}`);
                }
            } catch (error) {
                console.error('删除高亮时出错:', error);
                failCount++;
            }
        }
        
        // 清除选中状态
        this.clearSelection();
        
        // 显示结果通知
        if (successCount > 0 && failCount === 0) {
            new Notice(t(`成功删除 ${successCount} 个高亮`));
        } else if (successCount > 0 && failCount > 0) {
            new Notice(t(`成功删除 ${successCount} 个高亮，${failCount} 个删除失败`));
        } else if (successCount === 0 && failCount > 0) {
            new Notice(t('删除高亮失败'));
        }
    }
    
    // 删除选中高亮的闪卡
    private async deleteExistingFlashcards() {
        const fsrsManager = this.plugin.fsrsManager;
        if (!fsrsManager) {
            new Notice(t('HiCard function is not initialized, please enable FSRS function'));
            return;
        }
        
        let successCount = 0;
        let failCount = 0;
        
        for (const highlight of this.selectedHighlights) {
            try {
                if (highlight.id) {
                    // 检查是否存在闪卡
                    const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                    if (!existingCards || existingCards.length === 0) continue; // 跳过没有闪卡的高亮
                    
                    // 查找当前高亮对应的 HighlightCard 实例
                    let highlightCard = HighlightCard.findCardInstanceByHighlightId(highlight.id);
                    let result = false;
                    
                    if (highlightCard) {
                        // 如果找到了实例，直接使用该实例的删除方法（静默模式）
                        result = await highlightCard.deleteHiCardForHighlight(true);
                    } else {
                        // 如果没有找到实例，创建一个临时容器元素
                        const tempContainer = document.createElement('div');
                        
                        // 创建一个临时实例并使用它的删除方法（静默模式）
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
                        console.error(`Failed to delete HiCard: ${highlight.text}`);
                    }
                }
            } catch (error) {
                failCount++;
                console.error('Failed to delete HiCard:', error);
            }
        }

        // 触发事件，让 FSRSManager 来处理保存
        if (successCount > 0) {
            this.plugin.eventManager.emitFlashcardChanged();
        }
        
        // 显示结果消息
        if (successCount > 0 && failCount === 0) {
            new Notice(t(`Successfully deleted ${successCount} HiCard`));
        } else if (successCount > 0 && failCount > 0) {
            new Notice(t(`Successfully deleted ${successCount} HiCard, ${failCount} failed`));
        } else if (successCount === 0 && failCount === 0) {
            new Notice(t(`No HiCard to delete`));
        } else {
            new Notice(t(`Failed to delete HiCard! Please check the selected highlight content`));
        }
        
        // 清除选中状态
        this.clearSelection();
        // 重新渲染高亮列表，确保闪卡图标状态更新
        this.renderHighlights(this.highlights);
    }
    
    // 设置框选功能
    private setupSelectionBox() {
        // 移除现有的事件监听器
        this.highlightContainer.removeEventListener('mousedown', this.handleSelectionStart);
        
        // 添加新的事件监听器
        this.highlightContainer.addEventListener('mousedown', this.handleSelectionStart);
    }
    
    private handleSelectionStart = (e: MouseEvent) => {
        // 如果点击的是卡片内部元素、HiCard页面元素或AI对话浮动按钮，不启动框选
        if ((e.target as HTMLElement).closest('.highlight-card') ||
            (e.target as HTMLElement).closest('.flashcard-mode') ||
            (e.target as HTMLElement).closest('.flashcard-add-group') ||
            (e.target as HTMLElement).closest('.flashcard-group-action') ||
            (e.target as HTMLElement).closest('.highlight-floating-button')) {
            return;
        }
    
        // 记录起始位置
        this.selectionStartX = e.clientX;
        this.selectionStartY = e.clientY;
        this.mouseMoved = false; // 重置移动标志
    
        // 添加移动和结束事件监听器
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }
    
    private handleMouseMove = (e: MouseEvent) => {
        // 检查鼠标移动距离是否超过阈值
        const dx = e.clientX - this.selectionStartX;
        const dy = e.clientY - this.selectionStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance >= this.mouseMoveThreshold) {
            this.mouseMoved = true;
            // 移除鼠标移动事件监听器
            document.removeEventListener('mousemove', this.handleMouseMove);
            // 开始框选
            this.startSelection(e);
        }
    }
    
    private handleMouseUp = (e: MouseEvent) => {
        // 移除事件监听器
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        
        // 如果没有移动，则认为是点击空白区域
        if (!this.mouseMoved) {
            this.clearSelection();
        }
    }
    
    private startSelection(e: MouseEvent) {
        // 检查 DOM 中是否有带有 selected 类的卡片
        const hasSelectedCards = this.highlightContainer.querySelectorAll('.highlight-card.selected').length > 0;
        
        // 检查 HighlightCard.selectedCards 集合
        const HighlightCardClass = (window as any).HighlightCard;
        const hasSelectedCardsInSet = HighlightCardClass && HighlightCardClass.selectedCards && HighlightCardClass.selectedCards.size > 0;
        
        // 如果已经有选中的卡片，清除选择
        if (this.selectedHighlights.size > 0 || hasSelectedCards || hasSelectedCardsInSet) {
            this.clearSelection();
        }
        
        // 创建选择框
        this.selectionBox = document.createElement('div');
        this.selectionBox.className = 'selection-box';
        this.selectionBox.style.left = `${this.selectionStartX}px`;
        this.selectionBox.style.top = `${this.selectionStartY}px`;
        document.body.appendChild(this.selectionBox);
        
        // 启动选择模式
        this.isSelectionMode = true;
        
        // 添加移动和结束事件监听器
        document.addEventListener('mousemove', this.handleSelectionMove);
        document.addEventListener('mouseup', this.handleSelectionEnd);
    }

    // 处理框选移动
    private handleSelectionMove = (e: MouseEvent) => {
        if (!this.isSelectionMode || !this.selectionBox) return;
        
        // 计算选择框尺寸和位置
        const width = e.clientX - this.selectionStartX;
        const height = e.clientY - this.selectionStartY;
        
        // 根据拖动方向设置选择框位置和大小
        if (width < 0) {
            this.selectionBox.style.left = `${e.clientX}px`;
            this.selectionBox.style.width = `${-width}px`;
        } else {
            this.selectionBox.style.width = `${width}px`;
        }
        
        if (height < 0) {
            this.selectionBox.style.top = `${e.clientY}px`;
            this.selectionBox.style.height = `${-height}px`;
        } else {
            this.selectionBox.style.height = `${height}px`;
        }
        
        // 实时选中框内的卡片
        this.selectCardsInBox();
    }
    
    // 处理框选结束
    private handleSelectionEnd = (e: MouseEvent) => {
        if (!this.isSelectionMode) return;
        
        // 移除选择框
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
        
        // 结束选择模式
        this.isSelectionMode = false;
        
        // 移除事件监听器
        document.removeEventListener('mousemove', this.handleSelectionMove);
        document.removeEventListener('mouseup', this.handleSelectionEnd);
        
        // 更新选中的高亮列表
        this.updateSelectedHighlights();
    }
    
    // 选中框内的卡片
    private selectCardsInBox() {
        if (!this.selectionBox) return;
        
        // 获取选择框的位置和尺寸
        const boxRect = this.selectionBox.getBoundingClientRect();
        
        // 获取所有高亮卡片
        const cards = this.highlightContainer.querySelectorAll('.highlight-card');
        
        // 获取 HighlightCard 类
        const HighlightCardClass = (window as any).HighlightCard;
        
        // 检查每个卡片是否在选择框内
        cards.forEach(card => {
            const cardRect = card.getBoundingClientRect();
            
            // 检查卡片是否与选择框重叠
            const overlap = !(boxRect.right < cardRect.left || 
                            boxRect.left > cardRect.right || 
                            boxRect.bottom < cardRect.top || 
                            boxRect.top > cardRect.bottom);
            
            // 如果重叠，选中卡片
            if (overlap) {
                card.addClass('selected');
                // 将卡片添加到 HighlightCard.selectedCards 集合中
                if (HighlightCardClass && HighlightCardClass.selectedCards) {
                    HighlightCardClass.selectedCards.add(card);
                }
            } else if (!document.querySelector('.multi-select-mode')) {
                // 如果没有处于多选模式，取消选中框外的卡片
                card.removeClass('selected');
                // 从 HighlightCard.selectedCards 集合中移除
                if (HighlightCardClass && HighlightCardClass.selectedCards) {
                    HighlightCardClass.selectedCards.delete(card);
                }
            }
        });
    }
    private highlightContainer: HTMLElement;
    private multiSelectActionsContainer: HTMLElement;
    private searchContainer: HTMLElement;
    private fileListContainer: HTMLElement;
    private mainContentContainer: HTMLElement;
    private selectedHighlights: Set<HighlightInfo> = new Set<HighlightInfo>();
    private currentFile: TFile | null = null;
    private isFlashcardMode: boolean = false;
    private highlights: HighlightInfo[] = [];
    private highlightsWithFlashcards: Set<string> = new Set<string>();
    private commentStore: CommentStore;
    private searchInput: HTMLInputElement;
    private searchLoadingIndicator: HTMLElement;
    private searchDebounceTimer: number | null = null;
    private readonly localSearchDebounceTime = 200; // 本地搜索防抖时间（毫秒）
    private readonly globalSearchDebounceTime = 500; // 全局搜索防抖时间（毫秒）
    private isSearching: boolean = false;
    private plugin: CommentPlugin;
    private locationService: LocationService;
    private exportService: ExportService;
    private highlightService: HighlightService;
    private licenseManager: LicenseManager;
    private isDraggedToMainView: boolean = false;
    private isMobileView: boolean = false;
    private isSmallScreen: boolean = false; // 是否为小屏幕设备
    private isShowingFileList: boolean = true; // 在移动端主视图中是否显示文件列表
    private currentBatch: number = 0;
    private isLoading: boolean = false;
    private loadingIndicator: HTMLElement;
    private BATCH_SIZE = 20;
    private floatingButton: HTMLElement | null = null;
    private aiButtons: AIButton[] = []; // 添加一个数组来跟踪所有的 AIButton 实例
    private currentEditingHighlightId: string | null | undefined = null;
    private flashcardComponent: FlashcardComponent | null = null;
    private canvasService: CanvasService;
    
    // 多选相关属性
    private isSelectionMode: boolean = false;
    private selectionBox: HTMLElement | null = null;
    private selectionStartX: number = 0;
    private selectionStartY: number = 0;

    private mouseMoveThreshold = 5; // 鼠标移动阈值，超过此值才认为是拖拽
    private mouseMoved = false; // 标记鼠标是否移动

    constructor(leaf: WorkspaceLeaf, commentStore: CommentStore) {
        super(leaf);
        this.commentStore = commentStore;
        // 使用类型安全的方式获取插件实例
        // 通过类型断言访问内部属性
        const plugins = (this.app as any).plugins;
        if (plugins && plugins.plugins && plugins.plugins['hi-note']) {
            this.plugin = plugins.plugins['hi-note'] as CommentPlugin;
        } else {
            throw new Error('Hi-Note plugin not found');
        }
        this.locationService = new LocationService(this.app);
        this.exportService = new ExportService(this.app, this.commentStore);
        this.highlightService = new HighlightService(this.app);
        this.licenseManager = new LicenseManager(this.plugin);
        this.canvasService = new CanvasService(this.app.vault);
        
        // 监听文档切换
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                // 只在非主视图时同步文件
                if (file && !this.isDraggedToMainView) {
                    this.currentFile = file;
                    
                    // 检查是否是在 Canvas 中选中的文件节点
                    const activeLeaf = this.app.workspace.activeLeaf;
                    const isInCanvas = activeLeaf?.getViewState()?.state?.file !== file.path && 
                                      activeLeaf?.view?.getViewType() === 'canvas';
                    
                    // 更新高亮，并传递额外信息
                    this.updateHighlights(isInCanvas);
                }
            })
        );

        // 监听文档修改
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                // 只在非主视图时同步文件
                if (file === this.currentFile && !this.isDraggedToMainView) {
                    // 检查是否是在 Canvas 中选中的文件节点
                    const activeLeaf = this.app.workspace.activeLeaf;
                    const isInCanvas = activeLeaf?.getViewState()?.state?.file !== file.path && 
                                      activeLeaf?.view?.getViewType() === 'canvas';
                    
                    this.updateHighlights(isInCanvas);
                }
            })
        );

        // 监听评论输入事件
        const handleCommentInput = (e: CustomEvent) => {
            const { highlightId, text } = e.detail;
            
            // 等待一下确保视图已经更新
            setTimeout(() => {
                // 移除所有卡片的选中状态
                this.highlightContainer.querySelectorAll('.highlight-card').forEach(card => {
                    card.removeClass('selected');
                });

                // 首先尝试直接通过高亮 ID 查找卡片实例
                let cardInstance = HighlightCard.findCardInstanceByHighlightId(highlightId);
                
                // 如果没找到，尝试通过文本内容查找
                if (!cardInstance) {
                    // 找到对应的高亮卡片
                    const highlightCard = Array.from(this.highlightContainer.querySelectorAll('.highlight-card'))
                        .find(card => {
                            const textContent = card.querySelector('.highlight-text-content')?.textContent;
                            return textContent === text;
                        });

                    if (highlightCard) {
                        // 添加选中状态
                        highlightCard.addClass('selected');
                        
                        // 查找 HighlightCard 实例
                        cardInstance = HighlightCard.findCardInstanceByElement(highlightCard as HTMLElement);
                        
                        // 滚动到评论区域
                        highlightCard.scrollIntoView({ behavior: "smooth" });
                    }
                }
                
                // 如果找到了卡片实例，显示评论输入框
                if (cardInstance) {
                    // 调用 showCommentInput 方法直接触发评论输入框显示
                    cardInstance.showCommentInput();
                }
            }, 100);
        };

        window.addEventListener("open-comment-input", handleCommentInput as EventListener);
        this.register(() => window.removeEventListener("open-comment-input", handleCommentInput as EventListener));

        // 添加视图位置变化的监听
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.checkViewPosition();
            })
        );

        // 创建加载指示器
        this.loadingIndicator = createEl("div", {
            cls: "highlight-loading-indicator",
            text: t("Loading...")
        });
        this.loadingIndicator.addClass('highlight-display-none');
    }

    getViewType(): string {
        return VIEW_TYPE_COMMENT;
    }

    getDisplayText(): string {
        return "HiNote";
    }

    getIcon(): string {
        return "highlighter";  // 使用与左侧功能区相同的图标
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("comment-view-container");
        
        // 监听多选事件
        container.addEventListener('highlight-multi-select', (e: CustomEvent) => {
            this.handleMultiSelect(e);
        });

        // 添加全局点击事件监听器
        document.addEventListener('click', this.handleGlobalClick);

        // 创建主容器
        const mainContainer = container.createEl("div", {
            cls: "highlight-main-container"
        });

        // 创建文件列表区域（只在主视图中显示）
        this.fileListContainer = mainContainer.createEl("div", {
            cls: "highlight-file-list-container"
        });

        // 创建右侧内容区域
        this.mainContentContainer = mainContainer.createEl("div", {
            cls: "highlight-content-container"
        });
        
        // 创建返回按钮（仅在移动端显示）
        const backButtonContainer = this.mainContentContainer.createEl("div", {
            cls: "highlight-back-button-container"
        });
        
        const backButton = backButtonContainer.createEl("div", {
            cls: "highlight-back-button"
        });
        setIcon(backButton, "arrow-left");
        backButton.createEl("span", {
            text: t("BACK"),
            cls: "highlight-back-button-text"
        });
        
        // 添加返回按钮点击事件
        backButton.addEventListener("click", () => {
            if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                // 如果在闪卡模式下，实现逐级返回
                if (this.isFlashcardMode && this.flashcardComponent) {
                    // 检查闪卡渲染器的状态
                    const renderer = this.flashcardComponent.getRenderer();
                    if (renderer) {
                        // 如果在卡片内容页面，先返回到分组列表
                        if (!renderer.isShowingSidebar()) {
                            renderer.showSidebar();
                            return;
                        }
                        // 如果已经在分组列表页面，才返回到文件列表
                    }
                }
                
                // 如果不是闪卡模式或者已经在闪卡分组列表页面，返回到文件列表
                this.isShowingFileList = true;
                this.updateViewLayout();
            }
        });
        
        // 创建搜索区域
        this.searchContainer = this.mainContentContainer.createEl("div", {
            cls: "highlight-search-container"
        });

        // 创建搜索输入框
        this.searchInput = this.searchContainer.createEl("input", {
            cls: "highlight-search-input",
            attr: {
                type: "text",
                placeholder: t("Search..."),
            }
        });

        // 添加焦点和失焦事件
        this.searchInput.addEventListener('focus', () => {
            this.searchContainer.addClass('focused');
            this.showSearchPrefixHints();
        });

        this.searchInput.addEventListener('blur', (e) => {
            this.searchContainer.removeClass('focused');
            // 延迟隐藏提示，以便点击提示项时能正确处理点击事件
            setTimeout(() => {
                const hintsEl = document.querySelector('.search-prefix-hints');
                if (hintsEl) {
                    hintsEl.remove();
                }
            }, 200);
        });

        // 创建搜索加载指示器
        this.searchLoadingIndicator = this.searchContainer.createEl("div", {
            cls: "highlight-search-loading"
        });
        this.searchLoadingIndicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="loading-spinner"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>`;
        this.searchLoadingIndicator.style.display = "none";
        
        // 创建图标按钮容器
        const iconButtonsContainer = this.searchContainer.createEl("div", {
            cls: "highlight-search-icons"
        });

        // 添加 message-square-plus 图标按钮
        const addCommentButton = iconButtonsContainer.createEl("div", {
            cls: "highlight-icon-button"
        });
        setIcon(addCommentButton, "message-square-plus");
        addCommentButton.setAttribute("aria-label", t("Add File Comment"));

        // 添加文件评论按钮点击事件
        addCommentButton.addEventListener("click", async () => {
            if (!this.currentFile) {
                new Notice(t("Please open a file first."));
                return;
            }

            // 生成唯一标识符
            const timestamp = Date.now();
            const uniqueId = `file-comment-${timestamp}`;
            
            // 创建虚拟高亮信息，在文档的最顶部创建了一个不可见的高亮内容
            const virtualHighlight: HiNote = {
                id: uniqueId,
                text: `__virtual_highlight_${timestamp}__`,  // 这个文本不会显示给用户
                filePath: this.currentFile.path,
                fileType: this.currentFile.extension,
                displayText: t("File Comment"),  // 这是显示给用户看的文本
                isVirtual: true,  // 标记这是一个虚拟高亮
                position: 0,  // 给一个默认位置
                paragraphOffset: 0,  // 给一个默认偏移量
                paragraphId: `${this.currentFile.path}#^virtual-${timestamp}`,  // 生成一个虚拟段落ID
                createdAt: timestamp,
                updatedAt: timestamp,
                comments: []  // 初始化空的评论数组
            };

            // 先保存到 CommentStore
            await this.commentStore.addComment(this.currentFile, virtualHighlight);

            // 将虚拟高亮添加到高亮列表的最前面
            this.highlights.unshift(virtualHighlight);
            
            // 重新渲染高亮列表
            this.renderHighlights(this.highlights);

            // 找到新创建的高亮卡片
            setTimeout(() => {
                const highlightCard = this.highlightContainer.querySelector('.highlight-card') as HTMLElement;
                if (highlightCard) {
                    // 自动打开评论输入框
                    this.showCommentInput(highlightCard, virtualHighlight);
                    // 滚动到顶部
                    this.highlightContainer.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 100);
        });

        // 添加 square-arrow-out-up-right 图标按钮
        const exportButton = iconButtonsContainer.createEl("div", {
            cls: "highlight-icon-button"
        });
        setIcon(exportButton, "file-symlink");
        exportButton.setAttribute("aria-label", t("Export as notes"));

        // 添加导出按钮点击事件
        exportButton.addEventListener("click", async () => {
            if (!this.currentFile) {
                new Notice(t("Please open a file first."));
                return;
            }

            try {
                const newFile = await this.exportService.exportHighlightsToNote(this.currentFile);
                new Notice(t("Successfully exported highlights to: ") + newFile.path);
                
                // 打开新创建的文件
                const leaf = this.app.workspace.getLeaf();
                await leaf.openFile(newFile);
            } catch (error) {
                new Notice(t("Failed to export highlights: ") + error.message);
            }
        });

        // 添加搜索事件监听，使用防抖函数避免频繁触发搜索
        this.searchInput.addEventListener("input", this.handleSearchInputWithDebounce);

        // 创建高亮容器
        this.highlightContainer = this.mainContentContainer.createEl("div", {
            cls: "highlight-container"
        });
        
        // 添加键盘事件监听，支持按住 Shift 键进行多选
        this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                this.highlightContainer.addClass('multi-select-mode');
            }
        });
        
        this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
            if (e.key === 'Shift') {
                this.highlightContainer.removeClass('multi-select-mode');
            }
        });

        // 初始化当前文件
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
            this.currentFile = activeFile;
            await this.updateHighlights();
        }

        // 更新视图布局
        this.updateViewLayout();
        this.highlightContainer.empty();

        // 过滤并显示高亮评论
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const filteredHighlights = this.highlights.filter(highlight => {
            // 搜索高亮文本
            if (highlight.text.toLowerCase().includes(searchTerm)) {
                return true;
            }
            // 搜索评论内
            if (highlight.comments?.some(comment => 
                comment.content.toLowerCase().includes(searchTerm)
            )) {
                return true;
            }
            // 在全部视图中也索文件名
            if (this.currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
                return true;
            }
            return false;
        });

        // 更新显示
        this.renderHighlights(filteredHighlights);
    }

    private renderHighlights(highlightsToRender: HighlightInfo[], append = false) {
        if (!append) {
            // 在清空容器前清理静态实例集合
            if (typeof HighlightCard.clearAllInstances === 'function') {
                HighlightCard.clearAllInstances();
            } else {
                // 兼容性处理，如果 clearAllInstances 方法不存在
                HighlightCard.clearSelection();
            }
            
            this.highlightContainer.empty();
            this.currentBatch = 0;
            
            // 清除多选状态
            this.selectedHighlights.clear();
            this.isSelectionMode = false;
        }

        if (highlightsToRender.length === 0) {
            // 检查是否有搜索内容
            const hasSearchTerm = this.searchInput && this.searchInput.value.trim() !== '';
            
            const emptyMessage = this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: hasSearchTerm 
                    ? t("No matching highlights found for your search.")
                    : t("The current document has no highlighted content.")
            });
            return;
        }
        
        // 添加框选功能
        this.setupSelectionBox();

        let highlightList = this.highlightContainer.querySelector('.highlight-list') as HTMLElement;
        if (!highlightList) {
            highlightList = this.highlightContainer.createEl("div", {
                cls: "highlight-list"
            });
        }

        highlightsToRender.forEach((highlight) => {
            let highlightCard: HighlightCard;
            // 在具体文件视图下，确保高亮有 filePath
            if (this.currentFile && !highlight.filePath) {
                highlight.filePath = this.currentFile.path;
            }


            
            highlightCard = new HighlightCard(
                highlightList,
                highlight,
                this.plugin,
                {
                    onHighlightClick: async (h: HighlightInfo) => await this.jumpToHighlight(h),
                    onCommentAdd: (h: HighlightInfo) => this.showCommentInput(highlightCard.getElement(), h),
                    onExport: (h: HighlightInfo) => this.exportHighlightAsImage(h),
                    onCommentEdit: (h: HighlightInfo, c: CommentItem) => this.showCommentInput(highlightCard.getElement(), h, c),
                    onAIResponse: async (content: string) => {
                        await this.addComment(highlight, content);
                        await this.updateHighlights();
                    }
                },
                this.isDraggedToMainView,
                // 当显示全部高亮时（currentFile 为 null），使用高亮的 fileName，否则使用当前文件名
                this.currentFile === null ? highlight.fileName : this.currentFile.basename
            );
            
            // 如果高亮已经创建了闪卡，立即更新UI状态
            if (highlight.id && this.highlightsWithFlashcards.has(highlight.id)) {
                // 使用静态方法更新UI，确保闪卡状态正确显示
                // 等待下一帧再更新，确保卡片已经渲染完成
                setTimeout(() => {
                    if (highlight.id) {
                        HighlightCard.updateCardUIByHighlightId(highlight.id);
                    }
                }, 0);
            }

            // 根据位置更新样式
            const cardElement = highlightCard.getElement();
            if (this.isDraggedToMainView) {
                cardElement.classList.add('in-main-view');
                // 找到文本内容元素并移除点击提示
                const textContent = cardElement.querySelector('.highlight-text-content');
                if (textContent) {
                    textContent.removeAttribute('title');
                }
            } else {
                cardElement.classList.remove('in-main-view');
                // 添加点击提示
                const textContent = cardElement.querySelector('.highlight-text-content');
                if (textContent) {
                    textContent.setAttribute('aria-label', 'Jump to highlight');
                }
            }
        });
    }

    private async addComment(highlight: HighlightInfo, content: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file) {
            new Notice(t("No corresponding file found."));
            return;
        }

        // 确保高亮有 ID
        if (!highlight.id) {
            // 使用统一的ID生成策略
            highlight.id = IdGenerator.generateHighlightId(
                this.currentFile?.path || '', 
                highlight.position || 0, 
                highlight.text
            );
        }

        if (!highlight.comments) {
            highlight.comments = [];
        }

        const newComment: CommentItem = {
            id: IdGenerator.generateCommentId(),
            content,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        highlight.comments.push(newComment);
        highlight.updatedAt = Date.now();

        await this.commentStore.addComment(file, highlight as HiNote);

        // 触发更新评论按钮
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));

        // 使用新的刷新方法
        await this.refreshView();
    }

    private async updateComment(highlight: HighlightInfo, commentId: string, content: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        const comment = highlight.comments.find(c => c.id === commentId);
        if (comment) {
            const oldContent = comment.content; // 保存旧内容
            
            comment.content = content;
            comment.updatedAt = Date.now();
            highlight.updatedAt = Date.now();
            await this.commentStore.addComment(file, highlight as HiNote);

            // 触发更新评论按钮
            window.dispatchEvent(new CustomEvent("comment-updated", {
                detail: {
                    text: highlight.text,
                    comments: highlight.comments
                }
            }));
            
            // 通过 EventManager 触发批注更新事件，用于闪卡同步
            if (highlight.id) {
                this.plugin.eventManager.emitCommentUpdate(file.path, oldContent, content, highlight.id);
            }

            // 使用新的刷新方法
            await this.refreshView();
        }
    }

    /**
     * 检查高亮是否已经创建了闪卡
     * @param highlightId 高亮 ID
     * @returns 是否已创建闪卡
     */
    private checkHasFlashcard(highlightId: string): boolean {
        // 获取 fsrsManager
        const plugin = this.plugin;
        const fsrsManager = plugin.fsrsManager;
        if (!fsrsManager || !highlightId) {
            return false;
        }
        
        // 通过 sourceId 查找闪卡
        const cards = fsrsManager.findCardsBySourceId(highlightId, 'highlight');
        return cards && cards.length > 0;
    }

    private async deleteComment(highlight: HighlightInfo, commentId: string) {
        const file = await this.getFileForHighlight(highlight);
        if (!file || !highlight.comments) return;

        highlight.comments = highlight.comments.filter(c => c.id !== commentId);
        highlight.updatedAt = Date.now();

        // 检查高亮是否没有评论了
        if (highlight.comments.length === 0) {
            // 检查高亮是否关联了闪卡
            const hasFlashcard = highlight.id ? this.checkHasFlashcard(highlight.id) : false;
            
            // 如果是虚拟高亮或者没有关联闪卡，则删除整个高亮
            if (highlight.isVirtual || !hasFlashcard) {
                // 从 CommentStore 中删除高亮
                await this.commentStore.removeComment(file, highlight as HiNote);
                
                // 从当前高亮列表中移除
                this.highlights = this.highlights.filter(h => h.id !== highlight.id);
            } else {
                // 有关联闪卡，只更新评论
                await this.commentStore.addComment(file, highlight as HiNote);
            }
        } else {
            // 还有其他评论，只更新评论
            await this.commentStore.addComment(file, highlight as HiNote);
        }

        // 触发更新评论按钮
        window.dispatchEvent(new CustomEvent("comment-updated", {
            detail: {
                text: highlight.text,
                comments: highlight.comments
            }
        }));

        // 使用新的刷新方法
        await this.refreshView();
    }

    private async getFileForHighlight(highlight: HighlightInfo): Promise<TFile | null> {
        // 如果有当前文件，使用当前文件
        if (this.currentFile) {
            return this.currentFile;
        }
        // 如果是全部高亮视图，使用 highlight.filePath 获取文件
        if (highlight.filePath) {
            const file = this.app.vault.getAbstractFileByPath(highlight.filePath);
            if (file instanceof TFile) {
                return file;
            }
        }
        // 如果通过 filePath 找不到，尝试通过 fileName
        if (highlight.fileName) {
            const files = this.app.vault.getFiles();
            const file = files.find(f => f.basename === highlight.fileName || f.name === highlight.fileName);
            if (file) {
                return file;
            }
        }
        return null;
    }

    private generateHighlightId(highlight: HighlightInfo): string {
        // 使用统一的ID生成策略
        return IdGenerator.generateHighlightId(
            this.currentFile?.path || '', 
            highlight.position || 0, 
            highlight.text
        );
    }

    private async jumpToHighlight(highlight: HighlightInfo) {
        if (this.isDraggedToMainView) {
            // 如果在视图中，则不执行转
            return;
        }

        // 如果是全局搜索结果，静默禁止跳转
        if (highlight.isGlobalSearch) {
            return;
        }

        if (!this.currentFile) {
            new Notice(t("No corresponding file found."));
            return;
        }
        await this.locationService.jumpToHighlight(highlight, this.currentFile.path);
    }

    // 修改导出图片功能的方法签名
    private async exportHighlightAsImage(highlight: HighlightInfo & { comments?: CommentItem[] }) {
        try {
            // 动态导入 html2canvas
            const html2canvas = (await import('html2canvas')).default;
            new ExportPreviewModal(this.app, highlight, html2canvas).open();
        } catch (error) {

            new Notice(t("Export failed: Failed to load necessary components."));
        }
    }

    private async showCommentInput(card: HTMLElement, highlight: HighlightInfo, existingComment?: CommentItem) {
        this.currentEditingHighlightId = highlight.id;
        new CommentInput(card, highlight, existingComment, this.plugin, {
            onSave: async (content: string) => {
                if (existingComment) {
                    await this.updateComment(highlight, existingComment.id, content);
                } else {
                    await this.addComment(highlight, content);
                }
                await this.updateHighlights();
            },
            onDelete: existingComment ? async () => {
                await this.deleteComment(highlight, existingComment.id);
            } : undefined,
            onCancel: async () => {
                const currentHighlight = this.highlights.find(h => h.id === this.currentEditingHighlightId);
                if (currentHighlight?.isVirtual && (!currentHighlight.comments || currentHighlight.comments.length === 0)) {
                    // 如果是虚拟高亮且没有评论，删除它
                    const file = await this.getFileForHighlight(currentHighlight);
                    if (file) {
                        await this.commentStore.removeComment(file, currentHighlight as HiNote);
                        this.highlights = this.highlights.filter(h => h.id !== currentHighlight.id);
                        await this.refreshView();
                    }
                }
            }
        }).show();
    }

    async onload() {
        // ... 其他代码保持不变 ...
    }

    // 添加新方法来检查视图位置
    private async checkViewPosition() {
        // 获取根布局
        const root = this.app.workspace.rootSplit;
        if (!root) return;
        
        // 检查当前视图是否在主区域
        const isInMainView = this.isViewInMainArea(this.leaf, root);
        
        if (this.isDraggedToMainView !== isInMainView) {
            // 记录切换前的状态
            const wasInAllHighlightsView = this.isInAllHighlightsView();
            const previousHighlights = [...this.highlights]; // 保存当前高亮列表
            
            // 更新视图位置状态
            this.isDraggedToMainView = isInMainView;

            if (isInMainView) {
                // 在小屏幕移动端，拖拽到主视图时默认显示文件列表
                if (this.checkIfMobile() && this.checkIfSmallScreen()) {
                    this.isShowingFileList = true;
                }
                
                // 拖拽到主视图时，若有激活文档则显示该文档高亮，否则显示全部高亮
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    this.currentFile = activeFile;
                    await this.updateHighlights();
                } else {
                    this.currentFile = null;
                    await this.updateAllHighlights();
                }
                this.updateFileListSelection();
            } else {
                // 如果从主视图切换到侧边栏
                // 如果当前处于 Flashcard 模式，自动清理
                if (this.isFlashcardMode) {
                    this.isFlashcardMode = false;
                    if (this.flashcardComponent) {
                        this.flashcardComponent.deactivate();
                        this.flashcardComponent = null;
                    }
                    this.updateFileListSelection();
                }

                // 重新同步当前文件
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) {
                    // 如果之前是全部高亮视图，需要切换到当前文件视图
                    if (wasInAllHighlightsView) {
                        // 先设置当前文件，避免触发全文件扫描
                        this.currentFile = activeFile;
                        
                        // 先显示加载指示器
                        this.highlightContainer.empty();
                        this.highlightContainer.appendChild(this.loadingIndicator);
                        
                        // 延迟加载当前文件的高亮，提高响应速度
                        setTimeout(() => {
                            this.updateHighlights();
                        }, 10);
                    } else {
                        // 如果之前已经是单文件视图，只需更新当前文件
                        this.currentFile = activeFile;
                        this.updateHighlights();
                    }
                } else {
                    // 没有激活文档，手动清空高亮，显示空提示
                    this.highlights = [];
                    this.renderHighlights([]);
                }
            }

            // 更新视图布局
            this.updateViewLayout();
            
            // 只有在搜索框有内容时才更新高亮列表
            if (this.searchInput && this.searchInput.value.trim() !== '') {
                this.updateHighlightsList();
            }
        }
    }

    // 添加新方法来递归检查视图是否在主区域
    private isViewInMainArea(leaf: WorkspaceLeaf, parent: any): boolean {
        if (!parent) return false;
        if (parent.children) {
            return parent.children.some((child: any) => {
                if (child === leaf) {
                    return true;
                }
                return this.isViewInMainArea(leaf, child);
            });
        }
        return false;
    }
    
    // 检测是否为移动设备
    private checkIfMobile(): boolean {
        return Platform.isMobile;
    }
    
    // 检测是否为小屏幕设备（宽度小于768px）
    private checkIfSmallScreen(): boolean {
        return window.innerWidth < 768;
    }

    // 添加新方法来更新视图布局
    private async updateViewLayout() {
        // 检测设备类型和屏幕大小
        this.isMobileView = this.checkIfMobile();
        this.isSmallScreen = this.checkIfSmallScreen();
        
        // 先清除所有显示相关的类
        this.fileListContainer.removeClass('highlight-display-block');
        this.fileListContainer.removeClass('highlight-display-none');
        this.mainContentContainer.removeClass('highlight-display-none');
        
        // 添加或移除主视图标记类
        const container = this.containerEl.children[1];
        if (this.isDraggedToMainView) {
            container.addClass('is-in-main-view');
        } else {
            container.removeClass('is-in-main-view');
        }
        
        // 添加或移除小屏幕标记类
        if (this.isSmallScreen) {
            container.addClass('is-small-screen');
        } else {
            container.removeClass('is-small-screen');
        }
        
        if (this.isDraggedToMainView) {
            // 更新文件列表
            await this.updateFileList();
            this.createFloatingButton();
            
            if (this.isMobileView && this.isSmallScreen) {
                // 小屏幕移动设备主视图模式（手机）
                if (this.isShowingFileList) {
                    // 显示文件列表，隐藏内容区域
                    this.fileListContainer.addClass('highlight-display-block');
                    this.mainContentContainer.addClass('highlight-display-none');
                    // 添加全宽类，使文件列表占据全部宽度
                    this.fileListContainer.addClass('highlight-full-width');
                } else {
                    // 显示内容区域，隐藏文件列表
                    this.fileListContainer.addClass('highlight-display-none');
                    this.mainContentContainer.removeClass('highlight-display-none');
                    // 移除全宽类
                    this.fileListContainer.removeClass('highlight-full-width');
                }
            } else {
                // 大屏幕设备主视图模式（平板、桌面）- 同时显示文件列表和内容
                this.fileListContainer.addClass('highlight-display-block');
                this.mainContentContainer.removeClass('highlight-display-none');
                // 确保移除全宽类
                this.fileListContainer.removeClass('highlight-full-width');
            }
        } else {
            // 在侧边栏中隐藏文件列表
            this.fileListContainer.addClass('highlight-display-none');
            this.removeFloatingButton();
            
            // 在侧边栏中显示搜索容器（除非在闪卡模式）
            if (!this.isFlashcardMode) {
                this.searchContainer.removeClass('highlight-display-none');
                // 显示搜索图标按钮
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.removeClass('highlight-display-none');
                }
            }
        }
    }
    
    // 修改 updateFileList 方法
    private async updateFileList() {
        // 如果文件列表已经存在，只更新选中状态
        if (this.fileListContainer.children.length > 0) {
            this.updateFileListSelection();
            return;
        }

        // 首次创建文件列表
        this.fileListContainer.empty();
        
        // 创建文件列表标题
        const titleContainer = this.fileListContainer.createEl("div", {
            cls: "highlight-file-list-header"
        });

        titleContainer.createEl("div", {
            text: "HiNote",
            cls: "highlight-file-list-title"
        });

        // 创建文件列表
        const fileList = this.fileListContainer.createEl("div", {
            cls: "highlight-file-list"
        });

        // 添加"全部"选项
        const allFilesItem = fileList.createEl("div", {
            cls: `highlight-file-item highlight-file-item-all ${this.currentFile === null ? 'is-active' : ''}`
        });

        allFilesItem.addEventListener("click", () => {
            this.currentFile = null;
            this.isFlashcardMode = false;
            this.updateHighlights();
            this.updateFileListSelection();
            
            // 显示搜索容器
            this.searchContainer.removeClass('highlight-display-none');
            
            // 隐藏搜索图标按钮
            const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
            if (iconButtons) {
                iconButtons.addClass('highlight-display-none');
            }
        });

        // 创建左侧内容容器
        const allFilesLeft = allFilesItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 创建"全部"图标
        const allIcon = allFilesLeft.createEl("span", {
            cls: "highlight-file-item-icon"
        });
        setIcon(allIcon, 'square-library');

        // 创建"全部"文本
        allFilesLeft.createEl("span", {
            text: t("All Highlight"),
            cls: "highlight-file-item-name"
        });

        // 创建闪卡按钮的容器
        const flashcardItem = fileList.createEl("div", {
            cls: "highlight-file-item highlight-file-item-flashcard"
        });

        flashcardItem.addEventListener("click", async () => {
            // 更新文件列表选中状态
            this.currentFile = null;
            this.isFlashcardMode = true;
            this.updateFileListSelection();
            
            // 隐藏搜索容器
            this.searchContainer.addClass('highlight-display-none');

            // 清空当前容器
            this.highlightContainer.empty();
            
            // 创建或更新闪卡组件
            if (!this.flashcardComponent) {
                this.flashcardComponent = new FlashcardComponent(this.highlightContainer, this.plugin);
                this.flashcardComponent.setLicenseManager(this.licenseManager);
            }
            
            // 在小屏幕移动端主视图模式下，点击闪卡后切换到内容视图
            if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                this.isShowingFileList = false;
                this.updateViewLayout();
            }
            
            // 激活闪卡组件
            await this.flashcardComponent.activate();
        });

        const flashcardLeft = flashcardItem.createEl("div", {
            cls: "highlight-file-item-left"
        });

        // 添加图标
        const flashcardIcon = flashcardLeft.createEl("span", {
            cls: "highlight-file-item-icon"
        });
        setIcon(flashcardIcon, 'book-heart');

        flashcardLeft.createEl("span", {
            text: t("HiCard"),
            cls: "highlight-file-item-name"
        });

        // 创建卡片数量标签
        const flashcardCount = flashcardItem.createEl("span", {
            cls: "highlight-file-item-count"
        });

        // 更新卡片数量的函数
        const updateFlashcardCount = async () => {
            // 使用 getTotalCardsCount() 获取所有卡片的总数
            const totalCards = this.plugin.fsrsManager.getTotalCardsCount();
            flashcardCount.textContent = `${totalCards}`;
        };

        // 初始化卡片数量
        updateFlashcardCount();

        // 监听闪卡变化事件
        this.registerEvent(
            this.plugin.eventManager.on('flashcard:changed', () => {
                updateFlashcardCount();
            })
        );

        flashcardLeft.addEventListener("click", async () => {
            // 获取最新版本的卡片
            // 检查是否有可用的分组
            const groups = this.plugin.fsrsManager.getCardGroups();
            let latestCards: any[] = [];
            
            if (groups && groups.length > 0) {
                // 使用第一个分组的ID获取卡片
                const groupId = groups[0].id;
                latestCards = this.plugin.fsrsManager.getCardsForStudy(groupId);
                
                // 清空当前容器
                this.highlightContainer.empty();
                
                // 创建或更新闪卡组件
                if (!this.flashcardComponent) {
                    this.flashcardComponent = new FlashcardComponent(this.highlightContainer, this.plugin);
                    this.flashcardComponent.setLicenseManager(this.licenseManager);
                }
                
                // 激活闪卡组件
                await this.flashcardComponent.activate();
                
                // 更新文件列表选中状态
                this.updateFileListSelection();
            } else {
                // 如果没有分组，不做任何处理
            }
        });

        // 获取所有文件的高亮总数
        const totalHighlights = await this.getTotalHighlightsCount();
        
        // 创建高亮数量标签
        allFilesItem.createEl("span", {
            text: `${totalHighlights}`,
            cls: "highlight-file-item-count"
        });

        // 添加分隔线
        fileList.createEl("div", {
            cls: "highlight-file-list-separator"
        });

        // 修改点击事件
        allFilesItem.addEventListener("click", async () => {
            this.currentFile = null;
            this.isFlashcardMode = false;
            // 确保清理 Flashcard 组件
            if (this.flashcardComponent) {
                this.flashcardComponent.deactivate();
                this.flashcardComponent = null;
            }
            this.updateFileListSelection();
            
            // 在小屏幕移动端主视图模式下，点击"全部"后切换到内容视图
            if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                this.isShowingFileList = false;
                this.updateViewLayout();
            }
            
            await this.updateAllHighlights();
        });

        // 获取所有包含高亮的文件
        const files = await this.getFilesWithHighlights();
        
        // 为每个文件创建一个列表项
        for (const file of files) {
            const fileItem = fileList.createEl("div", {
                cls: `highlight-file-item ${this.currentFile?.path === file.path ? 'is-active' : ''}`
            });
            fileItem.setAttribute('data-path', file.path);

            // 创建左侧内容容器
            const fileItemLeft = fileItem.createEl("div", {
                cls: "highlight-file-item-left"
            });

            // 创建文件图标
            const fileIcon = fileItemLeft.createEl("span", {
                cls: "highlight-file-item-icon",
                attr: {
                    'aria-label': t('Open (DoubleClick)'),
                }
            });
            setIcon(fileIcon, 'file-text');

            // 为文件图标添加双击事件
            fileIcon.addEventListener("dblclick", async (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                const leaf = this.getPreferredLeaf();
                await leaf.openFile(file);
            });

            // 创建文件名
            const fileNameEl = fileItemLeft.createEl("span", {
                text: file.basename,
                cls: "highlight-file-item-name"
            });

            // 添加页面预览功能
            this.addPagePreview(fileNameEl, file);

            // 获取文件的高亮数量
            const highlightCount = await this.getFileHighlightsCount(file);
            
            // 创建高亮数量标签
            fileItem.createEl("span", {
                text: `${highlightCount}`,
                cls: "highlight-file-item-count"
            });

            // 添加点击事件
            fileItem.addEventListener("click", async () => {
                this.currentFile = file;
                this.isFlashcardMode = false;
                // 确保清理 Flashcard 组件
                if (this.flashcardComponent) {
                    this.flashcardComponent.deactivate();
                    this.flashcardComponent = null;
                }
                this.updateFileListSelection();
                // 显示搜索容器
                this.searchContainer.removeClass('highlight-display-none');
                // 显示搜索图标按钮
                const iconButtons = this.searchContainer.querySelector('.highlight-search-icons') as HTMLElement;
                if (iconButtons) {
                    iconButtons.removeClass('highlight-display-none');
                }
                
                // 在小屏幕移动端主视图模式下，点击文件后切换到内容视图
                if (this.isMobileView && this.isSmallScreen && this.isDraggedToMainView) {
                    this.isShowingFileList = false;
                    this.updateViewLayout();
                }
                
                await this.updateHighlights();
            });
        }
    }

    // 添加新方法：只更新文件列表的选中状态
    private updateFileListSelection() {
        // 更新"全部"选项的选中状态
        const allFilesItem = this.fileListContainer.querySelector('.highlight-file-item-all');
        if (allFilesItem) {
            allFilesItem.classList.toggle('is-active', this.currentFile === null && !this.isFlashcardMode);
        }

        // 更新闪卡选项的选中状态
        const flashcardItem = this.fileListContainer.querySelector('.highlight-file-item-flashcard');
        if (flashcardItem) {
            flashcardItem.classList.toggle('is-active', this.isFlashcardMode);
        }

        // 更新文件项的选中状态
        const fileItems = this.fileListContainer.querySelectorAll('.highlight-file-item:not(.highlight-file-item-all):not(.highlight-file-item-flashcard)');
        fileItems.forEach((item: HTMLElement) => {
            const isActive = this.currentFile?.path === item.getAttribute('data-path');
            item.classList.toggle('is-active', isActive);
        });
    }

    // 添加新方法来获取所有包含高亮的文件
    async getFilesWithHighlights(): Promise<TFile[]> {
        const allFiles = await this.app.vault.getMarkdownFiles();
        const files = allFiles.filter(file => this.highlightService.shouldProcessFile(file));
        const filesWithHighlights: TFile[] = [];
        
        for (const file of files) {
            const content = await this.app.vault.read(file);
            if (this.highlightService.extractHighlights(content, file).length > 0) {
                filesWithHighlights.push(file);
            }
        }
        
        return filesWithHighlights;
    }

    // 添加新方法来更新全部高亮
    private async updateAllHighlights(searchTerm: string = '', searchType: string = '') {
        // 重置批次计数
        this.currentBatch = 0;
        this.highlights = [];

        // 清空容器并添加加载指示
        this.highlightContainer.empty();
        this.highlightContainer.appendChild(this.loadingIndicator);

        try {
            // 如果是路径搜索，先获取所有高亮然后按路径过滤
            if (searchType === 'path') {
                // 获取所有高亮
                const allHighlights = await this.highlightService.getAllHighlights();
                
                // 创建所有文件的批注映射
                const fileCommentsMap = new Map<string, HiNote[]>();
                
                // 获取所有文件
                const allFiles = this.app.vault.getMarkdownFiles();
                
                // 预先加载所有文件的批注
                for (const file of allFiles) {
                    const fileComments = this.commentStore.getFileComments(file);
                    if (fileComments && fileComments.length > 0) {
                        fileCommentsMap.set(file.path, fileComments);
                    }
                }
                
                // 处理所有高亮
                this.highlights = [];
                
                for (const { file, highlights } of allHighlights) {
                    // 如果有搜索词，先检查文件路径是否匹配
                    if (searchTerm && !file.path.toLowerCase().includes(searchTerm.toLowerCase())) {
                        continue; // 跳过不匹配的文件
                    }
                    
                    // 获取当前文件的所有批注
                    const fileComments = fileCommentsMap.get(file.path) || [];
                    
                    // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
                    const usedCommentIds = new Set<string>();
                    
                    // 处理每个高亮
                    const processedHighlights = highlights.map(highlight => {
                        // 匹配批注的逻辑保持不变
                        let storedComment = fileComments.find(c => 
                            !usedCommentIds.has(c.id) && c.id === highlight.id
                        );
                        
                        if (!storedComment) {
                            storedComment = fileComments.find(c => {
                                if (usedCommentIds.has(c.id)) return false;
                                
                                const textMatch = c.text === highlight.text;
                                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                                    return Math.abs(c.position - highlight.position) < 1000;
                                }
                                return textMatch;
                            });
                        }
                        
                        if (!storedComment && highlight.position !== undefined) {
                            const highlightPos = highlight.position;
                            storedComment = fileComments.find(c => 
                                !usedCommentIds.has(c.id) && 
                                c.position !== undefined && 
                                Math.abs(c.position - highlightPos) < 50
                            );
                        }
                        
                        if (storedComment) {
                            usedCommentIds.add(storedComment.id);
                            
                            return {
                                ...highlight,
                                id: storedComment.id,
                                comments: storedComment.comments || [],
                                createdAt: storedComment.createdAt,
                                updatedAt: storedComment.updatedAt,
                                fileName: file.basename,
                                filePath: file.path,
                                fileIcon: 'file-text'
                            };
                        }
                        
                        return {
                            ...highlight,
                            comments: highlight.comments || [],
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text'
                        };
                    });
                    
                    this.highlights.push(...processedHighlights);
                    
                    // 添加虚拟高亮（只有批注的高亮）
                    const virtualHighlights = fileComments
                        .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
                    
                    virtualHighlights.forEach(vh => {
                        usedCommentIds.add(vh.id);
                        this.highlights.push({
                            ...vh,
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text',
                            position: vh.position || 0
                        });
                    });
                }
                
                // 初始加载
                await this.loadMoreHighlights();
                return;
            }
            
            // 如果有搜索词，使用文件级索引系统进行搜索
            if (searchTerm) {
                const startTime = Date.now();
                
                // 使用索引搜索高亮
                const searchResults = await this.highlightService.searchHighlightsFromIndex(searchTerm);
                
                // 处理搜索结果
                this.highlights = searchResults.map(highlight => ({
                    ...highlight,
                    comments: highlight.comments || [],
                    fileName: highlight.fileName || (highlight.filePath ? highlight.filePath.split('/').pop()?.replace('.md', '') : ''),
                    filePath: highlight.filePath || '',
                    fileIcon: 'file-text'
                }));
                
                // 初始加载
                await this.loadMoreHighlights();
                return;
            }
            
            // 如果没有搜索词，使用传统方法获取所有高亮
            const allHighlights = await this.highlightService.getAllHighlights();
            
            // 创建所有文件的批注映射
            const fileCommentsMap = new Map<string, HiNote[]>();
            
            // 获取所有文件
            const allFiles = this.app.vault.getMarkdownFiles();
            
            // 预先加载所有文件的批注
            for (const file of allFiles) {
                const fileComments = this.commentStore.getFileComments(file);
                if (fileComments && fileComments.length > 0) {
                    fileCommentsMap.set(file.path, fileComments);
                }
            }
            
            // 处理所有高亮
            this.highlights = [];
            
            for (const { file, highlights } of allHighlights) {
                // 获取当前文件的所有批注
                const fileComments = fileCommentsMap.get(file.path) || [];
                
                // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
                const usedCommentIds = new Set<string>();
                
                // 处理每个高亮
                const processedHighlights = highlights.map(highlight => {
                    // 1. 先尝试精确匹配 ID
                    let storedComment = fileComments.find(c => 
                        !usedCommentIds.has(c.id) && c.id === highlight.id
                    );
                    
                    // 2. 如果没有精确匹配，尝试文本和位置匹配
                    if (!storedComment) {
                        storedComment = fileComments.find(c => {
                            if (usedCommentIds.has(c.id)) return false;
                            
                            const textMatch = c.text === highlight.text;
                            if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                                // 如果文本匹配且都有位置信息，检查是否在同一段落内
                                return Math.abs(c.position - highlight.position) < 1000;
                            }
                            return textMatch; // 如果没有位置信息，只比较文本
                        });
                    }
                    
                    // 3. 如果还是没有匹配，尝试仅使用位置匹配
                    if (!storedComment && highlight.position !== undefined) {
                        // 由于上面的条件已经确保 highlight.position 不为 undefined，
                        // 这里可以安全地使用它，但为了类型安全，我们使用一个临时变量
                        const highlightPos = highlight.position;
                        storedComment = fileComments.find(c => 
                            !usedCommentIds.has(c.id) && 
                            c.position !== undefined && 
                            Math.abs(c.position - highlightPos) < 50
                        );
                    }
                    
                    if (storedComment) {
                        // 标记这个批注ID已被使用
                        usedCommentIds.add(storedComment.id);
                        
                        // 返回合并后的高亮对象
                        return {
                            ...highlight,
                            id: storedComment.id, // 使用存储的批注ID
                            comments: storedComment.comments || [],
                            createdAt: storedComment.createdAt,
                            updatedAt: storedComment.updatedAt,
                            fileName: file.basename,
                            filePath: file.path,
                            fileIcon: 'file-text'
                        };
                    }
                    
                    // 如果没有匹配的批注，返回原始高亮并添加文件信息
                    return {
                        ...highlight,
                        comments: highlight.comments || [],
                        fileName: file.basename,
                        filePath: file.path,
                        fileIcon: 'file-text'
                    };
                });
                
                // 添加处理后的高亮到结果中
                this.highlights.push(...processedHighlights);
                
                // 添加虚拟高亮（只有批注的高亮）
                const virtualHighlights = fileComments
                    .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id));
                
                // 将这些虚拟高亮添加到列表并标记为已使用
                virtualHighlights.forEach(vh => {
                    usedCommentIds.add(vh.id);
                    this.highlights.push({
                        ...vh,
                        fileName: file.basename,
                        filePath: file.path,
                        fileIcon: 'file-text',
                        position: vh.position || 0 // 确保 position 不为 undefined
                    });
                });
            }
            
            // 初始加载
            await this.loadMoreHighlights();
            
            // 添加滚动监听
            const handleScroll = debounce(async (e: Event) => {
                const container = e.target as HTMLElement;
                const { scrollTop, scrollHeight, clientHeight } = container;
                // 当滚动到底部附近时加载更多
                if (scrollHeight - scrollTop - clientHeight < 300) {
                    await this.loadMoreHighlights();
                }
            }, 100);
            
            // 注册和清理滚动监听
            this.highlightContainer.addEventListener('scroll', handleScroll);
            this.register(() => this.highlightContainer.removeEventListener('scroll', handleScroll));
            
        } catch (error) {
            console.error('[CommentView] Error in updateAllHighlights:', error);
            new Notice(t("Error loading all highlights"));
            this.highlightContainer.empty();
            this.highlightContainer.createEl("div", {
                cls: "highlight-empty-state",
                text: t("Error loading highlights. Please try again.")
            });
        } finally {
            this.loadingIndicator.removeClass('highlight-display-block');
        }
    }


    // 添加新方法：加载更多高亮
    private async loadMoreHighlights() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.loadingIndicator.addClass('highlight-display-block');

    try {
        const start = this.currentBatch * this.BATCH_SIZE;
        const batch = this.highlights.slice(start, start + this.BATCH_SIZE);

        if (batch.length === 0) {
            this.loadingIndicator.remove();
            return;
        }

        // 渲染新的高亮
        await this.renderHighlights(batch, true);
        this.currentBatch++;
    } catch (error) {
        new Notice("加载高亮内容时出错");
    } finally {
        this.isLoading = false;
        this.loadingIndicator.addClass('highlight-display-none');
    }
}


    // 添加新方法来获取文件的高亮数量
    private async getFileHighlightsCount(file: TFile): Promise<number> {
        const content = await this.app.vault.read(file);
        return this.highlightService.extractHighlights(content, file).length;
    }

    // 添加新方法：获取所有文件的高亮总数
    private async getTotalHighlightsCount(): Promise<number> {
        const files = await this.getFilesWithHighlights();
        let total = 0;
        for (const file of files) {
            total += await this.getFileHighlightsCount(file);
        }
        return total;
    }

    // 添加创建浮动按钮的方法
    private createFloatingButton() {
        if (this.floatingButton) return;
        
        this.floatingButton = document.createElement('div');
        this.floatingButton.className = 'highlight-floating-button';
        
        const icon = document.createElement('span');
        setIcon(icon, 'bot-message-square');
        this.floatingButton.appendChild(icon);
        
        // 使用 getInstance 方法
        this.floatingButton.addEventListener('click', (e) => {
            // 阻止事件冒泡和默认行为
            e.preventDefault();
            e.stopPropagation();
            
            try {
                const chatView = ChatView.getInstance(this.app, this.plugin);
                
                // 确保在下一个事件循环中显示对话框
                setTimeout(() => {
                    chatView.show();
                }, 0);
            } catch (error) {
                console.error('创建ChatView失败:', error);
            }
        });
        
        document.body.appendChild(this.floatingButton);
        
        // 注册活动叶子变化的事件处理器
        this.registerActiveLeafChangeHandler();
    }

    // 添加移除浮动按钮的方法
    private removeFloatingButton() {
        if (this.floatingButton) {
            this.floatingButton.remove();
            this.floatingButton = null;
        }
        
        // 移除活动叶子变化的事件处理器
        this.unregisterActiveLeafChangeHandler();
    }
    
    // 注册活动叶子变化的事件处理器
    private registerActiveLeafChangeHandler() {
        // 如果已经注册过，先移除
        this.unregisterActiveLeafChangeHandler();
        
        // 创建事件处理器
        this.activeLeafChangeHandler = () => {
            this.updateFloatingButtonVisibility();
            
            // 清理高亮卡片实例
            if (typeof HighlightCard.clearAllInstances === 'function') {
                HighlightCard.clearAllInstances();
            }
            
            // 重新加载高亮
            this.updateHighlights();
        };
        
        // 注册事件
        this.app.workspace.on('active-leaf-change', this.activeLeafChangeHandler);
        
        // 初始化按钮可见性
        this.updateFloatingButtonVisibility();
    }
    
    // 移除活动叶子变化的事件处理器
    private unregisterActiveLeafChangeHandler() {
        if (this.activeLeafChangeHandler) {
            this.app.workspace.off('active-leaf-change', this.activeLeafChangeHandler);
            this.activeLeafChangeHandler = undefined;
        }
    }
    
    // 更新浮动按钮的可见性
    private updateFloatingButtonVisibility() {
        if (!this.floatingButton) return;
        
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view && activeLeaf.view.getViewType() === VIEW_TYPE_COMMENT) {
            // 如果当前活动视图是 CommentView，显示浮动按钮
            this.floatingButton.style.display = 'flex';
        } else {
            // 否则隐藏浮动按钮
            this.floatingButton.style.display = 'none';
        }
    }

    // 在 onunload 方法中确保清理
    onunload() {
        this.removeFloatingButton();
        this.unregisterActiveLeafChangeHandler();
    }

    // Update AI-related dropdowns
    updateAIDropdowns(): void {
        // 更新所有 AIButton 实例的下拉菜单
        this.aiButtons.forEach(button => {

        });
        // 触发事件以便其他组件也能更新
        this.app.workspace.trigger('comment-view:update-ai-dropdowns');
    }

    // 注册 AIButton 实例
    registerAIButton(button: AIButton): void {
        this.aiButtons.push(button);
    }

    // 注销 AIButton 实例
    unregisterAIButton(button: AIButton): void {
        const index = this.aiButtons.indexOf(button);
        if (index !== -1) {
            this.aiButtons.splice(index, 1);
        }
    }

    // 添加新方法来判断是否在全部高亮视图
    private isInAllHighlightsView(): boolean {
        return this.currentFile === null;
    }
    
    // 添加方法来更新高亮列表显示（搜索筛选）

    
    /**
     * 根据搜索词和搜索类型过滤高亮
     * @param searchTerm 搜索词
     * @param searchType 搜索类型（hicard 表示搜索闪卡）
     * @returns 过滤后的高亮列表
     */
    private filterHighlightsByTerm(searchTerm: string, searchType: string = ''): HighlightInfo[] {
        // 如果是按路径搜索，需要过滤出路径匹配的高亮
        if (searchType === 'path') {
            // 确保所有高亮都有文件名和路径信息
            this.highlights.forEach(highlight => {
                if (highlight.filePath && !highlight.fileName) {
                    // 从路径中提取文件名
                    const pathParts = highlight.filePath.split('/');
                    highlight.fileName = pathParts[pathParts.length - 1];
                }
            });
            
            // 如果搜索词为空，返回所有有文件路径的高亮
            if (!searchTerm || searchTerm.trim() === '') {
                return this.highlights.filter(highlight => !!highlight.filePath);
            }
            
            // 如果有搜索词，过滤出路径匹配的高亮
            return this.highlights.filter(highlight => {
                if (!highlight.filePath) {
                    return false;
                }
                
                // 将路径转换为小写进行不区分大小写的匹配
                const filePath = highlight.filePath.toLowerCase();
                return filePath.includes(searchTerm.toLowerCase());
            });
        }
        
        // 如果是搜索闪卡，需要先过滤出已转化为闪卡的高亮
        if (searchType === 'hicard') {
            // 获取 FSRS 管理器
            const fsrsManager = this.plugin.fsrsManager;
            if (!fsrsManager) {
                return [];
            }
            
            // 过滤出已转化为闪卡的高亮
            return this.highlights.filter(highlight => {
                // 检查高亮是否已转化为闪卡
                const hasFlashcard = highlight.id ? 
                    fsrsManager.findCardsBySourceId(highlight.id, 'highlight').length > 0 : 
                    false;
                
                // 如果没有转化为闪卡，直接过滤掉
                if (!hasFlashcard) {
                    return false;
                }
                
                // 如果有搜索词，还需要匹配搜索词
                if (searchTerm) {
                    // 搜索高亮文本
                    if (highlight.text.toLowerCase().includes(searchTerm)) {
                        return true;
                    }
                    // 搜索评论内容
                    if (highlight.comments?.some(comment => 
                        comment.content.toLowerCase().includes(searchTerm)
                    )) {
                        return true;
                    }
                    // 在全部视图中也搜索文件名
                    if (this.currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
                        return true;
                    }
                    return false;
                }
                
                // 如果没有搜索词，返回所有已转化为闪卡的高亮
                return true;
            });
        }
        
        // 如果是搜索批注，需要先过滤出包含批注的高亮
        if (searchType === 'comment') {
            // 过滤出包含批注的高亮
            return this.highlights.filter(highlight => {
                // 检查高亮是否包含批注
                const hasComments = highlight.comments && highlight.comments.length > 0;
                
                // 如果没有批注，直接过滤掉
                if (!hasComments) {
                    return false;
                }
                
                // 如果有搜索词，还需要匹配搜索词
                if (searchTerm) {
                    // 搜索高亮文本
                    if (highlight.text.toLowerCase().includes(searchTerm)) {
                        return true;
                    }
                    // 搜索评论内容
                    // 由于我们已经检查了 hasComments，所以 highlight.comments 一定存在
                    if (highlight.comments && highlight.comments.some(comment => 
                        comment.content.toLowerCase().includes(searchTerm)
                    )) {
                        return true;
                    }
                    // 在全部视图中也搜索文件名
                    if (this.currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
                        return true;
                    }
                    return false;
                }
                
                // 如果没有搜索词，返回所有包含批注的高亮
                return true;
            });
        }
        
        // 常规搜索逻辑
        return this.highlights.filter(highlight => {
            // 搜索高亮文本
            if (highlight.text.toLowerCase().includes(searchTerm)) {
                return true;
            }
            // 搜索评论内容
            if (highlight.comments?.some(comment => 
                comment.content.toLowerCase().includes(searchTerm)
            )) {
                return true;
            }
            // 在全部视图中也搜索文件名
            if (this.currentFile === null && highlight.fileName?.toLowerCase().includes(searchTerm)) {
                return true;
            }
            return false;
        });
    }

    /**
     * 显示搜索前缀提示
     * 当搜索框获得焦点时显示可用的搜索前缀提示
     */
    private showSearchPrefixHints() {
        // 移除可能已存在的提示元素
        const existingHints = document.querySelector('.search-prefix-hints');
        if (existingHints) {
            existingHints.remove();
        }
        
        // 使用 Obsidian 的 createDiv 方法创建提示容器
        const hintsContainer = document.body.createDiv({
            cls: 'search-prefix-hints show'
        });
        
        // 定义可用的搜索前缀
        const prefixes = [
            { prefix: 'all:', description: t('search-prefix-all') },
            { prefix: 'path:', description: t('search-prefix-path') },
            { prefix: 'hicard:', description: t('search-prefix-hicard') },
            { prefix: 'comment:', description: t('search-prefix-comment') }
        ];
        
        // 创建提示项
        prefixes.forEach(({ prefix, description }) => {
            const hintItem = hintsContainer.createDiv({
                cls: 'search-prefix-hint-item'
            });
            
            const prefixTag = hintItem.createSpan({
                cls: 'search-prefix-tag',
                text: prefix
            });
            
            const descriptionEl = hintItem.createSpan({
                cls: 'search-prefix-description',
                text: description
            });
            
            // 添加点击事件
            hintItem.addEventListener('click', () => {
                this.searchInput.value = prefix + ' ';
                this.searchInput.focus();
                hintsContainer.remove();
                
                // 触发搜索
                const inputEvent = new Event('input', { bubbles: true });
                this.searchInput.dispatchEvent(inputEvent);
            });
        });
        
        // 定位提示容器
        this.positionSearchHints(hintsContainer);
        
        // 添加输入事件监听器，处理输入变化
        const handleInputChange = () => {
            // 获取当前搜索框的值
            const inputValue = this.searchInput.value.trim();
            
            // 如果搜索框为空，则显示提示框
            if (inputValue === '') {
                // 如果提示框已经被移除，重新显示
                if (!document.body.contains(hintsContainer)) {
                    // 重新显示提示框
                    document.body.appendChild(hintsContainer);
                    this.positionSearchHints(hintsContainer);
                }
            } else {
                // 如果搜索框不为空，则隐藏提示框
                if (hintsContainer && document.body.contains(hintsContainer)) {
                    hintsContainer.remove();
                }
            }
        };
        
        // 添加输入事件监听器
        this.searchInput.addEventListener('input', handleInputChange);
        
        // 点击其他区域隐藏提示框
        const hideHintsOnClickOutside = (e: MouseEvent) => {
            if (hintsContainer && !hintsContainer.contains(e.target as Node) && 
                e.target !== this.searchInput) {
                hintsContainer.remove();
                document.removeEventListener('click', hideHintsOnClickOutside);
            }
        };
        
        // 在搜索框失去焦点时清理输入事件监听器
        const handleBlur = () => {
            // 不立即隐藏，允许点击提示项
            setTimeout(() => {
                // 检查提示框是否仍然存在，如果用户点击了其他区域
                if (!document.activeElement || 
                    (document.activeElement !== this.searchInput && 
                     !hintsContainer.contains(document.activeElement as Node))) {
                    hintsContainer.remove();
                }
            }, 200);
        };
        
        // 添加失去焦点事件监听器
        this.searchInput.addEventListener('blur', handleBlur);
        
        // 添加点击事件监听器，使用延时确保当前点击不触发隐藏
        setTimeout(() => {
            document.addEventListener('click', hideHintsOnClickOutside);
        }, 10);
        
        // 存储事件监听器引用，便于组件销毁时清理
        this.searchHintsEventHandlers = {
            input: handleInputChange,
            blur: handleBlur,
            click: hideHintsOnClickOutside
        };
    }
    
    /**
     * 定位搜索提示容器
     * @param hintsContainer 提示容器元素
     */
    private positionSearchHints(hintsContainer: HTMLElement) {
        // 获取搜索框的位置和尺寸
        const searchRect = this.searchInput.getBoundingClientRect();
        
        // 添加 CSS 类并设置位置相关的样式
        hintsContainer.addClass('search-hints-container');
        // 只设置位置相关的样式，其他样式通过 CSS 类控制
        hintsContainer.style.top = (searchRect.bottom + 4) + 'px';
        hintsContainer.style.left = searchRect.left + 'px';
        hintsContainer.style.width = searchRect.width + 'px';
    }
    
    /**
     * 更新高亮列表，支持多种前缀搜索
     * - all: 前缀进行跨文件搜索
     * - hicard: 前缀搜索已转化为闪卡的高亮
     * - comment: 前缀搜索包含批注的高亮
     */
    /**
     * 搜索输入防抖处理函数
     * 根据搜索类型使用不同的防抖时间
     */
    private handleSearchInputWithDebounce = (e: Event) => {
        // 清除之前的定时器
        if (this.searchDebounceTimer !== null) {
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = null;
        }
        
        // 获取搜索输入值
        const searchInput = this.searchInput.value.toLowerCase().trim();
        
        // 根据搜索类型决定防抖时间
        const isGlobalSearch = searchInput.startsWith('all:');
        const debounceTime = isGlobalSearch ? this.globalSearchDebounceTime : this.localSearchDebounceTime;
        
        // 如果是全局搜索且搜索词不为空，显示加载指示器
        if (isGlobalSearch && searchInput.length > 4) {
            this.showSearchLoadingIndicator();
        }
        
        // 设置防抖定时器
        this.searchDebounceTimer = window.setTimeout(() => {
            this.updateHighlightsList();
            this.searchDebounceTimer = null;
        }, debounceTime);
    };
    
    /**
     * 显示搜索加载指示器
     */
    private showSearchLoadingIndicator(): void {
        if (!this.isSearching) {
            this.isSearching = true;
            this.searchLoadingIndicator.style.display = "flex";
        }
    }
    
    /**
     * 隐藏搜索加载指示器
     */
    private hideSearchLoadingIndicator(): void {
        if (this.isSearching) {
            this.isSearching = false;
            this.searchLoadingIndicator.style.display = "none";
        }
    }
    
    private async updateHighlightsList() {
        try {
            // 获取搜索词并检查是否包含前缀
            const searchInput = this.searchInput.value.toLowerCase().trim();
            const isGlobalSearch = searchInput.startsWith('all:');
            const isHiCardSearch = searchInput.startsWith('hicard:');
            const isCommentSearch = searchInput.startsWith('comment:');
            const isPathSearch = searchInput.startsWith('path:'); // 添加 path: 前缀检查
            
            // 确定搜索类型
            let searchType = '';
            if (isGlobalSearch) {
                searchType = 'all';
            } else if (isHiCardSearch) {
                searchType = 'hicard';
            } else if (isCommentSearch) {
                searchType = 'comment';
            } else if (isPathSearch) {
                searchType = 'path'; // 设置搜索类型为 path
            }
            
            // 提取搜索词（去掉前缀）
            let searchTerm = searchInput;
            if (isGlobalSearch) {
                searchTerm = searchInput.substring(4).trim();
            } else if (isHiCardSearch) {
                searchTerm = searchInput.substring(7).trim();
            } else if (isCommentSearch) {
                searchTerm = searchInput.substring(8).trim();
            } else if (isPathSearch) {
                searchTerm = searchInput.substring(5).trim(); // 去掉 'path:' 前缀
            }
            
            // 检查是否需要恢复到当前文件视图
            // 如果之前是全局搜索，但现在不是，则需要恢复
            const wasGlobalSearch = this.highlights.some(h => h.isGlobalSearch);
            if (wasGlobalSearch && !isGlobalSearch && this.currentFile) {
                // 恢复到当前文件视图
                this.highlightContainer.empty();
                this.highlightContainer.appendChild(this.loadingIndicator);
                
                // 重新加载当前文件的高亮
                await this.updateHighlights();
                
                // 标记所有高亮为非全局搜索结果
                this.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                
                // 使用实际搜索词过滤
                const filteredHighlights = this.filterHighlightsByTerm(searchTerm, searchType);
                
                // 更新显示
                this.renderHighlights(filteredHighlights);
                return;
            }
            
            // 如果是全局搜索或路径搜索，且不在全局视图中
            if ((isGlobalSearch || isPathSearch) && this.currentFile !== null) {
                // 显示加载指示器
                this.highlightContainer.empty();
                this.highlightContainer.appendChild(this.loadingIndicator);
                
                // 保存当前文件引用
                const originalFile = this.currentFile;
                
                try {
                    // 临时设置为 null 以启用全局搜索
                    this.currentFile = null;
                    
                    // 直接使用索引搜索，将搜索词和搜索类型传递给 updateAllHighlights 方法
                    await this.updateAllHighlights(searchTerm, searchType);
                    
                    // 标记所有高亮为全局搜索结果
                    this.highlights.forEach(highlight => {
                        highlight.isGlobalSearch = true;
                    });
                    
                    // 直接渲染索引搜索结果，因为索引搜索已经过滤了结果
                    this.renderHighlights(this.highlights);
                } finally {
                    // 恢复原始文件引用
                    this.currentFile = originalFile;
                    // 隐藏搜索加载指示器
                    this.hideSearchLoadingIndicator();
                }
            } else {
                // 常规搜索逻辑
                // 确保非全局搜索结果不会标记为全局搜索
                this.highlights.forEach(highlight => {
                    highlight.isGlobalSearch = false;
                });
                
                const filteredHighlights = this.filterHighlightsByTerm(searchTerm, searchType);
                this.renderHighlights(filteredHighlights);
                
                // 隐藏加载指示器（如果有的话）
                this.hideSearchLoadingIndicator();
            }
        } catch (error) {
            // 错误处理
            console.error('[高亮搜索] 搜索过程中出错:', error);
            this.hideSearchLoadingIndicator();
        }
    }

    // 修改更新视图的方法
    private async refreshView() {
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
        } else {
            await this.updateHighlights();
        }
    }
    
    // 更新单个文件的高亮
    private async updateHighlights(isInCanvas: boolean = false) {
        // 如果在全部高亮视图，使用 updateAllHighlights
        if (this.isInAllHighlightsView()) {
            await this.updateAllHighlights();
            return;
        }

        // 以下是单文件视图的逻辑
        if (!this.currentFile) {
            this.renderHighlights([]);
            return;
        }
        
        // 检查是否是 Canvas 文件
        if (this.currentFile.extension === 'canvas') {
            // 如果是 Canvas 文件，使用专门的处理方法
            await this.handleCanvasFile(this.currentFile);
            return;
        }

        // 检查文件是否应该被排除
        if (!this.highlightService.shouldProcessFile(this.currentFile)) {
            this.renderHighlights([]);
            return;
        }

        const content = await this.app.vault.read(this.currentFile);
        const highlights = this.highlightService.extractHighlights(content, this.currentFile!);
        
        // 获取已存储的评论
        const storedComments = this.commentStore.getFileComments(this.currentFile);
        
        // 创建一个集合来跟踪已使用的批注ID，防止重复匹配
        const usedCommentIds = new Set<string>();
        
        // 合并高亮和评论数据
        this.highlights = highlights.map(highlight => {
            // 1. 首先尝试精确匹配
            let storedComment = storedComments.find(c => {
                // 如果这个批注ID已经被使用过，跳过它
                if (usedCommentIds.has(c.id)) return false;
                
                const textMatch = c.text === highlight.text;
                if (textMatch && highlight.position !== undefined && c.position !== undefined) {
                    return Math.abs(c.position - highlight.position) < 1000;
                }
                return textMatch; // 如果没有位置信息，只比较文本
            });
            
            // 2. 如果精确匹配失败，尝试使用位置匹配
            if (!storedComment && highlight.position !== undefined) {
                storedComment = storedComments.find(c => 
                    !usedCommentIds.has(c.id) && // 确保批注ID未被使用
                    c.position !== undefined && 
                    highlight.position !== undefined &&
                    Math.abs(c.position - highlight.position) < 50
                );
            }
            
            // 3. 如果位置匹配也失败，尝试使用模糊文本匹配
            if (!storedComment && this.plugin.highlightMatchingService) {
                // 将 highlight 转换为 HiNote 格式
                const hiNote: HiNote = {
                    id: highlight.id || IdGenerator.generateHighlightId(
                        this.currentFile?.path || '', 
                        highlight.position || 0, 
                        highlight.text
                    ),
                    text: highlight.text,
                    position: highlight.position || 0, // 确保 position 不为 undefined
                    comments: [],
                    createdAt: highlight.createdAt || Date.now(),
                    updatedAt: highlight.updatedAt || Date.now(),
                    blockId: highlight.blockId,
                    paragraphId: highlight.paragraphId,
                    paragraphOffset: highlight.paragraphOffset || 0,
                    isVirtual: false
                };
                
                // 使用 HighlightMatchingService 查找最匹配的高亮
                if (this.currentFile) {
                    const matchingHighlight = this.plugin.highlightMatchingService.findMatchingHighlight(
                        this.currentFile, 
                        hiNote
                    );
                    
                    // 确保找到的匹配高亮的ID未被使用过
                    if (matchingHighlight && !usedCommentIds.has(matchingHighlight.id)) {
                        storedComment = matchingHighlight;
                    }
                }
            }

            if (storedComment) {
                // 标记这个批注ID已被使用
                usedCommentIds.add(storedComment.id);
                
                return {
                    ...highlight,
                    id: storedComment.id,
                    comments: storedComment.comments,
                    createdAt: storedComment.createdAt,
                    updatedAt: storedComment.updatedAt
                };
            }

            return highlight;
        });

        // 添加虚拟高亮到列表最前面，但只添加那些还没有被使用过的
    const virtualHighlights = storedComments
        .filter(c => c.isVirtual && c.comments && c.comments.length > 0 && !usedCommentIds.has(c.id)); // 只保留有评论且未被使用的虚拟高亮
    
    // 检查是否已经存在相同内容的虚拟高亮
    const uniqueVirtualHighlights = virtualHighlights.filter(vh => {
        // 检查是否已经存在相同文本的高亮
        return !this.highlights.some(h => h.text === vh.text);
    });
    
    // 将这些虚拟高亮添加到列表并标记为已使用
    uniqueVirtualHighlights.forEach(vh => usedCommentIds.add(vh.id));
    this.highlights.unshift(...uniqueVirtualHighlights);

        // 如果是在 Canvas 中选中的文件节点，添加必要的标记
if (isInCanvas && this.currentFile) {
    this.highlights.forEach(highlight => {
        highlight.isFromCanvas = true;
        highlight.isGlobalSearch = true; // 这会让卡片显示文件名
        highlight.fileName = this.currentFile?.name; // 确保设置文件名
    });
}

// 创建一个映射来记录哪些高亮已经创建了闪卡
        // 这避免了直接在 HighlightInfo 上添加属性
        this.highlightsWithFlashcards = new Set<string>();
        
    if (this.plugin && this.plugin.fsrsManager) {
            const fsrsManager = this.plugin.fsrsManager;
            // 遍历所有高亮，记录已创建闪卡的高亮 ID
            for (const highlight of this.highlights) {
                if (highlight.id) {
                    // 检查是否存在闪卡
                    const existingCards = fsrsManager.findCardsBySourceId(highlight.id, 'highlight');
                    // 如果存在闪卡，将高亮 ID 添加到集合中
                    if (existingCards && existingCards.length > 0) {
                        this.highlightsWithFlashcards.add(highlight.id);
                    }
                }
            }
        }
        
        // 检查搜索框是否有内容
        if (this.searchInput && this.searchInput.value.trim() !== '') {
            // 如果有搜索内容，调用搜索过滤方法
            this.updateHighlightsList();
        } else {
            // 如果没有搜索内容，直接渲染所有高亮
            this.renderHighlights(this.highlights);
        }
    }

    // 处理 Canvas 文件的方法
    private async handleCanvasFile(file: TFile): Promise<void> {
        // 显示加载指示器
        this.highlightContainer.empty();
        if (this.loadingIndicator) {
            this.highlightContainer.appendChild(this.loadingIndicator);
            this.loadingIndicator.removeClass('highlight-display-none');
        }
        
        try {
            // 解析 Canvas 文件，获取所有文件路径
            const filePaths = await this.canvasService.parseCanvasFile(file);
            
            if (filePaths.length === 0) {
                // 如果没有文件节点，显示提示
                this.highlightContainer.empty();
                const emptyMessage = this.highlightContainer.createDiv({
                    cls: 'no-highlights-message',
                    text: 'There are no file nodes in the current Canvas.'
                });
                return;
            }
            
            // 使用现有的 path: 搜索前缀功能来显示所有相关文件的高亮
            // 先获取所有高亮
            await this.updateAllHighlights('', 'path');
            
            // 然后只保留在 Canvas 文件中引用的文件的高亮
            this.highlights = this.highlights.filter(highlight => {
                if (!highlight.filePath) return false;
                return filePaths.includes(highlight.filePath);
            });
            
            // 添加来源信息并标记为全局搜索结果，以便显示文件名
            this.highlights.forEach(highlight => {
                highlight.isFromCanvas = true;
                highlight.canvasSource = file.path;
                highlight.isGlobalSearch = true; // 标记为全局搜索结果，这样会显示文件名
            });
            
            // 渲染高亮
            this.renderHighlights(this.highlights);
            
        } catch (error) {
            console.error('处理 Canvas 文件失败:', error);
            this.highlightContainer.empty();
            const errorMessage = this.highlightContainer.createDiv({
                cls: 'error-message',
                text: '处理 Canvas 文件时出错'
            });
        } finally {
            // 隐藏加载指示器
            if (this.loadingIndicator) {
                this.loadingIndicator.addClass('highlight-display-none');
            }
        }
    }

    // 添加页面预览功能
    private addPagePreview(element: HTMLElement, file: TFile) {
        let hoverTimeout: NodeJS.Timeout;

        // 添加悬停事件
        element.addEventListener("mouseenter", (event) => {
            hoverTimeout = setTimeout(async () => {
                const target = event.target as HTMLElement;
                
                // 触发 Obsidian 的页面预览事件
                this.app.workspace.trigger('hover-link', {
                    event,
                    source: 'hi-note',
                    hoverParent: target,
                    targetEl: target,
                    linktext: file.path
                });
            }, 300); // 300ms 的延迟显示
        });

        // 添加鼠标离开事件
        element.addEventListener("mouseleave", () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
        });
    }

    // 添加一个辅助方法来获取或创建拆分视图
    private getPreferredLeaf(): WorkspaceLeaf {
        // 获取所有叶子
        const leaves = this.app.workspace.getLeavesOfType("markdown");
        
        // 如果当前叶子在主视图区域
        if (this.isDraggedToMainView) {
            // 找到一个不是当前叶子的其他叶子
            const otherLeaf = leaves.find(leaf => leaf !== this.leaf);
            if (otherLeaf) {
                // 如果找到其他叶子，使用它
                return otherLeaf;
            }
        }
        
        // 如果没有其他叶子，或者当前不在主视图，创建一个新的拆分视图
        return this.app.workspace.getLeaf('split', 'vertical');
    }
}

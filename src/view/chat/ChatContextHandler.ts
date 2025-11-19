import { App, Notice, setIcon, MarkdownRenderer, Component } from "obsidian";
import { ContextService, ContextOptions } from '../../services/ContextService';
import { ChatStateManager } from './ChatStateManager';
import { ChatMessageHandler } from './ChatMessageHandler';

/**
 * 对话上下文处理器
 * 负责管理上下文预览和设置
 */
export class ChatContextHandler {
    private app: App;
    private plugin: any;
    private contextService: ContextService;
    private stateManager: ChatStateManager;
    private messageHandler: ChatMessageHandler;

    constructor(
        app: App,
        plugin: any,
        contextService: ContextService,
        stateManager: ChatStateManager,
        messageHandler: ChatMessageHandler
    ) {
        this.app = app;
        this.plugin = plugin;
        this.contextService = contextService;
        this.stateManager = stateManager;
        this.messageHandler = messageHandler;
    }

    /**
     * 显示上下文预览和设置
     */
    async showContextPreviewWithSettings(): Promise<void> {
        if (this.stateManager.getDraggedContents().length === 0) {
            new Notice('没有高亮内容可预览');
            return;
        }

        const modal = this.app.workspace.containerEl.createEl('div', {
            cls: 'highlight-chat-context-modal'
        });

        const overlay = modal.createEl('div', {
            cls: 'highlight-chat-context-overlay'
        });

        const content = modal.createEl('div', {
            cls: 'highlight-chat-context-content'
        });

        const header = content.createEl('div', {
            cls: 'highlight-chat-context-header'
        });

        header.createEl('h3', {
            text: 'Context Preview & Settings'
        });

        const closeBtn = header.createEl('div', {
            cls: 'highlight-chat-context-close'
        });
        setIcon(closeBtn, 'x');

        const body = content.createEl('div', {
            cls: 'highlight-chat-context-body'
        });

        let refreshTimeout: NodeJS.Timeout;
        const autoRefresh = () => {
            clearTimeout(refreshTimeout);
            refreshTimeout = setTimeout(() => {
                updatePreview();
            }, 300);
        };

        const settingsPanel = body.createEl('div', {
            cls: 'highlight-chat-context-settings-panel'
        });

        this.createSettingsPanel(settingsPanel, autoRefresh);

        const previewPanel = body.createEl('div', {
            cls: 'highlight-chat-context-preview-panel'
        });

        const previewHeader = previewPanel.createEl('div', {
            cls: 'highlight-chat-context-preview-panel-header'
        });

        previewHeader.createEl('h4', {
            text: 'Preview Content (Auto-update)'
        });

        const previewContent = previewPanel.createEl('div', {
            cls: 'highlight-chat-context-preview-content'
        });

        const footer = content.createEl('div', {
            cls: 'highlight-chat-context-footer'
        });

        const statsDiv = footer.createEl('div', {
            cls: 'highlight-chat-context-stats'
        });

        const buttonsDiv = footer.createEl('div', {
            cls: 'highlight-chat-context-buttons'
        });

        const cancelBtn = buttonsDiv.createEl('button', {
            cls: 'highlight-chat-context-cancel',
            text: 'Cancel'
        });

        const confirmBtn = buttonsDiv.createEl('button', {
            cls: 'highlight-chat-context-confirm',
            text: 'Apply'
        });

        const updatePreview = async () => {
            try {
                previewContent.empty();
                previewContent.createEl('div', {
                    cls: 'highlight-chat-context-loading',
                    text: 'Generating preview...'
                });

                const contexts = await this.generateContextPreview();
                previewContent.empty();
                await this.renderMarkdownContent(previewContent, contexts.content);
                
                statsDiv.textContent = `Characters: ${contexts.content.length} | Highlights: ${this.stateManager.getDraggedContents().length}`;
            } catch (error) {
                previewContent.empty();
                previewContent.createEl('div', {
                    cls: 'highlight-chat-context-error',
                    text: 'Preview generation failed'
                });
            }
        };
        
        const closeModal = () => {
            modal.remove();
        };

        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);
        
        confirmBtn.addEventListener('click', () => {
            closeModal();
            new Notice('Context settings applied');
        });

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);

        await updatePreview();
    }

    /**
     * 创建设置面板
     */
    private createSettingsPanel(container: HTMLElement, autoRefresh: () => void): void {
        const contextOptions = this.messageHandler.getContextOptions();

        // 策略设置
        const strategySection = container.createEl('div', {
            cls: 'highlight-chat-settings-section'
        });

        strategySection.createEl('h5', {
            text: 'Context Strategy'
        });

        const strategySelector = strategySection.createEl('select', {
            cls: 'highlight-chat-settings-select'
        });

        const strategies = [
            { value: 'smart', label: 'Smart Context - Auto-select best strategy' },
            { value: 'paragraph', label: 'Paragraph Context - Get complete paragraphs' },
            { value: 'section', label: 'Section Context - Get entire sections' },
            { value: 'surrounding', label: 'Surrounding Lines - Specify before/after lines' }
        ];

        strategies.forEach(strategy => {
            const option = strategySelector.createEl('option', {
                value: strategy.value,
                text: strategy.label
            });
            if (strategy.value === contextOptions.strategy) {
                option.selected = true;
            }
        });

        strategySelector.addEventListener('change', async () => {
            contextOptions.strategy = strategySelector.value as any;
            this.messageHandler.setContextOptions(contextOptions);
            await this.messageHandler.saveContextOptions();
            this.updateSurroundingLinesVisibility(container);
            autoRefresh();
        });

        // 长度设置
        const lengthSection = container.createEl('div', {
            cls: 'highlight-chat-settings-section'
        });

        lengthSection.createEl('h5', {
            text: 'Context Length'
        });

        const lengthContainer = lengthSection.createEl('div', {
            cls: 'highlight-chat-settings-slider-container'
        });

        const lengthSlider = lengthContainer.createEl('input', {
            type: 'range',
            cls: 'highlight-chat-settings-slider',
            attr: {
                min: '500',
                max: '5000',
                step: '500',
                value: String(contextOptions.maxLength || 2000)
            }
        }) as HTMLInputElement;

        const lengthValue = lengthContainer.createEl('span', {
            cls: 'highlight-chat-settings-value',
            text: `${contextOptions.maxLength || 2000} chars`
        });

        lengthSlider.addEventListener('input', async () => {
            const value = parseInt(lengthSlider.value);
            contextOptions.maxLength = value;
            lengthValue.textContent = `${value} chars`;
            this.messageHandler.setContextOptions(contextOptions);
            await this.messageHandler.saveContextOptions();
            autoRefresh();
        });

        // 邻近行数设置
        const surroundingSection = container.createEl('div', {
            cls: 'highlight-chat-settings-section highlight-chat-surrounding-section'
        });

        surroundingSection.createEl('h5', {
            text: 'Surrounding Lines'
        });

        const surroundingContainer = surroundingSection.createEl('div', {
            cls: 'highlight-chat-settings-slider-container'
        });

        const surroundingSlider = surroundingContainer.createEl('input', {
            type: 'range',
            cls: 'highlight-chat-settings-slider',
            attr: {
                min: '1',
                max: '10',
                step: '1',
                value: String(contextOptions.surroundingLines || 3)
            }
        }) as HTMLInputElement;

        const surroundingValue = surroundingContainer.createEl('span', {
            cls: 'highlight-chat-settings-value',
            text: `${contextOptions.surroundingLines || 3} lines`
        });

        surroundingSlider.addEventListener('input', async () => {
            const value = parseInt(surroundingSlider.value);
            contextOptions.surroundingLines = value;
            surroundingValue.textContent = `${value} lines`;
            this.messageHandler.setContextOptions(contextOptions);
            await this.messageHandler.saveContextOptions();
            autoRefresh();
        });

        // 其他选项
        const optionsSection = container.createEl('div', {
            cls: 'highlight-chat-settings-section'
        });

        optionsSection.createEl('h5', {
            text: 'Other Options'
        });

        const includeTitleCheckbox = optionsSection.createEl('label', {
            cls: 'highlight-chat-settings-checkbox'
        });

        const titleInput = includeTitleCheckbox.createEl('input', {
            type: 'checkbox'
        }) as HTMLInputElement;
        titleInput.checked = contextOptions.includeTitle || false;

        includeTitleCheckbox.createSpan({
            text: ' Include section titles'
        });

        titleInput.addEventListener('change', async () => {
            contextOptions.includeTitle = titleInput.checked;
            this.messageHandler.setContextOptions(contextOptions);
            await this.messageHandler.saveContextOptions();
            autoRefresh();
        });

        this.updateSurroundingLinesVisibility(container);

        // 重置按钮
        const resetBtn = container.createEl('button', {
            cls: 'highlight-chat-settings-reset',
            text: 'Reset to defaults'
        });

        resetBtn.addEventListener('click', async () => {
            const defaultOptions: ContextOptions = {
                strategy: 'smart',
                includeTitle: true,
                maxLength: 2000,
                surroundingLines: 3
            };

            this.messageHandler.setContextOptions(defaultOptions);

            strategySelector.value = 'smart';
            lengthSlider.value = '2000';
            lengthValue.textContent = '2000 chars';
            surroundingSlider.value = '3';
            surroundingValue.textContent = '3 lines';
            titleInput.checked = true;
            
            await this.messageHandler.saveContextOptions();
            this.updateSurroundingLinesVisibility(container);
            new Notice('Reset to default settings');
            autoRefresh();
        });
    }

    /**
     * 更新邻近行数设置的显示状态
     */
    private updateSurroundingLinesVisibility(container: HTMLElement): void {
        const surroundingSection = container.querySelector('.highlight-chat-surrounding-section') as HTMLElement;
        const contextOptions = this.messageHandler.getContextOptions();
        
        if (surroundingSection) {
            if (contextOptions.strategy === 'surrounding') {
                surroundingSection.style.display = 'block';
            } else {
                surroundingSection.style.display = 'none';
            }
        }
    }

    /**
     * 生成上下文预览
     */
    private async generateContextPreview(): Promise<{ content: string }> {
        const contextOptions = this.messageHandler.getContextOptions();
        const draggedContents = this.stateManager.getDraggedContents();
        
        const contextsPromises = draggedContents.map(highlight => 
            this.contextService.getContextForHighlight(highlight, contextOptions)
        );
        
        const contexts = await Promise.all(contextsPromises);
        
        const contextualContents = contexts.map((context, index) => {
            const highlight = draggedContents[index];
            if (!context) {
                return `**Highlight ${index + 1}:**\n${highlight.text}`;
            }
            
            let contextMessage = `**Highlight ${index + 1}** (from: ${context.fileName}):\n`;
            
            if (context.sectionTitle) {
                contextMessage += `**Section:** ${context.sectionTitle}\n\n`;
            }
            
            if (context.beforeContext.trim()) {
                contextMessage += `**Before:**\n${context.beforeContext.trim()}\n\n`;
            }
            
            contextMessage += `**Highlight:**\n${highlight.text}\n\n`;
            
            if (context.afterContext.trim()) {
                contextMessage += `**After:**\n${context.afterContext.trim()}`;
            }
            
            return contextMessage;
        }).join('\n\n---\n\n');

        return { content: contextualContents };
    }

    /**
     * 渲染 Markdown 内容
     */
    private async renderMarkdownContent(containerEl: HTMLElement, content: string): Promise<void> {
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
        
        try {
            await MarkdownRenderer.render(
                this.app,
                content,
                containerEl,
                '',
                new Component()
            );
            
            const lists = containerEl.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.addClass('chat-markdown-list');
            });
        } catch (error) {
            console.error('Error rendering markdown:', error);
            containerEl.textContent = content;
        }
    }
}

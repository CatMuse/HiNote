import { Setting, Notice, Modal } from 'obsidian';
import { t } from '../i18n';
import { DEFAULT_SETTINGS } from '../types';

export class GeneralSettingsTab {
    private plugin: any;
    private containerEl: HTMLElement;

    constructor(plugin: any, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
    }
    
    /**
     * 添加样式
     */
    private addStyles() {
        // 添加模态框按钮样式
        const styleEl = document.createElement('style');
        styleEl.id = 'hinote-settings-styles';
        styleEl.textContent = `
            .modal-button-container {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
            
            .orphaned-data-count {
                color: var(--text-error);
                font-weight: bold;
                margin-top: 8px;
            }
            
            .no-orphaned-data {
                color: var(--text-success);
                font-weight: bold;
                margin-top: 8px;
            }
        `;
        
        // 如果已存在，先移除
        const existingStyle = document.getElementById('hinote-settings-styles');
        if (existingStyle) {
            existingStyle.remove();
        }
        
        document.head.appendChild(styleEl);
    }
    
    /**
     * 更新孤立数据计数
     */
    private async updateOrphanedDataCount(descEl: HTMLElement) {
        try {
            // 移除现有的计数元素
            const existingCount = descEl.querySelector('.orphaned-data-count, .no-orphaned-data');
            if (existingCount) {
                existingCount.remove();
            }
            
            // 获取孤立数据数量
            const stats = await this.plugin.commentStore.checkOrphanedDataCount();
            
            // 创建新的计数元素
            const countEl = document.createElement('div');
            
            if (stats.orphanedHighlights > 0) {
                countEl.className = 'orphaned-data-count';
                countEl.textContent = `Found ${stats.orphanedHighlights} orphaned highlights in ${stats.affectedFiles} files.`;
            } else {
                countEl.className = 'no-orphaned-data';
                countEl.textContent = 'No orphaned data found.';
            }
            
            // 添加到描述元素
            descEl.appendChild(countEl);
        } catch (error) {
            console.error('[HiNote] Error updating orphaned data count:', error);
        }
    }

    display(): void {
        const container = this.containerEl.createEl('div', {
            cls: 'general-settings-container'
        });
        
        // 添加样式
        this.addStyles();


        // 导出路径设置
        new Setting(container)
            .setName(t('Export Path'))
            .setDesc(t('Set the path for exported highlight notes. Leave empty to use vault root. The path should be relative to your vault root.'))
            .addText(text => text
                .setPlaceholder('Example: Highlights/Export')
                .setValue(this.plugin.settings.export.exportPath || '')
                .onChange(async (value) => {
                    // 移除开头的斜杠
                    value = value.replace(/^\/+/, '');
                    // 移除结尾的斜杠
                    value = value.replace(/\/+$/, '');
                    
                    this.plugin.settings.export.exportPath = value;
                    await this.plugin.saveSettings();
                }));
                
        // 导出模板设置
        new Setting(container)
            .setName(t('Export template'))
            .setDesc(t('Customize the format of exported highlights and comments using variables. Available variables: {{sourceFile}}, {{highlightText}}, {{highlightBlockRef}}, {{commentContent}}, {{commentDate}}. Leave empty to use default template.'))
            .addTextArea(text => {
                const defaultTemplate = 
`[[{{sourceFile}}]] - HighlightsNotes

> [!quote] Highlight
> ![[{{highlightBlockRef}}]]
> 
> ---
> 
>> [!note] Comment
>> {{commentContent}}
>> *{{commentDate}}*`;
                
                text
                    .setPlaceholder(defaultTemplate)
                    .setValue(this.plugin.settings.export.exportTemplate || '')
                    .onChange(async (value) => {
                        // 如果用户删除所有内容，则存储空字符串，表示使用默认模板
                        this.plugin.settings.export.exportTemplate = value;
                        await this.plugin.saveSettings();
                    });
                    
                text.inputEl.rows = 10;
                text.inputEl.cols = 40;
            });

            // 排除设置
            new Setting(container)
            .setName(t('Exclusions'))
            .setDesc(t('Comma separated list of paths, tags, note titles or file extensions that will be excluded from highlighting. e.g. folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md'))
            .addTextArea(text => {
                text
                    .setPlaceholder('folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md')
                    .setValue(this.plugin.settings.excludePatterns || '')
                    .onChange(async (value) => {
                        // 将输入的文本分割成数组并处理
                        const patterns = value
                            .split(',')
                            .map(pattern => pattern.trim())
                            .filter(pattern => pattern.length > 0);
                        
                        this.plugin.settings.excludePatterns = value;
                        await this.plugin.saveSettings();
                    });
                    
                text.inputEl.rows = 4;
                text.inputEl.cols = 40;
            });

        // 高亮提取设置组
        new Setting(container)
            .setName(t('Custom text extraction'))
            .setHeading();

        // 启用自定义正则表达式的开关
        new Setting(container)
            .setName(t('Use Custom Pattern'))
            .setDesc(t('Enable to use a custom regular expression for extracting text.'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCustomPattern)
                .onChange(async (value) => {
                    this.plugin.settings.useCustomPattern = value;
                    await this.plugin.saveSettings();
                }));

        // 自定义正则表达式输入框
        new Setting(container)
            .setName(t('Custom Pattern'))
            .setDesc(t('Enter a custom regular expression for extracting text. Use capture groups () to specify the text to extract. The first non-empty capture group will be used as the extracted text.'))
            .addTextArea(text => {
                text
                    .setPlaceholder('==\\s*(.*?)\\s*==|<mark[^>]*>(.*?)<\/mark>|<span[^>]*>(.*?)<\/span>')
                    .setValue(this.plugin.settings.highlightPattern === DEFAULT_SETTINGS.highlightPattern ? '' : this.plugin.settings.highlightPattern)
                    .onChange(async (value) => {
                        this.plugin.settings.highlightPattern = value || DEFAULT_SETTINGS.highlightPattern;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 40;
            });

        // 默认提取颜色选择器
        new Setting(container)
            .setName(t('Default Color'))
            .setDesc(t('Set the default color for decorators when no color is specified. Leave empty to use system default.'))
            .addText(text => text
                .setPlaceholder('#ffeb3b')
                .setValue(this.plugin.settings.defaultHighlightColor === DEFAULT_SETTINGS.defaultHighlightColor ? '' : this.plugin.settings.defaultHighlightColor)
                .onChange(async (value) => {
                    if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                        this.plugin.settings.defaultHighlightColor = value || DEFAULT_SETTINGS.defaultHighlightColor;
                        await this.plugin.saveSettings();
                    }
                }));
                
        // 数据管理设置组
        new Setting(container)
            .setName(t('Data Management'))
            .setHeading();
            
        // 清理孤立数据按钮
        const orphanedDataSetting = new Setting(container)
            .setName(t('Clean orphaned data'))
            .setDesc(t('Remove highlights and comments that no longer exist in your documents. This is useful if you have deleted highlights but their comments are still stored in the data file.'))
            .addButton(button => button
                .setButtonText(t('Clean data'))
                .onClick(async () => {
                    // 检查孤立数据数量
                    button.setButtonText(t('Checking...'));
                    button.setDisabled(true);
                    
                    try {
                        // 调用检查方法
                        const stats = await this.plugin.commentStore.checkOrphanedDataCount();
                        
                        if (stats.orphanedHighlights === 0) {
                            new Notice('No orphaned data found.');
                            return;
                        }
                        
                        // 创建确认对话框
                        const confirmModal = new Modal(this.plugin.app);
                        confirmModal.titleEl.setText(t('Confirm data cleanup'));
                        
                        const contentEl = confirmModal.contentEl;
                        contentEl.empty();
                        
                        contentEl.createEl('p', {
                            text: `Found ${stats.orphanedHighlights} orphaned highlights in ${stats.affectedFiles} files.`
                        });
                        contentEl.createEl('p', {
                            text: 'Do you want to clean up these orphaned highlights and comments?'
                        });
                        
                        const buttonContainer = contentEl.createDiv({
                            cls: 'modal-button-container'
                        });
                        
                        // 添加取消按钮
                        buttonContainer.createEl('button', {
                            text: t('Cancel'),
                            cls: 'mod-warning'
                        }).addEventListener('click', () => {
                            confirmModal.close();
                        });
                        
                        // 添加确认按钮
                        buttonContainer.createEl('button', {
                            text: t('Clean'),
                            cls: 'mod-cta'
                        }).addEventListener('click', async () => {
                            confirmModal.close();
                            
                            button.setButtonText(t('Cleaning...'));
                            button.setDisabled(true);
                            
                            try {
                                // 调用清理方法
                                const result = await this.plugin.commentStore.cleanOrphanedData();
                                
                                // 显示结果通知
                                if (result.removedHighlights > 0) {
                                    new Notice(`Cleaned ${result.removedHighlights} orphaned highlights from ${result.affectedFiles} files.`);
                                } else {
                                    new Notice('No orphaned data found.');
                                }
                                
                                // 更新孤立数据计数
                                this.updateOrphanedDataCount(orphanedDataSetting.descEl);
                            } catch (error) {
                                console.error('[HiNote] Error cleaning orphaned data:', error);
                                new Notice('Error cleaning orphaned data. Check console for details.');
                            } finally {
                                button.setButtonText(t('Clean data'));
                                button.setDisabled(false);
                            }
                        });
                        
                        confirmModal.open();
                    } catch (error) {
                        console.error('[HiNote] Error checking orphaned data:', error);
                        new Notice('Error checking orphaned data. Check console for details.');
                    } finally {
                        button.setButtonText(t('Clean data'));
                        button.setDisabled(false);
                    }
                }));
                
        // 初始化时检查孤立数据数量
        this.updateOrphanedDataCount(orphanedDataSetting.descEl);
    }
}

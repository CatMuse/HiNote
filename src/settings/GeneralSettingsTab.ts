import { Setting, Notice, Modal } from 'obsidian';
import { t } from '../i18n';
import { DEFAULT_SETTINGS } from '../types';
import { RegexRuleEditor } from './RegexRuleEditor';

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
    // 样式已移动到全局 styles.css 文件中
    
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
        
        // 样式已移动到全局 styles.css 文件中


        // 导出路径设置
        new Setting(container)
            .setName(t('Export Path'))
            .setDesc(t('Set the path for exported highlight notes. Leave empty to use vault root. The path should be relative to your vault root.'))
            .addText(text => text
                .setPlaceholder('Highlights/Export')
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
            .setDesc(t('Customize the format of exported highlights and comments using variables. Available variables: {{highlightText}}, {{highlightBlockRef}}, {{commentContent}}, {{commentDate}}. Leave empty to use default template.'))
            .addTextArea(text => {
                const defaultTemplate = 
`> [!quote] HiNote
> ![[{{highlightBlockRef}}]]
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
                    
                text.inputEl.rows = 6;
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
            .setName(t('使用自定义规则'))
            .setDesc(t('启用后将使用自定义正则表达式规则提取高亮文本。'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useCustomPattern)
                .onChange(async (value) => {
                    this.plugin.settings.useCustomPattern = value;
                    await this.plugin.saveSettings();
                }));

        // 添加正则表达式规则编辑器
        const regexEditorContainer = container.createDiv({ cls: 'regex-editor-container' });
        new RegexRuleEditor(regexEditorContainer, this.plugin);
                
        // 数据管理设置组
        new Setting(container)
            .setName(t('数据管理'))
            .setHeading();
            
        // 检查/清理孤立数据按钮
        const orphanedDataSetting = new Setting(container)
            .setName(t('Clean orphaned data'))
            .setDesc(t('Remove highlights and comments that no longer exist in your documents. This is useful if you have deleted highlights but their comments are still stored in the data file.'));

        let orphanedCount = 0;
        let affectedFiles = 0;
        let isChecked = false;
        const checkButton = orphanedDataSetting.addButton(button => {
            button.setButtonText(t('Check'));
            button.onClick(async () => {
                button.setButtonText(t('Checking...'));
                button.setDisabled(true);
                try {
                    // 检查孤立数据数量
                    const stats = await this.plugin.commentStore.checkOrphanedDataCount();
                    orphanedCount = stats.orphanedHighlights;
                    affectedFiles = stats.affectedFiles;
                    isChecked = true;

                    // 更新描述
                    const descEl = orphanedDataSetting.descEl;
                    // 移除现有的计数元素
                    const existingCount = descEl.querySelector('.orphaned-data-count, .no-orphaned-data');
                    if (existingCount) existingCount.remove();
                    const countEl = document.createElement('div');
                    if (orphanedCount > 0) {
                        countEl.className = 'orphaned-data-count';
                        countEl.textContent = `Found ${orphanedCount} orphaned highlights in ${affectedFiles} files.`;
                        button.setButtonText(t('Clean data'));
                        button.setDisabled(false);
                        // 改为清理模式
                        button.onClick(async () => {
                            button.setButtonText(t('Cleaning...'));
                            button.setDisabled(true);
                            try {
                                const result = await this.plugin.commentStore.cleanOrphanedData();
                                if (result.removedHighlights > 0) {
                                    new Notice(`Cleaned ${result.removedHighlights} orphaned highlights from ${result.affectedFiles} files.`);
                                } else {
                                    new Notice('No orphaned data found.');
                                }
                                // 清理后重置按钮和描述
                                button.setButtonText(t('Check'));
                                isChecked = false;
                                // 移除计数元素
                                if (countEl && countEl.parentElement) countEl.parentElement.removeChild(countEl);
                            } catch (error) {
                                console.error('[HiNote] Error cleaning orphaned data:', error);
                                new Notice('Error cleaning orphaned data. Check console for details.');
                                button.setButtonText(t('Check'));
                            } finally {
                                button.setDisabled(false);
                            }
                        });
                    } else {
                        countEl.className = 'no-orphaned-data';
                        countEl.textContent = 'No orphaned data found.';
                        button.setButtonText(t('Check'));
                        button.setDisabled(false);
                    }
                    descEl.appendChild(countEl);
                } catch (error) {
                    console.error('[HiNote] Error checking orphaned data:', error);
                    new Notice('Error checking orphaned data. Check console for details.');
                    button.setButtonText(t('Check'));
                    button.setDisabled(false);
                }
            });
        });

    }
}

import { Setting } from 'obsidian';
import { t } from '../../i18n';
import { RegexRuleEditor } from '../components/RegexRuleEditor';
import type CommentPlugin from '../../../main';

export class GeneralSettingsTab {
    private plugin: CommentPlugin;
    private containerEl: HTMLElement;

    constructor(plugin: CommentPlugin, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
    }
    
    display(): void {
        const container = this.containerEl.createDiv({
            cls: 'general-settings-container'
        });
        
        // 样式已移动到全局 styles.css 文件中

        // 导出路径设置
        new Setting(container)
            .setName(t('Export Path'))
            .setDesc(t('Relative to vault root. Leave empty to use the root folder.'))
            .addText(text => text
                .setPlaceholder('Example: folder 1/folder 2')
                .setValue(this.plugin.settings.export.exportPath || '')
                .onChange(async (value) => {
                    // 移除开头的斜杠
                    value = value.replace(/^\/+/, '');
                    // 移除结尾的斜杠
                    value = value.replace(/\/+$/, '');
                    
                    this.plugin.settings.export.exportPath = value;
                    await this.plugin.saveSettings();
                }));
                
        // 排除设置
        new Setting(container)
            .setClass('hi-note-setting-stacked')
            .setName(t('Exclusions'))
            .setDesc(t('Skip paths, tags, notes or extensions. Separate with commas.'))
            .addTextArea(text => {
                text
                    .setPlaceholder('folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md')
                    .setValue(this.plugin.settings.excludePatterns || '')
                    .onChange(async (value) => {
                        this.plugin.settings.excludePatterns = value;
                        await this.plugin.saveSettings();
                    });
                    
                text.inputEl.rows = 4;
                text.inputEl.setAttribute('aria-label', t('Exclusions'));
            });

        // 导出模板设置
        const templateSetting = new Setting(container)
            .setClass('hi-note-setting-stacked')
            .setName(t('Export template'))
            .setDesc(t('Leave empty to use the default template.'))
            .addTextArea(text => {
                const defaultTemplate = 
`> [!quote] HiNote
> {{highlightText}}
> 
>> [!note]+ {{commentDate}}
>> {{commentContent}}`;
                
                text
                    .setPlaceholder(defaultTemplate)
                    .setValue(this.plugin.settings.export.exportTemplate || '')
                    .onChange(async (value) => {
                        // 如果用户删除所有内容，则存储空字符串，表示使用默认模板
                        this.plugin.settings.export.exportTemplate = value;
                        await this.plugin.saveSettings();
                    });
                    
                text.inputEl.rows = 5;
                text.inputEl.setAttribute('aria-label', t('Export template'));
            });

        const variables = templateSetting.descEl.createEl('details', { cls: 'hi-note-template-variables' });
        variables.createEl('summary', { text: t('Template variables') });
        variables.createEl('code', { text: '{{highlightText}}, {{highlightBlockRef}}, {{commentContent}}, {{commentDate}}' });

        // Widget显示设置
        new Setting(container)
            .setName(t('Show Comment Widget'))
            .setDesc(t('Show comments beside highlights.'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showCommentWidget ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.showCommentWidget = value;
                    await this.plugin.saveSettings();
                    // 刷新高亮装饰器以立即应用更改
                    if (this.plugin.highlightDecorator) {
                        this.plugin.highlightDecorator.refreshDecorations();
                    }
                }));

        // 高亮提取设置组
        new Setting(container)
            .setName(t('Custom text extraction'))
            .setHeading();

        // 启用自定义正则表达式的开关
        new Setting(container)
            .setName(t('Use custom rules'))
            .setDesc(t('Extract highlights with regex rules.'))
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
            .setName(t('Data management'))
            .setHeading();
            
        const associationSetting = new Setting(container)
            .setName(t('Check highlight associations'))
            .setDesc(t('Find stored highlights that could not be located. Comments and flashcards are preserved.'));
        const status = associationSetting.descEl.createDiv({ attr: { role: 'status' } });
        associationSetting.addButton(button => button.setButtonText(t('Check')).onClick(async () => {
            button.setButtonText(t('Checking...')).setDisabled(true);
            try {
                const stats = await this.plugin.highlightManager.checkOrphanedDataCount();
                status.setText(t('Unlocated highlights: {count}; affected files: {files}; skipped files: {skipped}. No data was deleted.')
                    .replace('{count}', String(stats.orphanedHighlights))
                    .replace('{files}', String(stats.affectedFiles))
                    .replace('{skipped}', String(stats.skippedFiles)));
            } catch (error) {
                console.error('[HiNote] Association check failed:', error);
                status.setText(t('Could not check highlight associations. No data was deleted.'));
            } finally {
                button.setButtonText(t('Check')).setDisabled(false);
            }
        }));
    }
}

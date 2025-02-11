import { Setting } from 'obsidian';
import { t } from '../i18n';

export class GeneralSettingsTab {
    private plugin: any;
    private containerEl: HTMLElement;

    constructor(plugin: any, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
    }

    display(): void {
        const container = this.containerEl.createEl('div', {
            cls: 'general-settings-container'
        });


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
        container.createEl('h3', { text: t('Text Extraction Settings') });

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
            .setName(t('Custom Extraction Pattern'))
            .setDesc(t('Enter a custom regular expression for extracting text. Use capture groups () to specify the text to extract. The first non-empty capture group will be used as the extracted text.'))
            .addTextArea(text => {
                text
                    .setPlaceholder('==\\s*(.*?)\\s*==|<mark[^>]*>(.*?)<\/mark>|<span[^>]*>(.*?)<\/span>')
                    .setValue(this.plugin.settings.highlightPattern)
                    .onChange(async (value) => {
                        this.plugin.settings.highlightPattern = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 4;
                text.inputEl.cols = 40;
            });

        // 默认提取颜色选择器
        new Setting(container)
            .setName(t('Default Decorator Color'))
            .setDesc(t('Set the default color for decorators when no color is specified. Leave empty to use system default.'))
            .addText(text => text
                .setPlaceholder('#ffeb3b')
                .setValue(this.plugin.settings.defaultHighlightColor)
                .onChange(async (value) => {
                    // 允许空值或有效的颜色格式
                    if (value === '' || /^#[0-9A-Fa-f]{6}$/.test(value)) {
                        this.plugin.settings.defaultHighlightColor = value;
                        await this.plugin.saveSettings();
                    }
                }));
    }
}

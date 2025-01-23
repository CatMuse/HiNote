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
    }
}

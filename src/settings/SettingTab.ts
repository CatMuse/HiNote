import { App, PluginSettingTab } from 'obsidian';
import { PluginSettings } from '../types';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { AIServiceTab } from './AIServiceTab';
import { t } from '../i18n';

export class AISettingTab extends PluginSettingTab {
    plugin: any;
    DEFAULT_SETTINGS: PluginSettings;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
        this.DEFAULT_SETTINGS = plugin.DEFAULT_SETTINGS;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // 添加主标题
        containerEl.createEl('h1', { text: 'HiNote Settings' });

        // 创建标签页容器
        const tabContainer = containerEl.createEl('div', { cls: 'setting-tabs' });
        const contentContainer = containerEl.createEl('div', { cls: 'setting-tab-content' });

        // 创建标签按钮
        const generalTab = tabContainer.createEl('div', { 
          text: t('General'),
          cls: 'setting-tab-btn active',
          attr: { role: 'button', tabindex: '0' }
        });
        const aiTab = tabContainer.createEl('div', { 
          text: t('AI Service'),
          cls: 'setting-tab-btn',
          attr: { role: 'button', tabindex: '0' }
        });

        // 创建内容容器
        const generalContent = contentContainer.createEl('div', { cls: 'setting-tab-pane active' });
        const aiContent = contentContainer.createEl('div', { cls: 'setting-tab-pane' });

        // 添加标签切换事件
        const switchTab = (targetTab: HTMLElement, targetContent: HTMLElement) => {
            // 移除所有活动状态
            tabContainer.findAll('.setting-tab-btn').forEach(tab => tab.removeClass('active'));
            contentContainer.findAll('.setting-tab-pane').forEach(pane => pane.removeClass('active'));
            
            // 设置目标为活动状态
            targetTab.addClass('active');
            targetContent.addClass('active');
        };

        generalTab.onclick = () => switchTab(generalTab, generalContent);
        aiTab.onclick = () => switchTab(aiTab, aiContent);

        // 添加通用设置到 General 标签页
        new GeneralSettingsTab(this.plugin, generalContent).display();

        // 添加 AI 服务设置到 AI Service 标签页
        new AIServiceTab(this.plugin, aiContent).display();
    }
}

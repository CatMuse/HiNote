import { App, PluginSettingTab } from 'obsidian';
import { PluginSettings } from '../types';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { AIServiceTab } from './AIServiceTab';
import { FlashcardSettingsTab } from './FlashcardSettingsTab';
import { t } from '../i18n';
import { LicenseManager } from '../services/LicenseManager';

export class AISettingTab extends PluginSettingTab {
    plugin: any;
    DEFAULT_SETTINGS: PluginSettings;
    private licenseManager: LicenseManager;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
        this.DEFAULT_SETTINGS = plugin.DEFAULT_SETTINGS;
        this.licenseManager = new LicenseManager(this.plugin);
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        // 检查许可证状态
        const isFlashcardActivated = await this.licenseManager.isActivated();

        // 移除了顶级标题，符合Obsidian官方建议

        // 创建标签页容器
        const tabContainer = containerEl.createEl('div', { cls: 'setting-tabs' });
        const contentContainer = containerEl.createEl('div', { cls: 'setting-tab-content' });

        // 创建标签按钮
        const generalTab = tabContainer.createEl('div', { 
          text: 'General',
          cls: 'setting-tab-btn active',
          attr: { role: 'button', tabindex: '0' }
        });
        const aiTab = tabContainer.createEl('div', { 
          text: 'AI service',
          cls: 'setting-tab-btn',
          attr: { role: 'button', tabindex: '0' }
        });
        
        // 只有在许可证激活的情况下才创建闪卡标签页
        let flashcardTab: HTMLElement | null = null;
        if (isFlashcardActivated) {
            flashcardTab = tabContainer.createEl('div', { 
                text: 'HiCard',
                cls: 'setting-tab-btn',
                attr: { role: 'button', tabindex: '0' }
            });
        }

        // 创建内容容器
        const generalContent = contentContainer.createEl('div', { cls: 'setting-tab-pane active' });
        const aiContent = contentContainer.createEl('div', { cls: 'setting-tab-pane' });
        let flashcardContent: HTMLElement | null = null;
        if (isFlashcardActivated) {
            flashcardContent = contentContainer.createEl('div', { cls: 'setting-tab-pane' });
        }

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
        if (flashcardTab && flashcardContent) {
            flashcardTab.onclick = () => switchTab(flashcardTab!, flashcardContent!);
        }

        // 添加通用设置到 General 标签页
        new GeneralSettingsTab(this.plugin, generalContent).display();

        // 添加 AI 服务设置到 AI Service 标签页
        new AIServiceTab(this.plugin, aiContent).display();
        
        // 只有在许可证激活的情况下才添加 Flashcard 设置
        if (flashcardContent) {
            new FlashcardSettingsTab(this.plugin, flashcardContent).display();
        }
    }
}

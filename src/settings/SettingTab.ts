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
          text: t('AI service'),
          cls: 'setting-tab-btn',
          attr: { role: 'button', tabindex: '0' }
        });
        // 预留 Flashcard 标签按钮位置
        let flashcardTab: HTMLElement | null = null;
        // 内容容器
        const generalContent = contentContainer.createEl('div', { cls: 'setting-tab-pane active' });
        const aiContent = contentContainer.createEl('div', { cls: 'setting-tab-pane' });
        let flashcardContent: HTMLElement | null = null;

        // 添加标签切换事件
        const switchTab = (targetTab: HTMLElement, targetContent: HTMLElement) => {
            tabContainer.findAll('.setting-tab-btn').forEach(tab => tab.removeClass('active'));
            contentContainer.findAll('.setting-tab-pane').forEach(pane => pane.removeClass('active'));
            targetTab.addClass('active');
            targetContent.addClass('active');
        };

        generalTab.onclick = () => switchTab(generalTab, generalContent);
        aiTab.onclick = () => switchTab(aiTab, aiContent);

        // 添加通用设置到 General 标签页
        new GeneralSettingsTab(this.plugin, generalContent).display();
        // 添加 AI 服务设置到 AI Service 标签页
        new AIServiceTab(this.plugin, aiContent).display();

        // HiCard 标签页始终显示
        flashcardTab = tabContainer.createEl('div', {
            text: 'HiCard',
            cls: 'setting-tab-btn',
            attr: { role: 'button', tabindex: '0' }
        });
        flashcardContent = contentContainer.createEl('div', { cls: 'setting-tab-pane' });
        flashcardTab.onclick = async () => {
            switchTab(flashcardTab!, flashcardContent!);
            flashcardContent!.empty();
            // 检查激活状态
            const isFlashcardActivated = await this.licenseManager.isActivated();
            if (isFlashcardActivated) {
                new FlashcardSettingsTab(this.plugin, flashcardContent!).display();
            } else {
                // 显示激活输入框（结构更贴近主视图，含描述文案和 class）
                const activationDiv = flashcardContent!.createEl('div', { cls: 'flashcard-activation-container' });
                activationDiv.createEl('div', { cls: 'flashcard-activation-header', text: t('Activate HiCard') });
                activationDiv.createEl('div', { cls: 'flashcard-activation-description', text: t('Enter your license key to activate HiCard feature.') });
                const inputContainer = activationDiv.createEl('div', { cls: 'flashcard-activation-input-container' });
                const input = inputContainer.createEl('input', { cls: 'flashcard-activation-input', type: 'text', placeholder: t('Enter license key') });
                const btn = inputContainer.createEl('button', { cls: 'flashcard-activation-button', text: t('Activate') });
                const msg = activationDiv.createEl('div', { cls: 'activation-msg' });
                btn.onclick = async () => {
                    btn.setAttr('disabled', 'true');
                    msg.textContent = t('Verifying...');
                    const ok = await this.licenseManager.activateLicense(input.value);
                    if (ok) {
                        msg.textContent = t('Activation successful!');
                        flashcardContent!.empty();
                        new FlashcardSettingsTab(this.plugin, flashcardContent!).display();
                    } else {
                        msg.textContent = t('Activation failed. Please check your license key.');
                        btn.removeAttribute('disabled');
                    }
                };
            }
        };
        // 默认加载 HiCard 内容（可选，首次加载时自动判断）
        // flashcardTab.onclick();
    }
}

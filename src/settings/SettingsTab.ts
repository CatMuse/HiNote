import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { GeneralSettingsTab } from './tabs/GeneralSettingsTab';
import { AIServiceTab } from './tabs/AIServiceTab';
import { FlashcardSettingsTab } from '../flashcard';
import { t } from '../i18n';
import { LicenseManager } from '../services/LicenseManager';
import type CommentPlugin from '../../main';
import { ObsidianInternals } from '../utils/ObsidianInternals';

export class AISettingTab extends PluginSettingTab {
    plugin: CommentPlugin;
    private licenseManager: LicenseManager;

    constructor(app: App, plugin: CommentPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.licenseManager = new LicenseManager(this.plugin);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            this.createSettingsPage(t('General'), [
                'Export Path', 'Exclusions', 'Export template', 'Show Comment Widget',
                'Custom text extraction', 'Use custom rules', 'Data management', 'Clean orphaned data'
            ], container => new GeneralSettingsTab(this.plugin, container).display()),
            this.createSettingsPage(t('AI service'), [
                'AI service', 'API key', 'Server URL', 'Model', 'Prompt settings',
                'OpenAI', 'Anthropic', 'Gemini', 'Deepseek', 'SiliconFlow', 'Ollama', 'Custom'
            ], container => new AIServiceTab(this.plugin, container).display()),
            this.createSettingsPage('HiCard', [
                'Activate HiCard', 'Flashcard learning', 'New cards per day', 'Reviews per day',
                'Target retention', 'Maximum interval', 'Reset daily stats', 'FSRS parameters',
                'Reset algorithm parameters'
            ], (container, isDisposed) => this.renderFlashcardTab(container, isDisposed))
        ];
    }

    private createSettingsPage(
        name: string,
        terms: string[],
        render: (container: HTMLElement, isDisposed: () => boolean) => void | Promise<void>
    ): SettingDefinitionItem {
        return {
            type: 'page',
            name,
            items: [{
                name,
                aliases: [...new Set([...terms, ...terms.map(term => t(term))])],
                render: setting => {
                    const container = setting.settingEl;
                    container.empty();
                    container.addClass('hi-note-searchable-settings');
                    let disposed = false;
                    void this.plugin.ensureServicesInitialized().then(async () => {
                        if (!disposed) await render(container, () => disposed);
                    }).catch(error => {
                        if (!disposed) container.createEl('p', { text: String(error) });
                    });
                    return () => { disposed = true; container.empty(); };
                }
            }]
        };
    }

    private async renderFlashcardTab(
        flashcardContent: HTMLElement,
        isDisposed: () => boolean
    ): Promise<void> {
            flashcardContent.empty();
            // 检查激活状态
            const isFlashcardActivated = await this.licenseManager.isActivated();
            if (isDisposed()) return;
            if (isFlashcardActivated) {
                new FlashcardSettingsTab(this.plugin, flashcardContent).display();
            } else {
                // 显示激活输入框（结构更贴近主视图，含描述文案和 class）
                const activationDiv = flashcardContent.createEl('div', { cls: 'flashcard-activation-container' });
                activationDiv.createEl('div', { cls: 'flashcard-activation-header', text: t('Activate HiCard') });
                
                // 创建包含链接的描述文案
                const descriptionDiv = activationDiv.createEl('div', { cls: 'flashcard-activation-description' });
                descriptionDiv.createEl('span', { text: t('Enter your license key to activate HiCard feature.') + ' ' });
                descriptionDiv.createEl('br');
                descriptionDiv.createEl('span', { text: t('Get your license key from') + ' ' });
                
                // 根据语言设置不同的链接
                const locale = ObsidianInternals.getMomentLocale();
                const websiteUrl = locale.startsWith('zh') ? 'https://www.hinote.vip/index.html' : 'https://www.hinote.vip/en.html';
                
                const link = descriptionDiv.createEl('a', { 
                    text: t('HiNote official website'),
                    cls: 'external-link',
                    href: websiteUrl
                });
                link.setAttr('target', '_blank');
                link.setAttr('rel', 'noopener noreferrer');
                const inputContainer = activationDiv.createEl('div', { cls: 'flashcard-activation-input-container' });
                const input = inputContainer.createEl('input', { cls: 'flashcard-activation-input', type: 'text', placeholder: t('Enter license key') });
                const btn = inputContainer.createEl('button', { cls: 'flashcard-activation-button', text: t('Activate') });
                const msg = activationDiv.createEl('div', { cls: 'activation-msg' });
                btn.onclick = () => {
                    void this.activateFlashcardLicense(input, btn, msg, flashcardContent);
                };
            }
    }

    private async activateFlashcardLicense(input: HTMLInputElement, btn: HTMLButtonElement, msg: HTMLElement, flashcardContent: HTMLElement): Promise<void> {
        btn.setAttr('disabled', 'true');
        msg.textContent = t('Verifying...');
        const ok = await this.licenseManager.activateLicense(input.value);
        if (ok) {
            msg.textContent = t('Activation successful!');
            flashcardContent.empty();
            new FlashcardSettingsTab(this.plugin, flashcardContent).display();
        } else {
            msg.textContent = t('Activation failed. Please check your license key.');
            btn.removeAttribute('disabled');
        }
    }
}

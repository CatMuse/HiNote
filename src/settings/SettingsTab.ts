import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import { GeneralSettingsTab } from './tabs/GeneralSettingsTab';
import { AIServiceTab } from './tabs/AIServiceTab';
import { SmartHighlightSettingsTab } from './tabs/SmartHighlightSettingsTab';
import { FlashcardSettingsTab } from '../flashcard';
import { t } from '../i18n';
import { LicenseManager } from '../services/LicenseManager';
import type CommentPlugin from '../../main';
import { ObsidianInternals } from '../utils/ObsidianInternals';

let settingsSectionId = 0;

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
            this.createSettingsSection(t('General'), [
                'Export Path', 'Exclusions', 'Export template', 'Show Comment Widget',
                'Custom text extraction', 'Use custom rules', 'Data management', 'Check highlight associations'
            ], container => new GeneralSettingsTab(this.plugin, container).display()),
            this.createSettingsSection(t('AI service'), [
                'AI service', 'API key', 'Server URL', 'Model', 'Prompt settings',
                'OpenAI', 'Anthropic', 'Gemini', 'Deepseek', 'SiliconFlow', 'Ollama', 'Custom'
            ], container => new AIServiceTab(this.plugin, container).display()),
            this.createSettingsSection(t('Smart highlight'), [
                'Smart highlight', 'TypeSafe', 'Jev', 'Reading goal', 'Suggestion density', 'Highlight color'
            ], container => new SmartHighlightSettingsTab(this.plugin, container).display()),
            this.createSettingsSection('HiCard', [
                'Activate HiCard', 'Flashcard learning', 'New cards per day', 'Reviews per day',
                'Target retention', 'Maximum interval', 'Reset daily stats', 'FSRS parameters',
                'Reset algorithm parameters'
            ], (container, isDisposed) => this.renderFlashcardTab(container, isDisposed))
        ];
    }

    private createSettingsSection(
        name: string,
        terms: string[],
        render: (container: HTMLElement, isDisposed: () => boolean) => void | Promise<void>
    ): SettingDefinitionItem {
        return {
            name,
            aliases: [...new Set([...terms, ...terms.map(term => t(term))])],
            render: (setting) => {
                const container = setting.settingEl;
                container.empty();
                container.addClass('hi-note-searchable-settings');
                // Obsidian also uses aria-label as tooltip text; label the region via its heading.
                container.removeAttribute('aria-label');
                const headingId = `hi-note-settings-section-${++settingsSectionId}`;
                const card = container.createDiv({ cls: 'hi-note-settings-card', attr: { role: 'region', 'aria-labelledby': headingId } });
                const heading = new Setting(card)
                    .setName(name)
                    .setHeading()
                    .setClass('hi-note-settings-section-title');
                heading.nameEl.id = headingId;
                const content = card.createDiv({ cls: 'hi-note-settings-section-content' });
                let disposed = false;
                void this.plugin.ensureServicesInitialized().then(async () => {
                    if (!disposed) await render(content, () => disposed);
                }).catch(error => {
                    if (!disposed) content.createEl('p', { text: String(error) });
                });
                return () => { disposed = true; container.empty(); };
            }
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
                const activationDiv = flashcardContent.createDiv({ cls: 'flashcard-activation-container' });
                activationDiv.createDiv({ cls: 'flashcard-activation-header', text: t('Activate HiCard') });
                
                // 创建包含链接的描述文案
                const descriptionDiv = activationDiv.createDiv({ cls: 'flashcard-activation-description' });
                descriptionDiv.createSpan({ text: t('Enter your license key to activate HiCard feature.') + ' ' });
                descriptionDiv.createEl('br');
                descriptionDiv.createSpan({ text: t('Get your license key from') + ' ' });
                
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
                const inputContainer = activationDiv.createDiv({ cls: 'flashcard-activation-input-container' });
                const input = inputContainer.createEl('input', { cls: 'flashcard-activation-input', type: 'text', placeholder: t('Enter license key') });
                const btn = inputContainer.createEl('button', { cls: 'flashcard-activation-button', text: t('Activate') });
                const msg = activationDiv.createDiv({ cls: 'activation-msg' });
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

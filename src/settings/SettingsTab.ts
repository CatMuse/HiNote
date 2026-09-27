import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import { GeneralSettingsTab } from './tabs/GeneralSettingsTab';
import { AIServiceTab } from './tabs/AIServiceTab';
import { SmartHighlightSettingsTab } from './tabs/SmartHighlightSettingsTab';
import { t } from '../i18n';
import type CommentPlugin from '../../main';

let settingsSectionId = 0;

export class AISettingTab extends PluginSettingTab {
    plugin: CommentPlugin;

    constructor(app: App, plugin: CommentPlugin) {
        super(app, plugin);
        this.plugin = plugin;
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
            ], container => new SmartHighlightSettingsTab(this.plugin, container).display())
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

}

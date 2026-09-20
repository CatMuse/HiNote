import { Notice, SecretComponent, Setting } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { readApiKey } from '../../services/ai/AISecrets';
import { TypeSafeHighlightEngine } from '../../services/smart-highlight';
import { HIGHLIGHT_COLOR_CHOICES } from '../../services/highlight/HighlightColorEdit';
import type { SmartHighlightDensity, SmartHighlightPurpose } from '../../types/settings';
import type { HighlightColor } from '../../services/highlight/HighlightColor';

export class SmartHighlightSettingsTab {
    constructor(private plugin: CommentPlugin, private containerEl: HTMLElement) {}

    display(): void {
        const get = () => this.plugin.settings.smartHighlight;
        new Setting(this.containerEl).setName(t('TypeSafe smart highlights')).setHeading();
        this.containerEl.createEl('p', {
            text: t('Smart highlight sends candidate passages, section headings, and nearby lines from the current note to TypeSafe only after you select Analyze. It never scans the vault in the background.')
        });
        new Setting(this.containerEl).setName(t('API Key'))
            .setDesc(t('Select or create a Keychain secret on this device. Only its name is saved in HiNote.'))
            .addComponent(el => new SecretComponent(this.plugin.app, el)
                .setValue(get().apiKeySecretId).onChange(async id => {
                    get().apiKeySecretId = id; await this.plugin.saveSettings();
                }));
        new Setting(this.containerEl).setName(t('Model'))
            .setDesc(t('Pin a versioned Jev model so recommendation thresholds do not change unexpectedly.'))
            .addText(text => text.setValue(get().model).setPlaceholder('jev-1.13.0').onChange(async value => {
                get().model = value.trim(); await this.plugin.saveSettings();
            }));
        new Setting(this.containerEl).setName(t('Default reading goal')).addDropdown(dropdown => dropdown.addOptions({
            general: t('General reading'), study: t('Study and review'),
            research: t('Research and analysis'), action: t('Actions and decisions')
        }).setValue(get().purpose).onChange(async value => {
            get().purpose = value as SmartHighlightPurpose; await this.plugin.saveSettings();
        }));
        new Setting(this.containerEl).setName(t('Default suggestion density')).addDropdown(dropdown => dropdown.addOptions({
            concise: t('Concise'), balanced: t('Balanced'), rich: t('Rich')
        }).setValue(get().density).onChange(async value => {
            get().density = value as SmartHighlightDensity; await this.plugin.saveSettings();
        }));
        new Setting(this.containerEl).setName(t('Default highlight color')).addDropdown(dropdown => dropdown
            .addOptions(Object.fromEntries(HIGHLIGHT_COLOR_CHOICES.map(choice => [choice.color || 'default', t(choice.label)])))
            .setValue(get().color || 'default').onChange(async value => {
                get().color = value === 'default' ? null : value as HighlightColor;
                await this.plugin.saveSettings();
            }));
        const test = new Setting(this.containerEl).setName(t('Test TypeSafe connection'))
            .setDesc(t('Sends a short test without note content.'));
        test.addButton(button => button.setButtonText(t('Test Connection')).onClick(async () => {
            button.setDisabled(true);
            try {
                readApiKey(this.plugin.app.secretStorage, get().apiKeySecretId);
                const model = await new TypeSafeHighlightEngine(
                    this.plugin.app.secretStorage, get().apiKeySecretId, get().model || 'jev-1.13.0'
                ).testConnection();
                new Notice(`${t('Connection successful!')} ${model}`);
            } catch (error) {
                new Notice(t('Connection failed: {error}', {
                    error: error instanceof Error ? error.message : String(error)
                }));
            } finally { button.setDisabled(false); }
        }));
    }
}

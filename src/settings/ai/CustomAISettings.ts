import { Notice, SecretComponent, Setting } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { CustomAIService, type APIType } from '../../services/ai/CustomAIService';
import { readApiKey } from '../../services/ai/AISecrets';
import { renderAIConnectionControls } from './AIConnectionControls';

export class CustomAISettings {
    constructor(private plugin: CommentPlugin, _container: HTMLElement) {}
    display(container: HTMLElement): void {
        if (!this.plugin.settings.ai.custom) {
            this.plugin.settings.ai.custom = { name: '', apiKeySecretId: '', baseUrl: '', model: '', apiType: 'openai' };
        }
        const get = () => this.plugin.settings.ai.custom!;
        const protocol = () => get().apiType || get().detectedApiType || 'openai';
        const save = () => this.plugin.saveSettings();
        const host = container.createDiv({ cls: 'ai-service-settings' });
        new Setting(host).setName(t('Custom AI Service')).setHeading();
        new Setting(host).setName(t('Service Name')).addText(text => text.setValue(get().name)
            .onChange(async value => { get().name = value; await save(); }));
        new Setting(host).setName(t('API protocol'))
            .setDesc(t('Select the protocol your endpoint supports. HiNote does not probe other protocols.'))
            .addDropdown(dropdown => dropdown.addOptions({ openai: 'OpenAI Chat Completions', anthropic: 'Anthropic Messages', gemini: 'Gemini GenerateContent' })
                .setValue(protocol()).onChange(async value => {
                    get().apiType = value as APIType;
                    delete get().detectedApiType;
                    await save();
                }));
        new Setting(host).setName(t('API Endpoint URL')).setDesc(t('Enter the API base URL, including its version path if required.'))
            .addText(text => text.setPlaceholder('https://api.example.com/v1').setValue(get().baseUrl)
                .onChange(async value => { get().baseUrl = value.trim(); await save(); }));
        new Setting(host).setName(t('API Key'))
            .setDesc(t('Select or create a Keychain secret on this device. Only its name is saved in HiNote.'))
            .addComponent(el => new SecretComponent(this.plugin.app, el).setValue(get().apiKeySecretId || '')
                .onChange(async value => { get().apiKeySecretId = value; await save(); }));
        renderAIConnectionControls(host, {
            app: this.plugin.app,
            getModel: () => get().model,
            setModel: async id => { get().model = id; await save(); },
            fingerprint: () => JSON.stringify([protocol(), get().baseUrl, get().apiKeySecretId, get().headers]),
            create: () => new CustomAIService(readApiKey(this.plugin.app.secretStorage, get().apiKeySecretId), get().baseUrl, get().model, get().headers, protocol())
        });
        const advanced = host.createEl('details');
        advanced.createEl('summary', { text: t('Advanced Options') });
        new Setting(advanced).setName(t('Optional custom headers (JSON format)'))
            .addTextArea(text => text.setValue(get().headers ? JSON.stringify(get().headers, null, 2) : '')
                .onChange(async value => {
                    if (!value.trim()) { get().headers = undefined; await save(); return; }
                    try {
                        const headers: unknown = JSON.parse(value);
                        if (!headers || typeof headers !== 'object' || Array.isArray(headers)
                            || Object.values(headers).some(entry => typeof entry !== 'string')) throw new Error();
                        get().headers = headers as Record<string, string>;
                        await save();
                    } catch { new Notice(t('Invalid JSON format. Headers must be an object.')); }
                }));
    }
}

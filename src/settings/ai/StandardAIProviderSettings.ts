import { SecretComponent, Setting } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { readApiKey } from '../../services/ai/AISecrets';
import type { StandardAIProviderConfig } from './providerConfigs';
import { renderAIConnectionControls } from './AIConnectionControls';

export class StandardAIProviderSettings {
    constructor(private plugin: CommentPlugin, _container: HTMLElement, private config: StandardAIProviderConfig) {}

    display(container: HTMLElement): void {
        const host = container.createDiv({ cls: 'ai-service-settings' });
        const get = () => {
            const ai = this.plugin.settings.ai;
            const provider = ai[this.config.provider];
            if (!provider) throw new Error(`Missing AI provider settings: ${this.config.provider}`);
            return provider;
        };
        new Setting(host).setName(t(this.config.heading)).setHeading();
        new Setting(host).setName(t('API Key'))
            .setDesc(t('Select or create a Keychain secret on this device. Only its name is saved in HiNote.'))
            .addComponent(el => new SecretComponent(this.plugin.app, el)
                .setValue(get().apiKeySecretId || '')
                .onChange(async id => { get().apiKeySecretId = id; await this.plugin.saveSettings(); }));
        const urlKey = this.config.providerUrlKey || 'baseUrl';
        const getBase = () => {
            const config = get() as unknown as Record<string, unknown>;
            const value = config[urlKey];
            return typeof value === 'string' && value.trim() ? value.trim() : this.config.defaultBaseUrl;
        };
        const advanced = host.createEl('details');
        advanced.createEl('summary', { text: t('Advanced Options') });
        new Setting(advanced).setName(t('Provider URL')).setDesc(t('Leave it blank, unless you are using a proxy.'))
            .addText(text => text.setPlaceholder(this.config.defaultBaseUrl)
                .setValue(getBase() === this.config.defaultBaseUrl ? '' : getBase())
                .onChange(async value => {
                    (get() as unknown as Record<string, unknown>)[urlKey] = value.trim();
                    await this.plugin.saveSettings();
                }));
        renderAIConnectionControls(host, {
            app: this.plugin.app,
            getModel: () => get().model || '',
            setModel: async id => { get().model = id; await this.plugin.saveSettings(); },
            fingerprint: () => JSON.stringify([get().apiKeySecretId, getBase()]),
            create: () => this.config.createService({
                apiKey: readApiKey(this.plugin.app.secretStorage, get().apiKeySecretId),
                model: get().model || '', baseUrl: getBase()
            })
        });
        host.appendChild(advanced);
    }
}

import { Setting } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { AITestHelper } from '../../services/ai';
import { BaseAIServiceSettings, StandardModelState } from './AIServiceSettings';
import type { StandardAIProviderConfig } from './providerConfigs';

export class StandardAIProviderSettings extends BaseAIServiceSettings {
    private modelState: StandardModelState;
    private refs = {
        modelSelectEl: null as HTMLSelectElement | null,
        customModelContainer: null as HTMLDivElement | null
    };

    constructor(
        plugin: CommentPlugin,
        containerEl: HTMLElement,
        private config: StandardAIProviderConfig
    ) {
        super(plugin, containerEl);
        this.modelState = this.initializeStandardModelState(config);
    }

    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createDiv({
            cls: 'ai-service-settings'
        });

        new Setting(settingsContainer)
            .setName(t(this.config.heading))
            .setHeading();

        this.renderApiKeySetting(settingsContainer, this.config, this.modelState, async () => {
            const service = this.config.createService({
                apiKey: this.modelState.apiKey,
                model: this.modelState.selectedModel.id,
                baseUrl: this.getBaseUrl(),
                plugin: this.plugin
            });

            return await AITestHelper.testConnection(service, this.config.serviceName);
        });

        this.renderModelSelector(settingsContainer, this.config, this.modelState, this.refs);
        this.renderProviderUrlSetting(settingsContainer, this.config);
    }

    private getBaseUrl(): string {
        const urlKey = this.config.providerUrlKey || 'apiAddress';
        const customUrl = this.getProviderSettingString(this.config, urlKey);
        return customUrl.trim() ? customUrl : this.config.defaultBaseUrl;
    }
}

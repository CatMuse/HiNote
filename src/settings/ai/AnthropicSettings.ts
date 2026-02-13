import { Setting } from 'obsidian';
import { BaseAIServiceSettings, AIModel, AIProviderConfig, StandardModelState } from './AIServiceSettings';
import { AITestHelper } from '../../services/ai';
import { t } from '../../i18n';

const DEFAULT_ANTHROPIC_MODELS: AIModel[] = [
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5' },
    { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3' }
];

const ANTHROPIC_CONFIG: AIProviderConfig = {
    settingsKey: 'anthropic',
    serviceName: 'Anthropic',
    defaultModels: DEFAULT_ANTHROPIC_MODELS,
    apiKeyPlaceholder: 'sk-ant-...',
    providerUrlPlaceholder: 'https://api.anthropic.com',
    providerUrlKey: 'apiAddress',
    defaultSettings: {
        apiKey: '',
        model: DEFAULT_ANTHROPIC_MODELS[0].id,
        apiAddress: '',
        isCustomModel: false,
        lastCustomModel: ''
    }
};

export class AnthropicSettings extends BaseAIServiceSettings {
    private modelState: StandardModelState;
    private refs = { modelSelectEl: null as HTMLSelectElement | null, customModelContainer: null as HTMLDivElement | null };

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeStandardModelState(ANTHROPIC_CONFIG);
    }

    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        new Setting(settingsContainer)
            .setName(t('Anthropic service'))
            .setHeading();

        // API Key + Check 按钮
        this.renderApiKeySetting(settingsContainer, ANTHROPIC_CONFIG, this.modelState, async () => {
            const apiAddress = this.getProviderSettings(ANTHROPIC_CONFIG).apiAddress || 'https://api.anthropic.com';
            const model = this.modelState.selectedModel.id;
            const { AnthropicService } = await import('../../services/ai/AnthropicService');
            const anthropicService = new AnthropicService(
                this.modelState.apiKey, apiAddress, model
            );
            return await AITestHelper.testConnection(anthropicService, 'Anthropic');
        });

        // 模型选择 + 自定义模型输入
        this.renderModelSelector(settingsContainer, ANTHROPIC_CONFIG, this.modelState, this.refs);

        // Provider URL
        this.renderProviderUrlSetting(settingsContainer, ANTHROPIC_CONFIG);
    }
}

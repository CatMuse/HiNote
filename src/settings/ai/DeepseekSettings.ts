import { Setting } from 'obsidian';
import { BaseAIServiceSettings, AIProviderConfig, StandardModelState } from './AIServiceSettings';
import { AITestHelper } from '../../services/ai';
import { t } from '../../i18n';
import { DEFAULT_DEEPSEEK_MODELS } from '../../types';

const DEEPSEEK_CONFIG: AIProviderConfig = {
    settingsKey: 'deepseek',
    serviceName: 'Deepseek',
    defaultModels: DEFAULT_DEEPSEEK_MODELS,
    apiKeyPlaceholder: 'dsk-...',
    providerUrlPlaceholder: 'https://api.deepseek.com/v1',
    providerUrlKey: 'apiAddress',
    defaultSettings: {
        apiKey: '',
        model: DEFAULT_DEEPSEEK_MODELS[0].id,
        apiAddress: '',
        isCustomModel: false,
        lastCustomModel: ''
    }
};

export class DeepseekSettings extends BaseAIServiceSettings {
    private modelState: StandardModelState;
    private refs = { modelSelectEl: null as HTMLSelectElement | null, customModelContainer: null as HTMLDivElement | null };

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeStandardModelState(DEEPSEEK_CONFIG);
    }

    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        new Setting(settingsContainer)
            .setName(t('Deepseek service'))
            .setHeading();

        // API Key + Check 按钮
        this.renderApiKeySetting(settingsContainer, DEEPSEEK_CONFIG, this.modelState, async () => {
            const defaultUrl = 'https://api.deepseek.com';
            const customUrl = this.getProviderSettings(DEEPSEEK_CONFIG).apiAddress;
            const baseUrl = customUrl && customUrl.trim() ? customUrl : defaultUrl;
            const modelId = this.modelState.selectedModel.id;

            const { DeepseekService } = await import('../../services/ai/DeepseekService');
            const deepseekService = new DeepseekService(this.modelState.apiKey, modelId, baseUrl);
            return await AITestHelper.testConnection(deepseekService, 'Deepseek');
        });

        // 模型选择 + 自定义模型输入
        this.renderModelSelector(settingsContainer, DEEPSEEK_CONFIG, this.modelState, this.refs);

        // Provider URL
        this.renderProviderUrlSetting(settingsContainer, DEEPSEEK_CONFIG);
    }
}

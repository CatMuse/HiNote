import { Setting } from 'obsidian';
import { BaseAIServiceSettings, AIProviderConfig, StandardModelState } from './AIServiceSettings';
import { AITestHelper } from '../../services/ai';
import { t } from '../../i18n';
import { DEFAULT_GEMINI_MODELS } from '../../types';

const GEMINI_CONFIG: AIProviderConfig = {
    settingsKey: 'gemini',
    serviceName: 'Gemini',
    defaultModels: DEFAULT_GEMINI_MODELS,
    apiKeyPlaceholder: 'Enter your API key',
    providerUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    providerUrlKey: 'baseUrl',
    defaultSettings: {
        apiKey: '',
        model: DEFAULT_GEMINI_MODELS[0].id,
        baseUrl: '',
        isCustomModel: false,
        lastCustomModel: ''
    }
};

export class GeminiSettings extends BaseAIServiceSettings {
    private modelState: StandardModelState;
    private refs = { modelSelectEl: null as HTMLSelectElement | null, customModelContainer: null as HTMLDivElement | null };

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeStandardModelState(GEMINI_CONFIG);
    }

    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        new Setting(settingsContainer)
            .setName(t('Gemini service'))
            .setHeading();

        // API Key + Check 按钮
        this.renderApiKeySetting(settingsContainer, GEMINI_CONFIG, this.modelState, async () => {
            const defaultUrl = 'https://generativelanguage.googleapis.com';
            const customUrl = this.getProviderSettings(GEMINI_CONFIG).baseUrl;
            const baseUrl = customUrl && customUrl.trim() ? customUrl : defaultUrl;
            const modelId = this.modelState.selectedModel.id;

            const { GeminiService } = await import('../../services/ai/GeminiService');
            const geminiService = new GeminiService(this.modelState.apiKey, modelId, baseUrl);
            return await AITestHelper.testConnection(geminiService, 'Gemini');
        });

        // 模型选择 + 自定义模型输入
        this.renderModelSelector(settingsContainer, GEMINI_CONFIG, this.modelState, this.refs);

        // Provider URL
        this.renderProviderUrlSetting(settingsContainer, GEMINI_CONFIG);
    }
}

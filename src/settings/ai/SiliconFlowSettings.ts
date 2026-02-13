import { Setting } from 'obsidian';
import { DEFAULT_SILICONFLOW_MODELS } from '../../types';
import { BaseAIServiceSettings, AIProviderConfig, StandardModelState } from './AIServiceSettings';
import { AITestHelper } from '../../services/ai';
import { t } from '../../i18n';

const SILICONFLOW_CONFIG: AIProviderConfig = {
    settingsKey: 'siliconflow',
    serviceName: 'SiliconFlow',
    defaultModels: DEFAULT_SILICONFLOW_MODELS,
    apiKeyPlaceholder: 'sk-...',
    providerUrlPlaceholder: 'https://api.siliconflow.cn/v1',
    providerUrlKey: 'baseUrl',
    defaultSettings: {
        apiKey: '',
        model: DEFAULT_SILICONFLOW_MODELS[0].id,
        baseUrl: '',
        isCustomModel: false,
        lastCustomModel: ''
    }
};

export class SiliconFlowSettings extends BaseAIServiceSettings {
    private modelState: StandardModelState;
    private refs = { modelSelectEl: null as HTMLSelectElement | null, customModelContainer: null as HTMLDivElement | null };

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeStandardModelState(SILICONFLOW_CONFIG);
    }

    display(containerEl: HTMLElement) {
        const settingsContainer = containerEl.createEl('div', { cls: 'ai-service-settings' });

        new Setting(settingsContainer)
            .setName(t('SiliconFlow service'))
            .setHeading();

        // API Key + Check 按钮
        this.renderApiKeySetting(settingsContainer, SILICONFLOW_CONFIG, this.modelState, async () => {
            const { SiliconFlowService } = await import('../../services/ai/SiliconFlowService');
            const siliconflowService = new SiliconFlowService(this.plugin.settings.ai);
            return await AITestHelper.testConnection(siliconflowService, 'SiliconFlow');
        });

        // 模型选择 + 自定义模型输入
        this.renderModelSelector(settingsContainer, SILICONFLOW_CONFIG, this.modelState, this.refs);

        // Provider URL
        this.renderProviderUrlSetting(settingsContainer, SILICONFLOW_CONFIG);
    }
}

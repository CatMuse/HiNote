import { Setting, Notice, requestUrl } from 'obsidian';
import { BaseAIServiceSettings, AIModel, AIProviderConfig, StandardModelState } from './AIServiceSettings';
import { AITestHelper } from '../../services/ai';
import { t } from '../../i18n';

const DEFAULT_OPENAI_MODELS: AIModel[] = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-o1', name: 'GPT-o1' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
];

const OPENAI_CONFIG: AIProviderConfig = {
    settingsKey: 'openai',
    serviceName: 'OpenAI',
    defaultModels: DEFAULT_OPENAI_MODELS,
    apiKeyPlaceholder: 'sk-...',
    providerUrlPlaceholder: 'https://api.openai.com/v1',
    providerUrlKey: 'apiAddress',
    defaultSettings: {
        apiKey: '',
        model: DEFAULT_OPENAI_MODELS[0].id,
        apiAddress: '',
        isCustomModel: false,
        lastCustomModel: ''
    }
};

export class OpenAISettings extends BaseAIServiceSettings {
    private modelState: StandardModelState;
    private refs = { modelSelectEl: null as HTMLSelectElement | null, customModelContainer: null as HTMLDivElement | null };

    constructor(plugin: any, containerEl: HTMLElement) {
        super(plugin, containerEl);
        this.modelState = this.initializeStandardModelState(OPENAI_CONFIG);
    }

    display(containerEl: HTMLElement): void {
        const settingsContainer = containerEl.createEl('div', {
            cls: 'ai-service-settings'
        });

        new Setting(settingsContainer)
            .setName(t('OpenAI service'))
            .setHeading();

        // API Key + Check 按钮（OpenAI 特有：通过 fetchAvailableModels 验证）
        this.renderApiKeySetting(settingsContainer, OPENAI_CONFIG, this.modelState, async () => {
            const models = await this.fetchAvailableModels(this.modelState.apiKey);
            return models.length > 0;
        });

        // 模型选择 + 自定义模型输入
        this.renderModelSelector(settingsContainer, OPENAI_CONFIG, this.modelState, this.refs);

        // Provider URL
        this.renderProviderUrlSetting(settingsContainer, OPENAI_CONFIG);
    }

    // === OpenAI 特有方法 ===

    private async validateModel(apiKey: string, modelId: string, apiAddress: string): Promise<boolean> {
        try {
            const modelResponse = await requestUrl({
                url: `${apiAddress}/models/${modelId}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (modelResponse.status !== 200) {
                new Notice(t('Custom model unavailable. Please check the model ID and your access permissions.'));
                return false;
            }

            const testResponse = await requestUrl({
                url: `${apiAddress}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [{ role: 'user', content: 'Hello' }],
                    max_tokens: 1
                })
            });

            if (testResponse.status !== 200) {
                return false;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    private async fetchAvailableModels(apiKey: string): Promise<AIModel[]> {
        try {
            const apiAddress = this.getProviderSettings(OPENAI_CONFIG).apiAddress || 'https://api.openai.com/v1';
            
            if (this.modelState.selectedModel.isCustom) {
                const modelId = this.modelState.selectedModel.id;
                const isValid = await this.validateModel(apiKey, modelId, apiAddress);
                if (!isValid) {
                    throw new Error(`Custom model not available: ${modelId}`);
                }
                return [this.modelState.selectedModel];
            }
            
            const response = await requestUrl({
                url: `${apiAddress}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                const data = response.json;
                return data.data.map((model: any) => ({
                    id: model.id,
                    name: model.id
                }));
            }
            return [];
        } catch (error) {
            throw error;
        }
    }
}

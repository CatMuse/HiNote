import { Setting, Notice, setIcon } from 'obsidian';
import { t } from '../../i18n';
import { AITestHelper } from '../../services/ai';

export interface AIModel {
    id: string;
    name: string;
    isCustom?: boolean;
}

export interface AIServiceSettings {
    display(containerEl: HTMLElement): void;
}

/**
 * AI 服务提供商配置
 * 子类通过实现此接口来定义自己的特有参数
 */
export interface AIProviderConfig {
    /** 设置键名，如 'openai', 'anthropic' 等 */
    settingsKey: string;
    /** 服务显示名称，如 'OpenAI service' */
    serviceName: string;
    /** 预设模型列表 */
    defaultModels: AIModel[];
    /** API Key 占位符，如 'sk-...' */
    apiKeyPlaceholder: string;
    /** Provider URL 占位符，如 'https://api.openai.com/v1' */
    providerUrlPlaceholder: string;
    /** Provider URL 的设置键名（有些用 apiAddress，有些用 baseUrl） */
    providerUrlKey?: string;
    /** 默认设置对象（用于初始化） */
    defaultSettings: Record<string, any>;
}

/**
 * 标准模型状态
 */
export interface StandardModelState {
    selectedModel: AIModel;
    apiKey: string;
}

export abstract class BaseAIServiceSettings implements AIServiceSettings {
    protected plugin: any;
    protected containerEl: HTMLElement;

    constructor(plugin: any, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
    }

    abstract display(containerEl: HTMLElement): void;

    protected createModelDropdown(container: HTMLElement, models: AIModel[], defaultModel: AIModel) {
        new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select the AI model to use'))
            .addDropdown(dropdown => {
                const options = Object.fromEntries(
                    models.map(model => [model.id, model.name])
                );

                return dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.ai.model || defaultModel.id)
                    .onChange(async (value) => {
                        this.plugin.settings.ai.model = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    // ==================== 标准 AI 设置公共方法 ====================

    /**
     * 获取指定提供商的设置对象，不存在则用默认值初始化
     */
    protected getProviderSettings(config: AIProviderConfig): any {
        if (!this.plugin.settings.ai[config.settingsKey]) {
            this.plugin.settings.ai[config.settingsKey] = { ...config.defaultSettings };
        }
        return this.plugin.settings.ai[config.settingsKey];
    }

    /**
     * 标准的模型状态初始化逻辑
     * 处理预设模型和自定义模型的恢复
     */
    protected initializeStandardModelState(config: AIProviderConfig): StandardModelState {
        const settings = this.getProviderSettings(config);
        let selectedModel: AIModel;

        if (settings.isCustomModel) {
            selectedModel = {
                id: settings.model,
                name: settings.model,
                isCustom: true
            };
        } else {
            const savedModel = config.defaultModels.find(m => m.id === settings.model);
            selectedModel = savedModel || config.defaultModels[0];
            if (!savedModel) {
                settings.model = selectedModel.id;
            }
        }

        return {
            selectedModel,
            apiKey: settings.apiKey || ''
        };
    }

    /**
     * 标准的模型状态保存逻辑
     */
    protected async saveStandardModelState(config: AIProviderConfig, modelState: StandardModelState): Promise<void> {
        const settings = this.getProviderSettings(config);
        const model = modelState.selectedModel;

        settings.model = model.id;
        settings.isCustomModel = !!model.isCustom;
        settings.apiKey = modelState.apiKey || '';

        if (model.isCustom && model.id) {
            settings.lastCustomModel = model.id;
        }

        await this.plugin.saveSettings();
    }

    /**
     * 渲染标准的 API Key 输入 + Check 按钮
     * onCheck 回调应返回 boolean：true 表示成功，false 表示失败
     */
    protected renderApiKeySetting(
        container: HTMLElement,
        config: AIProviderConfig,
        modelState: StandardModelState,
        onCheck: () => Promise<boolean>
    ): void {
        new Setting(container)
            .setName(t('API Key'))
            .setDesc(t('Please enter your API Key.'))
            .addText(text => text
                .setPlaceholder(config.apiKeyPlaceholder)
                .setValue(modelState.apiKey)
                .onChange(async (value) => {
                    modelState.apiKey = value;
                    await this.saveStandardModelState(config, modelState);
                }))
            .addButton(button => {
                button.setButtonText(t('Check'));
                button.onClick(async () => {
                    if (!modelState.apiKey || modelState.apiKey.trim() === '') {
                        this.showButtonStatus(button.buttonEl, 'warning');
                        return;
                    }
                    this.showButtonStatus(button.buttonEl, 'loading');
                    try {
                        const success = await onCheck();
                        this.showButtonStatus(button.buttonEl, success ? 'success' : 'error');
                    } catch (error) {
                        this.showButtonStatus(button.buttonEl, 'error');
                    }
                });
            });
    }

    /**
     * 在按钮中显示状态图标
     * @param buttonEl 按钮 DOM 元素
     * @param status 状态类型
     */
    protected showButtonStatus(
        buttonEl: HTMLButtonElement,
        status: 'loading' | 'success' | 'error' | 'warning'
    ): void {
        const originalText = buttonEl.textContent || t('Check');
        buttonEl.empty();
        buttonEl.disabled = status === 'loading';
        buttonEl.removeClass('check-btn-loading', 'check-btn-success', 'check-btn-error', 'check-btn-warning');

        switch (status) {
            case 'loading':
                setIcon(buttonEl, 'loader-2');
                buttonEl.addClass('check-btn-loading');
                break;
            case 'success':
                setIcon(buttonEl, 'check');
                buttonEl.addClass('check-btn-success');
                this.resetButtonAfterDelay(buttonEl, originalText, 2000);
                break;
            case 'error':
                setIcon(buttonEl, 'x');
                buttonEl.addClass('check-btn-error');
                this.resetButtonAfterDelay(buttonEl, originalText, 2000);
                break;
            case 'warning':
                setIcon(buttonEl, 'alert-triangle');
                buttonEl.addClass('check-btn-warning');
                this.resetButtonAfterDelay(buttonEl, originalText, 2000);
                break;
        }
    }

    /**
     * 延迟后恢复按钮为默认状态
     */
    protected resetButtonAfterDelay(buttonEl: HTMLButtonElement, text: string, delayMs: number): void {
        setTimeout(() => {
            buttonEl.empty();
            buttonEl.textContent = text;
            buttonEl.disabled = false;
            buttonEl.removeClass('check-btn-loading', 'check-btn-success', 'check-btn-error', 'check-btn-warning');
        }, delayMs);
    }

    /**
     * 渲染标准的模型下拉框 + 自定义模型输入
     * 返回 { modelSelectEl, customModelContainer } 供子类保存引用
     */
    protected renderModelSelector(
        container: HTMLElement,
        config: AIProviderConfig,
        modelState: StandardModelState,
        refs: { modelSelectEl: HTMLSelectElement | null; customModelContainer: HTMLDivElement | null }
    ): void {
        const modelSetting = new Setting(container)
            .setName(t('Model'))
            .setDesc(t('Select a model or enter a custom one.'))
            .addDropdown(dropdown => {
                config.defaultModels.forEach(model => {
                    dropdown.addOption(model.id, model.name);
                });
                dropdown.addOption('custom', t('Custom Model'));

                const currentValue = modelState.selectedModel.isCustom ? 'custom' : modelState.selectedModel.id;
                dropdown.setValue(currentValue);

                refs.modelSelectEl = dropdown.selectEl;

                dropdown.onChange(async (value) => {
                    if (value === 'custom') {
                        await this.showStandardCustomModelInput(config, modelState, refs);
                    } else {
                        const selectedModel = config.defaultModels.find(m => m.id === value);
                        if (selectedModel) {
                            if (modelState.selectedModel.isCustom) {
                                const settings = this.getProviderSettings(config);
                                settings.lastCustomModel = modelState.selectedModel.id;
                                await this.plugin.saveSettings();
                            }
                            modelState.selectedModel = selectedModel;
                            await this.saveStandardModelState(config, modelState);
                            this.hideStandardCustomModelInput(refs);
                        }
                    }
                });

                return dropdown;
            });

        // 创建自定义模型输入容器
        refs.customModelContainer = modelSetting.settingEl.createDiv('custom-model-container');
        refs.customModelContainer.addClass('custom-model-container');

        const dropdownEl = modelSetting.settingEl.querySelector('.setting-item-control');
        if (dropdownEl) {
            (dropdownEl as HTMLElement).addClass('openai-dropdown-container');
            dropdownEl.insertBefore(refs.customModelContainer, dropdownEl.firstChild);
        }

        // 添加自定义模型输入框
        const textComponent = new Setting(refs.customModelContainer)
            .addText(text => text
                .setPlaceholder('model-id')
                .setValue(modelState.selectedModel.isCustom ? modelState.selectedModel.id : '')
                .onChange(async (value) => {
                    const trimmedValue = value.trim();
                    if (!trimmedValue) return;

                    if (!/^[a-zA-Z0-9-_./:]+$/.test(trimmedValue)) {
                        new Notice(t('Model ID can only contain letters, numbers, underscores, dots and hyphens.'));
                        text.setValue(modelState.selectedModel.id);
                        return;
                    }

                    modelState.selectedModel = {
                        id: trimmedValue,
                        name: trimmedValue,
                        isCustom: true
                    };
                    await this.saveStandardModelState(config, modelState);
                }));

        const settingItem = textComponent.settingEl;
        settingItem.addClass('openai-setting-no-border');
        const controlEl = settingItem.querySelector('.setting-item-control');
        if (controlEl) {
            (controlEl as HTMLElement).addClass('openai-setting-no-margin');
        }

        if (modelState.selectedModel.isCustom) {
            this.showStandardCustomModelInput(config, modelState, refs);
        }
    }

    /**
     * 显示自定义模型输入框
     */
    protected async showStandardCustomModelInput(
        config: AIProviderConfig,
        modelState: StandardModelState,
        refs: { modelSelectEl: HTMLSelectElement | null; customModelContainer: HTMLDivElement | null }
    ): Promise<void> {
        if (refs.customModelContainer && refs.modelSelectEl) {
            refs.customModelContainer.addClass('visible');
            refs.modelSelectEl.value = 'custom';

            const settings = this.getProviderSettings(config);
            const currentModel = modelState.selectedModel;

            if (!currentModel.isCustom) {
                const modelId = settings.lastCustomModel || '';
                modelState.selectedModel = {
                    id: modelId,
                    name: modelId,
                    isCustom: true
                };
                settings.model = modelId;
                settings.isCustomModel = true;
                await this.plugin.saveSettings();

                const inputEl = refs.customModelContainer.querySelector('input');
                if (inputEl) {
                    (inputEl as HTMLInputElement).value = modelId;
                }
            }
        }
    }

    /**
     * 隐藏自定义模型输入框
     */
    protected hideStandardCustomModelInput(
        refs: { customModelContainer: HTMLDivElement | null }
    ): void {
        if (refs.customModelContainer) {
            refs.customModelContainer.removeClass('visible');
        }
    }

    /**
     * 渲染标准的 Provider URL 输入
     */
    protected renderProviderUrlSetting(
        container: HTMLElement,
        config: AIProviderConfig
    ): void {
        const urlKey = config.providerUrlKey || 'apiAddress';
        new Setting(container)
            .setName(t('Provider URL'))
            .setDesc(t('Leave it blank, unless you are using a proxy.'))
            .addText(text => text
                .setPlaceholder(config.providerUrlPlaceholder)
                .setValue(this.getProviderSettings(config)[urlKey] || '')
                .onChange(async (value) => {
                    const settings = this.getProviderSettings(config);
                    settings[urlKey] = value;
                    await this.plugin.saveSettings();
                }));
    }
}

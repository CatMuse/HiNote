import { Setting } from 'obsidian';
import type { AIProvider } from '../../types/ai';
import { t } from '../../i18n';
import { AI_PROVIDER_LABELS, createAISettingsRenderer } from '../ai';
import { PromptSettingsTab } from './PromptSettingsTab';
import type CommentPlugin from '../../../main';

export class AIServiceTab {
    private plugin: CommentPlugin;
    private containerEl: HTMLElement;

    constructor(plugin: CommentPlugin, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
    }

    display(): void {
        // AI 服务设置
        new Setting(this.containerEl)
            .setName(t('AI service'))
            .setDesc(t('Select the AI service provider'))
            .addDropdown(dropdown => {
                return dropdown
                    .addOptions(this.getProviderOptions())
                    .setValue(this.plugin.settings.ai.provider)
                    .onChange(async (value: AIProvider) => {
                        this.plugin.settings.ai.provider = value;
                        await this.plugin.saveSettings();
                        // 重新显示设置
                        this.containerEl.empty();
                        this.display();
                    });
            });

        createAISettingsRenderer(
            this.plugin.settings.ai.provider,
            this.plugin,
            this.containerEl
        ).display(this.containerEl);

        // 显示 Prompt 设置
        new PromptSettingsTab(this.plugin, this.containerEl).display();
    }

    private getProviderOptions(): Record<AIProvider, string> {
        return {
            ...AI_PROVIDER_LABELS,
            ollama: t(AI_PROVIDER_LABELS.ollama),
            custom: t(AI_PROVIDER_LABELS.custom)
        };
    }
}

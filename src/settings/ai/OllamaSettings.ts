import { Setting } from 'obsidian';
import type CommentPlugin from '../../../main';
import { OllamaService } from '../../services/ai/OllamaService';
import { t } from '../../i18n';
import { renderAIConnectionControls } from './AIConnectionControls';

export class OllamaSettings {
    constructor(private plugin: CommentPlugin, _container: HTMLElement) {}
    display(container: HTMLElement): void {
        const host = container.createDiv({ cls: 'ai-service-settings' });
        const get = () => this.plugin.settings.ai.ollama!;
        new Setting(host).setName(t('Ollama service')).setHeading();
        new Setting(host).setName(t('Server URL')).setDesc(t('Ollama server URL (default: http://localhost:11434)'))
            .addText(text => text.setValue(get().host).onChange(async value => {
                get().host = value.trim() || 'http://localhost:11434';
                await this.plugin.saveSettings();
            }));
        renderAIConnectionControls(host, {
            app: this.plugin.app,
            getModel: () => get().model,
            setModel: async id => { get().model = id; await this.plugin.saveSettings(); },
            fingerprint: () => get().host,
            create: () => {
                const service = new OllamaService(get().host);
                const model = get().model;
                return {
                    listModels: async () => (await service.listModels()).map(id => ({ id, name: id })),
                    chat: messages => service.chat(model, messages)
                };
            }
        });
    }
}

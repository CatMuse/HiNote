import { App, FuzzySuggestModal, Setting, TextComponent } from 'obsidian';
import { t } from '../../i18n';
import type { AIModel } from '../../services/ai/types';
import { AITestHelper } from '../../services/ai/AITestHelper';

interface Connection {
    listModels(): Promise<AIModel[]>;
    chat(messages: { role: 'user'; content: string }[]): Promise<string>;
}
interface Options {
    app: App;
    getModel: () => string;
    setModel: (id: string) => Promise<void>;
    fingerprint: () => string;
    create: () => Connection;
}
class ModelPicker extends FuzzySuggestModal<AIModel> {
    constructor(app: App, private models: AIModel[], private select: (id: string) => void) {
        super(app);
        this.setPlaceholder(t('Search models'));
    }
    getItems(): AIModel[] { return this.models; }
    getItemText(model: AIModel): string { return `${model.name} (${model.id})`; }
    onChooseItem(model: AIModel): void { this.select(model.id); }
}

/** Manual input always works, including when an endpoint has no models API. */
export function renderAIConnectionControls(container: HTMLElement, options: Options): void {
    let models: AIModel[] = [];
    let modelSource = '';
    let input: TextComponent;
    const modelSetting = new Setting(container)
        .setName(t('Model'))
        .setDesc(t('Enter a model ID, or refresh and choose. Refreshing never replaces your selected model.'))
        .addText(text => {
            input = text;
            text.setPlaceholder('model-id').setValue(options.getModel()).onChange(async value => {
                status.setText(t('Not tested'));
                await options.setModel(value.trim());
            });
        });
    modelSetting.addButton(button => button.setButtonText(t('Choose model')).onClick(() => {
        if (!models.length || modelSource !== options.fingerprint()) {
            modelSetting.setDesc(t('Refresh models first. You can always enter a model ID manually.'));
            return;
        }
        new ModelPicker(options.app, models, id => {
            if (!container.isConnected || modelSource !== options.fingerprint()) return;
            status.setText(t('Not tested'));
            input.setValue(id);
            void options.setModel(id);
        }).open();
    }));
    modelSetting.addButton(button => button.setButtonText(t('Refresh models')).onClick(async () => {
        const source = options.fingerprint();
        button.setDisabled(true);
        modelSetting.setDesc(t('Loading models...'));
        try {
            const result = await options.create().listModels();
            if (!container.isConnected || source !== options.fingerprint()) return;
            models = result;
            modelSource = source;
            modelSetting.setDesc(`${t('Models found')}: ${models.length}. ${t('Choose a model or enter its ID manually. Model availability is verified by testing.')}`);
        } catch (error) {
            if (container.isConnected && source === options.fingerprint()) {
                modelSetting.setDesc(`${AITestHelper.getErrorMessage(error)} ${t('You can still enter a model ID manually.')}`);
            }
        } finally {
            if (container.isConnected) {
                button.setDisabled(false);
                if (source !== options.fingerprint()) modelSetting.setDesc(t('Refresh models first. You can always enter a model ID manually.'));
            }
        }
    }));
    const test = new Setting(container)
        .setName(t('Test current model'))
        .setDesc(t('Sends a short test without note content. The provider may charge for this request.'));
    const status = test.descEl.createDiv({ attr: { role: 'status' }, text: t('Not tested') });
    // Invalidate visible results when configuration changes; listeners belong to this DOM subtree.
    const invalidate = () => status.setText(t('Not tested'));
    container.addEventListener('input', invalidate);
    container.addEventListener('change', invalidate);
    test.addButton(button => button.setButtonText(t('Test current model')).onClick(async () => {
        const source = options.fingerprint();
        const model = options.getModel();
        if (!model.trim()) { status.setText(t('Enter a model ID first.')); return; }
        button.setDisabled(true);
        status.setText(t('Testing'));
        const start = Date.now();
        try {
            const answer = await options.create().chat([{ role: 'user', content: 'Reply only OK.' }]);
            if (!answer.trim()) throw new Error('Empty model response');
            if (container.isConnected && source === options.fingerprint() && model === options.getModel()) {
                status.setText(`${t('Connected')}: ${model} · ${Date.now() - start} ms`);
            }
        } catch (error) {
            if (container.isConnected && source === options.fingerprint() && model === options.getModel()) status.setText(AITestHelper.getErrorMessage(error));
        } finally {
            if (container.isConnected) {
                button.setDisabled(false);
                if (source !== options.fingerprint() || model !== options.getModel()) status.setText(t('Not tested'));
            }
        }
    }));
}

import { App, Modal, Setting } from 'obsidian';

export class AddPromptModal extends Modal {
    private name: string = '';
    private content: string = '';
    private onSubmit: (name: string, content: string) => void;

    constructor(app: App, onSubmit: (name: string, content: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '添加 Prompt' });

        new Setting(contentEl)
            .setName('名称')
            .setDesc('为这个 Prompt 模板取一个名字')
            .addText(text => text
                .setPlaceholder('例如：总结要点')
                .onChange(value => this.name = value));

        new Setting(contentEl)
            .setName('内容')
            .setDesc('编写 Prompt 模板内容，使用 {{text}} 表示高亮内容的位置')
            .addTextArea(text => text
                .setPlaceholder('输入 Prompt 内容...')
                .onChange(value => this.content = value));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('取消')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('保存')
                .setCta()
                .onClick(() => {
                    if (this.name && this.content) {
                        this.onSubmit(this.name, this.content);
                        this.close();
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

export class EditPromptModal extends Modal {
    private name: string;
    private content: string;
    private onSubmit: (name: string, content: string) => void;

    constructor(app: App, name: string, content: string, onSubmit: (name: string, content: string) => void) {
        super(app);
        this.name = name;
        this.content = content;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '编辑 Prompt' });

        new Setting(contentEl)
            .setName('名称')
            .setDesc('修改 Prompt 模板的名称')
            .addText(text => text
                .setValue(this.name)
                .onChange(value => this.name = value));

        new Setting(contentEl)
            .setName('内容')
            .setDesc('修改 Prompt 模板内容')
            .addTextArea(text => text
                .setValue(this.content)
                .onChange(value => this.content = value));

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('取消')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('保存')
                .setCta()
                .onClick(() => {
                    if (this.name && this.content) {
                        this.onSubmit(this.name, this.content);
                        this.close();
                    }
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 
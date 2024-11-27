import { App, Modal, Setting, TextAreaComponent } from 'obsidian';

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

        // Name input
        new Setting(contentEl)
            .setName('名称')
            .setDesc('为这个 Prompt 模板取一个名字')
            .addText(text => text
                .setPlaceholder('例如：总结要点')
                .onChange(value => this.name = value));

        // Content input with parameter help
        const contentSetting = new Setting(contentEl)
            .setName('内容')
            .setDesc('编写 Prompt 模板内容，使用参数占位符：')
            .setClass('prompt-content-setting');

        // Add parameter help text
        const helpDiv = contentEl.createDiv('prompt-parameters-help');
        helpDiv.createEl('p', { text: '可用参数：' });
        const paramList = helpDiv.createEl('ul');
        paramList.createEl('li', { text: '{{highlight}} - 当前高亮的文本内容' });
        paramList.createEl('li', { text: '{{comment}} - 已添加的评论内容' });

        // Add textarea with improved styling
        let textArea: TextAreaComponent;
        contentSetting.addTextArea(text => {
            textArea = text;
            text.setPlaceholder('示例：\n请分析以下内容：\n\n{{highlight}}\n\n已有的评论：\n{{comment}}\n\n请给出你的见解：')
                .onChange(value => this.content = value);
            
            // Set minimum height
            const textEl = text.inputEl;
            textEl.style.minHeight = '200px';
            textEl.style.width = '100%';
            
            return text;
        });

        // Add parameter quick insert buttons
        const buttonDiv = contentEl.createDiv('prompt-parameter-buttons');
        const addHighlightBtn = buttonDiv.createEl('button', { text: '插入 {{highlight}}' });
        const addCommentBtn = buttonDiv.createEl('button', { text: '插入 {{comment}}' });

        addHighlightBtn.onclick = () => {
            const pos = textArea.inputEl.selectionStart;
            const newContent = this.content.slice(0, pos) + '{{highlight}}' + this.content.slice(pos);
            this.content = newContent;
            textArea.setValue(newContent);
        };

        addCommentBtn.onclick = () => {
            const pos = textArea.inputEl.selectionStart;
            const newContent = this.content.slice(0, pos) + '{{comment}}' + this.content.slice(pos);
            this.content = newContent;
            textArea.setValue(newContent);
        };

        // Action buttons
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

        // Name input
        new Setting(contentEl)
            .setName('名称')
            .setDesc('修改 Prompt 模板的名称')
            .addText(text => text
                .setValue(this.name)
                .onChange(value => this.name = value));

        // Content input with parameter help
        const contentSetting = new Setting(contentEl)
            .setName('内容')
            .setDesc('修改 Prompt 模板内容，使用参数占位符：')
            .setClass('prompt-content-setting');

        // Add parameter help text
        const helpDiv = contentEl.createDiv('prompt-parameters-help');
        helpDiv.createEl('p', { text: '可用参数：' });
        const paramList = helpDiv.createEl('ul');
        paramList.createEl('li', { text: '{{highlight}} - 当前高亮的文本内容' });
        paramList.createEl('li', { text: '{{comment}} - 已添加的评论内容' });

        // Add textarea with improved styling
        let textArea: TextAreaComponent;
        contentSetting.addTextArea(text => {
            textArea = text;
            text.setValue(this.content)
                .onChange(value => this.content = value);
            
            // Set minimum height
            const textEl = text.inputEl;
            textEl.style.minHeight = '200px';
            textEl.style.width = '100%';
            
            return text;
        });

        // Add parameter quick insert buttons
        const buttonDiv = contentEl.createDiv('prompt-parameter-buttons');
        const addHighlightBtn = buttonDiv.createEl('button', { text: '插入 {{highlight}}' });
        const addCommentBtn = buttonDiv.createEl('button', { text: '插入 {{comment}}' });

        addHighlightBtn.onclick = () => {
            const pos = textArea.inputEl.selectionStart;
            const newContent = this.content.slice(0, pos) + '{{highlight}}' + this.content.slice(pos);
            this.content = newContent;
            textArea.setValue(newContent);
        };

        addCommentBtn.onclick = () => {
            const pos = textArea.inputEl.selectionStart;
            const newContent = this.content.slice(0, pos) + '{{comment}}' + this.content.slice(pos);
            this.content = newContent;
            textArea.setValue(newContent);
        };

        // Action buttons
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
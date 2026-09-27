import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { HiCardWorkspace } from './HiCardWorkspace';

export const VIEW_TYPE_HICARD = 'hicard-view';

/** Independent HiCard workspace. Storage and source links remain shared with HiNote. */
export class HiCardView extends ItemView {
    private workspace: HiCardWorkspace | null = null;
    private generation = 0;

    constructor(leaf: WorkspaceLeaf, private plugin: CommentPlugin) {
        super(leaf);
    }

    getViewType(): string { return VIEW_TYPE_HICARD; }
    getDisplayText(): string { return 'HiCard'; }
    getIcon(): string { return 'book-heart'; }

    async onOpen(): Promise<void> {
        const generation = ++this.generation;
        const current = () => generation === this.generation;
        this.contentEl.addClass('hicard-view');
        this.contentEl.empty();
        this.contentEl.createDiv({ text: t('Loading...'), cls: 'hicard-view-message' });
        try {
            await this.plugin.ensureServicesInitialized();
            if (!current()) return;
            this.contentEl.empty();
            const workspace = new HiCardWorkspace(this.contentEl, this.plugin);
            this.workspace = workspace;
            this.addChild(workspace);
            await workspace.open(current);
        } catch (error) {
            if (!current()) return;
            this.releaseComponent();
            console.error('[HiCard] View initialization failed:', error);
            this.contentEl.empty();
            const message = this.contentEl.createDiv({ cls: 'hicard-view-message' });
            message.createDiv({ text: t('Unable to load this view. Try refreshing.') });
            const retry = message.createEl('button', { text: t('Retry') });
            this.registerDomEvent(retry, 'click', () => { void this.onOpen(); });
        }
    }

    private releaseComponent(): void {
        if (!this.workspace) return;
        this.workspace.close();
        this.removeChild(this.workspace);
        this.workspace = null;
    }

    async onClose(): Promise<void> {
        this.generation++;
        this.releaseComponent();
        this.contentEl.empty();
    }

    onunload(): void {
        this.generation++;
        this.releaseComponent();
    }
}

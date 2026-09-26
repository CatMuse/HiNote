import { ItemView, Notice, Scope, WorkspaceLeaf } from "obsidian";
import type CommentPlugin from '../../../main';
import { t } from '../../i18n';
import { ViewState, type ViewSession } from './ViewState';
import type { PluginServices } from '../../plugin/PluginServices';
import { HiNoteViewRuntime } from './HiNoteViewRuntime';

export const VIEW_TYPE_HINOTE = "hinote-view";

/**
 * HiNote 主视图
 * 负责显示和管理高亮、评论
 */
export class HiNoteView extends ItemView {
    private state = new ViewState();
    private runtime: HiNoteViewRuntime;

    constructor(leaf: WorkspaceLeaf, plugin: CommentPlugin, services: PluginServices) {
        super(leaf);
        // Keep a bare Escape inside the main HiNote tab. Without a view scope,
        // Obsidian handles the key at the app level and focuses the previously
        // active leaf, which looks like HiNote switched to another tab.
        this.scope = new Scope(this.app.scope);
        this.scope.register([], 'Escape', (event: KeyboardEvent) => {
            if (!this.state.isDraggedToMainView || event.isComposing) return false;
            event.preventDefault();
            event.stopPropagation();
        });
        this.runtime = new HiNoteViewRuntime({
            component: this,
            leaf,
            containerEl: this.containerEl,
            state: this.state,
            plugin,
            services
        });
    }

    getViewType(): string {
        return VIEW_TYPE_HINOTE;
    }

    getDisplayText(): string {
        return "HiNote";
    }

    getIcon(): string {
        return "highlighter";  // 使用与左侧功能区相同的图标
    }

    isInMainWindowMode(): boolean {
        return this.state.isDraggedToMainView;
    }

    async setMainWindowMode(enabled: boolean, _refreshHighlights = false): Promise<void> {
        await this.runtime.setMainWindowMode(enabled);
    }

    getSessionState(): ViewSession {
        return this.runtime.snapshotSession();
    }

    restoreSessionState(session: ViewSession): void {
        this.runtime.restoreSession(session);
    }

    async onOpen() {
        try {
            await this.runtime.mount();
        } catch (error) {
            new Notice(t('HiNote could not load its data. Check vault storage before editing.'));
            console.error('[HiNote] View initialization failed:', error);
            return;
        }
    }

    // 在 onunload 方法中确保清理
    onunload() {
        this.runtime.dispose();
    }

}

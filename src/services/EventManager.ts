import { App, Events, EventRef } from 'obsidian';

export interface RecordChangeEvent {
    entity: 'highlight' | 'comment';
    action: 'update' | 'delete';
    filePath: string;
    sourceId: string;
}

export interface HighlightEvents {
    'records:changed': [change: RecordChangeEvent];
    'highlight:update': [filePath: string, oldText: string, newText: string, sourceId: string];
    'highlight:delete': [filePath: string, text: string, sourceId: string];
    'comment:update': [filePath: string, oldComment: string, newComment: string, sourceId: string];
    'comment:delete': [filePath: string, comment: string, sourceId: string];
    'comment-input:open': [highlightId: string, text: string];
    'flashcard:changed': [];
    'favorites:changed': [];
    'exclusions:changed': [];
}

export class EventManager {
    private events: Events;

    constructor(private app: App) {
        this.events = new Events();
    }

    /**
     * 触发高亮更新事件
     */
    public emitHighlightUpdate(filePath: string, oldText: string, newText: string, sourceId: string) {
        this.events.trigger('highlight:update', filePath, oldText, newText, sourceId);
        this.emitRecordChange({ entity: 'highlight', action: 'update', filePath, sourceId });
    }

    /**
     * 触发高亮删除事件
     */
    public emitHighlightDelete(filePath: string, text: string, sourceId: string) {
        this.events.trigger('highlight:delete', filePath, text, sourceId);
        this.emitRecordChange({ entity: 'highlight', action: 'delete', filePath, sourceId });
    }

    /**
     * 触发评论更新事件
     */
    public emitCommentUpdate(filePath: string, oldComment: string, newComment: string, sourceId: string) {
        this.events.trigger('comment:update', filePath, oldComment, newComment, sourceId);
        this.emitRecordChange({ entity: 'comment', action: 'update', filePath, sourceId });
    }

    /**
     * 触发评论删除事件
     */
    public emitCommentDelete(filePath: string, comment: string, sourceId: string) {
        this.events.trigger('comment:delete', filePath, comment, sourceId);
        this.emitRecordChange({ entity: 'comment', action: 'delete', filePath, sourceId });
    }

    /**
     * 触发打开评论输入框事件
     */
    public emitCommentInputOpen(highlightId: string, text: string) {
        this.events.trigger('comment-input:open', highlightId, text);
    }

    /**
     * 触发闪卡变化事件
     */
    public emitFlashcardChanged() {
        this.events.trigger('flashcard:changed');
    }

    public emitFavoritesChanged(): void { this.events.trigger('favorites:changed'); }

    public emitExclusionsChanged(): void {
        this.events.trigger('exclusions:changed');
    }

    private emitRecordChange(change: RecordChangeEvent): void {
        this.events.trigger('records:changed', change);
    }

    /**
     * 注册事件监听器
     */
    public on<K extends keyof HighlightEvents>(
        event: K,
        callback: (...args: HighlightEvents[K]) => unknown
    ): EventRef {
        return this.events.on(event, callback);
    }

    /**
     * 注销事件监听器
     */
    public off<K extends keyof HighlightEvents>(
        event: K,
        callback: (...args: HighlightEvents[K]) => unknown
    ) {
        this.events.off(event, callback);
    }
}

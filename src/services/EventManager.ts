import { App, Events, EventRef } from 'obsidian';

export interface HighlightEvents {
    'highlight:update': [filePath: string, oldText: string, newText: string, sourceId: string];
    'highlight:delete': [filePath: string, text: string, sourceId: string];
    'comment:update': [filePath: string, oldComment: string, newComment: string, sourceId: string];
    'comment:delete': [filePath: string, comment: string, sourceId: string];
    'flashcard:changed': [];
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
    }

    /**
     * 触发高亮删除事件
     */
    public emitHighlightDelete(filePath: string, text: string, sourceId: string) {
        this.events.trigger('highlight:delete', filePath, text, sourceId);
    }

    /**
     * 触发评论更新事件
     */
    public emitCommentUpdate(filePath: string, oldComment: string, newComment: string, sourceId: string) {
        this.events.trigger('comment:update', filePath, oldComment, newComment, sourceId);
    }

    /**
     * 触发评论删除事件
     */
    public emitCommentDelete(filePath: string, comment: string, sourceId: string) {
        this.events.trigger('comment:delete', filePath, comment, sourceId);
    }

    /**
     * 触发闪卡变化事件
     */
    public emitFlashcardChanged() {
        this.events.trigger('flashcard:changed');
    }

    /**
     * 注册事件监听器
     */
    public on<K extends keyof HighlightEvents>(
        event: K,
        callback: (...args: HighlightEvents[K]) => any
    ): EventRef {
        return this.events.on(event, callback);
    }

    /**
     * 注销事件监听器
     */
    public off<K extends keyof HighlightEvents>(
        event: K,
        callback: (...args: HighlightEvents[K]) => any
    ) {
        this.events.off(event, callback);
    }
}

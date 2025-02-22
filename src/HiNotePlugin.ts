import { Plugin, TFile } from 'obsidian';
import { EventManager } from './services/EventManager';
import { FSRSManager } from './services/FSRSManager';
import { CommentStore } from './CommentStore';

export default class HiNotePlugin extends Plugin {
    private eventManager: EventManager;
    private fsrsManager: FSRSManager;
    private commentStore: CommentStore;

    async onload() {
        console.log('Loading HiNote plugin');
        
        // 初始化服务
        this.eventManager = new EventManager(this.app);
        this.fsrsManager = new FSRSManager(this);
        this.commentStore = new CommentStore(this);

        // 注册事件监听器
        this.registerEventHandlers();
    }

    private registerEventHandlers() {
        // 监听高亮更新事件
        this.eventManager.on('highlight:update', (filePath: string, oldText: string, newText: string) => {
            // 更新闪卡内容
            this.fsrsManager.updateCardContent(newText, '', filePath);
        });

        // 监听评论更新事件
        this.eventManager.on('comment:update', (filePath: string, oldComment: string, newComment: string) => {
            // 更新闪卡内容
            this.fsrsManager.updateCardContent('', newComment, filePath);
        });

        // 监听高亮删除事件
        this.eventManager.on('highlight:delete', (filePath: string, text: string) => {
            // 删除对应的闪卡
            this.fsrsManager.deleteCardsByContent(filePath, text);
        });

        // 监听评论删除事件
        this.eventManager.on('comment:delete', (filePath: string, comment: string) => {
            // 删除对应的闪卡
            this.fsrsManager.deleteCardsByContent(filePath, undefined, comment);
        });
    }

    async onunload() {
        console.log('Unloading HiNote plugin');
    }
}

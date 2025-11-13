import { Plugin } from 'obsidian';
import { CommentStore } from '../CommentStore';
import { HighlightDecorator } from '../HighlightDecorator';
import { FSRSManager } from '../flashcard/services/FSRSManager';
import { HighlightMatchingService } from './HighlightMatchingService';
import { HighlightService } from './HighlightService';
import { HiNoteDataManager } from '../storage/HiNoteDataManager';
import { CanvasService } from './CanvasService';
import { EventManager } from './EventManager';

/**
 * 初始化管理器
 * 负责管理插件的延迟初始化逻辑
 */
export class InitializationManager {
    // 延迟初始化标志
    private isInitialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;

    // 服务实例
    public eventManager!: EventManager;
    public dataManager!: HiNoteDataManager;
    public highlightService!: HighlightService;
    public canvasService!: CanvasService;
    public commentStore!: CommentStore;
    public fsrsManager!: FSRSManager;
    public highlightMatchingService!: HighlightMatchingService;
    public highlightDecorator!: HighlightDecorator;

    constructor(private plugin: Plugin) {}

    /**
     * 确保插件已初始化（延迟初始化）
     * 只在用户首次使用功能时才执行初始化
     */
    async ensureInitialized(): Promise<void> {
        // 如果已经初始化，直接返回
        if (this.isInitialized) {
            return;
        }

        // 如果正在初始化，等待完成
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        // 开始初始化
        this.initializationPromise = this.initialize();
        await this.initializationPromise;
        this.isInitialized = true;
    }

    /**
     * 实际的初始化逻辑
     */
    private async initialize(): Promise<void> {
        console.log('[HiNote] 开始延迟初始化...');
        const startTime = performance.now();

        // 初始化事件管理器（共享实例）
        this.eventManager = new EventManager(this.plugin.app);

        // 初始化数据管理器（共享实例）
        this.dataManager = new HiNoteDataManager(this.plugin.app);

        // 初始化高亮服务（共享实例）
        this.highlightService = new HighlightService(this.plugin.app);
        // 异步构建索引，不阻塞初始化
        this.highlightService.initialize();

        // 初始化 Canvas 服务（共享实例）
        this.canvasService = new CanvasService(this.plugin.app.vault);

        // 初始化评论存储（传入共享的服务实例）
        this.commentStore = new CommentStore(
            this.plugin as any,
            this.eventManager,
            this.dataManager,
            this.highlightService
        );
        // 异步加载评论数据，不阻塞初始化
        this.commentStore.loadComments().catch(error => {
            console.error('[HiNote] 加载评论数据失败:', error);
        });

        // 初始化 FSRS 管理器（传入数据管理器以使用新存储层）
        this.fsrsManager = new FSRSManager(this.plugin as any, this.dataManager);

        // 初始化高亮匹配服务
        this.highlightMatchingService = new HighlightMatchingService(
            this.plugin.app,
            this.commentStore
        );

        // 初始化高亮装饰器
        this.highlightDecorator = new HighlightDecorator(this.plugin, this.commentStore);
        this.highlightDecorator.enable();

        const duration = performance.now() - startTime;
        console.log(`[HiNote] 延迟初始化完成，耗时: ${duration.toFixed(2)}ms`);
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        // 保存最终状态
        try {
            if (this.isInitialized && this.commentStore) {
                await this.commentStore.saveComments();
            }
        } catch (error) {
            console.error('[HiNote] 保存评论数据失败:', error);
        }

        // 清理高亮装饰器
        if (this.highlightDecorator) {
            this.highlightDecorator.disable();
        }

        // 清理高亮服务（注销事件监听器，清空索引）
        if (this.highlightService) {
            this.highlightService.destroy();
        }
    }

    /**
     * 检查是否已初始化
     */
    get initialized(): boolean {
        return this.isInitialized;
    }
}

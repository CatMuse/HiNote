import { HighlightDecorator } from '../editor/HighlightDecorator';
import { FSRSManager } from '../flashcard';
import { HighlightService } from './HighlightService';
import { HiNoteDataManager } from '../storage/HiNoteDataManager';
import { CanvasService } from './CanvasService';
import { EventManager } from './EventManager';
import { HighlightManager } from './HighlightManager';
import { HighlightRepository } from '../repositories/HighlightRepository';
import type CommentPlugin from '../../main';
import type { PluginServices } from '../plugin/PluginServices';

/**
 * 初始化管理器
 * 负责管理插件的延迟初始化逻辑
 */
export class InitializationManager {
    // 延迟初始化标志
    private isInitialized: boolean = false;
    private initializationPromise: Promise<PluginServices> | null = null;
    private services: PluginServices | null = null;
    private disposed = false;

    constructor(private plugin: CommentPlugin) {}

    /**
     * 确保插件已初始化（延迟初始化）
     * 只在用户首次使用功能时才执行初始化
     */
    async ensureInitialized(): Promise<PluginServices> {
        if (this.disposed) throw new Error('HiNote has been unloaded.');
        if (this.initializationPromise) return this.initializationPromise;
        this.services = this.initialize();
        const services = this.services;
        this.initializationPromise = (async () => {
            await services.highlightRepository.initialize();
            await services.fsrsManager.initialize();
            if (this.disposed) throw new Error('HiNote was unloaded during initialization.');
            await services.highlightService.initialize();
            if (this.disposed) {
                services.highlightService.destroy();
                throw new Error('HiNote was unloaded during initialization.');
            }
            services.highlightDecorator.enable();
            this.isInitialized = true;
            return services;
        })();
        return this.initializationPromise;
    }

    /**
     * 实际的初始化逻辑
     */
    private initialize(): PluginServices {
        // 初始化事件管理器（共享实例）
        const eventManager = new EventManager(this.plugin.app);

        // 初始化数据管理器（共享实例）
        const dataManager = new HiNoteDataManager(this.plugin.app);

        // 初始化架构层
        const highlightRepository = new HighlightRepository(dataManager);

        // 初始化高亮服务（共享实例）
        const highlightService = new HighlightService(
            this.plugin.app,
            () => this.plugin.settings,
            () => highlightRepository
        );

        // 初始化 Canvas 服务（共享实例）
        const canvasService = new CanvasService(this.plugin.app.vault);

        const highlightManager = new HighlightManager(
            this.plugin.app,
            highlightRepository,
            eventManager,
            highlightService
        );
        
        // 初始化 FSRS 管理器（传入数据管理器以使用新存储层）
        const fsrsManager = new FSRSManager(this.plugin, dataManager);

        // 初始化高亮装饰器
        const highlightDecorator = new HighlightDecorator(this.plugin, highlightRepository, highlightService, eventManager);

        return {
            eventManager,
            dataManager,
            highlightService,
            canvasService,
            fsrsManager,
            highlightDecorator,
            highlightRepository,
            highlightManager
        };
    }

    /**
     * 清理资源
     */
    async cleanup(): Promise<void> {
        this.disposed = true;

        // 清理高亮装饰器
        if (this.services?.highlightDecorator) {
            this.services.highlightDecorator.disable();
        }

        // 清理高亮服务（注销事件监听器，清空索引）
        if (this.services?.highlightService) {
            this.services.highlightService.destroy();
        }
        await this.services?.fsrsManager.dispose();
    }

    /**
     * 检查是否已初始化
     */
    get initialized(): boolean {
        return this.isInitialized;
    }

    get currentServices(): PluginServices | null {
        return this.services;
    }
}

import { Plugin } from 'obsidian';
import { HiNoteView, VIEW_TYPE_HINOTE } from './src/core/HiNoteView';
import { AISettingTab } from './src/settings/SettingTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';
import html2canvas from 'html2canvas';
import { ChatViewManager } from './src/views/chat/ChatViewManager';
import { registerCommands, createWindowManager } from './src/commands';
import { InitializationManager } from './src/services/InitializationManager';
import { WindowManager } from './src/services/WindowManager';

export default class CommentPlugin extends Plugin {
	settings: PluginSettings;
	private initManager: InitializationManager;
	private windowManager: WindowManager;

	// 公开服务实例供外部访问
	get highlightDecorator() { return this.initManager.highlightDecorator; }
	get fsrsManager() { return this.initManager.fsrsManager; }
	get eventManager() { return this.initManager.eventManager; }
	get highlightService() { return this.initManager.highlightService; }
	get dataManager() { return this.initManager.dataManager; }
	get canvasService() { return this.initManager.canvasService; }
	
	// 架构层实例
	get highlightRepository() { return this.initManager.highlightRepository; }
	get highlightManager() { return this.initManager.highlightManager; }

	async onload() {
		// 加载设置
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// 将 html2canvas 添加到全局对象（轻量级操作）
		(window as Window & typeof globalThis & { html2canvas?: typeof html2canvas }).html2canvas = html2canvas;

		// 初始化管理器
		this.initManager = new InitializationManager(this);
		this.windowManager = createWindowManager(this);

		// 注册视图（延迟初始化）
		this.registerView(
			VIEW_TYPE_HINOTE,
			(leaf) => {
				this.initManager.ensureInitialized();
				return new HiNoteView(leaf, this.initManager.highlightManager, this.initManager.highlightRepository);
			}
		);

		// 添加功能按钮
		this.addRibbonIcon(
			'highlighter',
			'HiNote',
			async () => {
				await this.initManager.ensureInitialized();
				await this.windowManager.openCommentPanelInSidebar();
			}
		);

		// 注册所有命令
		registerCommands(this, this.windowManager, () => this.initManager.ensureInitialized());

		// 添加设置标签页
		this.addSettingTab(new AISettingTab(this.app, this));

		// 监听文件重命名事件
		this.registerEvent(
			this.app.vault.on('rename', async (file, oldPath) => {
				if (this.initManager.initialized && this.highlightManager) {
					await this.highlightManager.handleFileRename(oldPath, file.path);
				}
			})
		);
	}


	async onunload() {
		// 清理初始化管理器
		if (this.initManager) {
			await this.initManager.cleanup();
		}

		// 如果对话窗口打开，关闭它
		if (ChatViewManager.instance) {
			ChatViewManager.instance.close();
		}
	}

	async saveSettings() {
        // 确保基础设置存在
        if (!this.settings) {
            this.settings = { ...DEFAULT_SETTINGS };
        }

        // 保护现有的 flashcard-license 数据
        const existingData = await this.loadData();
        if (existingData?.['flashcard-license']) {
            this.settings['flashcard-license'] = existingData['flashcard-license'];
        }

        // 确保高亮相关设置存在
        this.settings.excludePatterns = this.settings.excludePatterns ?? DEFAULT_SETTINGS.excludePatterns;
        this.settings.useCustomPattern = this.settings.useCustomPattern ?? DEFAULT_SETTINGS.useCustomPattern;
        if (!this.settings.regexRules || !Array.isArray(this.settings.regexRules)) {
            this.settings.regexRules = [...DEFAULT_SETTINGS.regexRules];
        }

        // 确保 AI 和导出设置存在
        this.settings.ai = this.settings.ai || { ...DEFAULT_SETTINGS.ai };
        this.settings.export = this.settings.export || { ...DEFAULT_SETTINGS.export };

        // 确保 prompts 对象存在
        if (!this.settings.ai.prompts) {
            this.settings.ai.prompts = { ...DEFAULT_SETTINGS.ai.prompts };
        }

        await this.saveData(this.settings);
    }
}

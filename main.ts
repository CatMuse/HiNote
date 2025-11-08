import { Plugin, TAbstractFile, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { CommentView, VIEW_TYPE_COMMENT } from './src/CommentView';
import { CommentStore } from './src/CommentStore';
import { HighlightDecorator } from './src/HighlightDecorator';
import { AISettingTab } from './src/settings/SettingTab';
import { PluginSettings, DEFAULT_SETTINGS, HighlightSettings } from './src/types';
import html2canvas from 'html2canvas';
import { ChatView } from './src/components/ChatView';
import { t } from './src/i18n';
import { FSRSManager } from './src/flashcard/services/FSRSManager';
import { HighlightMatchingService } from './src/services/HighlightMatchingService';
import { HighlightService } from './src/services/HighlightService';
import { HiNoteDataManager } from './src/storage/HiNoteDataManager';
import { CanvasService } from './src/services/CanvasService';
import { EventManager } from './src/services/EventManager';

export default class CommentPlugin extends Plugin {
	settings: PluginSettings;
	public commentStore: CommentStore;
	private highlightDecorator: HighlightDecorator;
	public fsrsManager: FSRSManager;
	public eventManager: EventManager;
	public highlightMatchingService: HighlightMatchingService;
	public highlightService: HighlightService;
	public dataManager: HiNoteDataManager;
	public canvasService: CanvasService;

	async onload() {

		// 加载设置
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// 将 html2canvas 添加到全局对象
		// 安全地扩展 Window 接口并添加 html2canvas
		(window as Window & typeof globalThis & { html2canvas?: typeof html2canvas }).html2canvas = html2canvas;

		// 初始化事件管理器（共享实例）
		this.eventManager = new EventManager(this.app);

		// 初始化数据管理器（共享实例）
		this.dataManager = new HiNoteDataManager(this.app);

		// 初始化高亮服务（共享实例）
		this.highlightService = new HighlightService(this.app);
		// 立即开始构建索引（异步，不阻塞插件加载），提升后续加载性能
		this.highlightService.initialize();

		// 初始化 Canvas 服务（共享实例）
		this.canvasService = new CanvasService(this.app.vault);

		// 初始化评论存储（传入共享的服务实例）
		this.commentStore = new CommentStore(this, this.eventManager, this.dataManager, this.highlightService);
		await this.commentStore.loadComments();

		// 初始化 FSRS 管理器（传入数据管理器以使用新存储层）
		this.fsrsManager = new FSRSManager(this, this.dataManager);

		// 初始化高亮匹配服务
		this.highlightMatchingService = new HighlightMatchingService(this.app, this.commentStore);

		// 初始化高亮装饰器
		this.highlightDecorator = new HighlightDecorator(this, this.commentStore);
		this.highlightDecorator.enable();

		// 注册视图
		this.registerView(
			VIEW_TYPE_COMMENT,
			(leaf) => new CommentView(leaf, this.commentStore)
		);

		// 添加打开评论面板的功能按钮
		this.addRibbonIcon(
			'highlighter',
			'HiNote',
			async () => {
				await this.openCommentPanelInSidebar();
			}
		);

		// 添加打开评论面板的命令
		this.addCommand({
			id: 'open-comment-window',
			name: t('Open in right sidebar'),
			callback: async () => {
				await this.openCommentPanelInSidebar();
			}
		});

		// 添加设置标签页
		this.addSettingTab(new AISettingTab(this.app, this));


		// 监听文件重命名事件
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.commentStore.updateFilePath(oldPath, file.path);
			})
		);

		// 添加数据恢复命令
		this.addCommand({
			id: 'recover-data',
			name: t('Recover data from backup'),
			callback: async () => {
				const { DataRecovery } = await import('./src/storage/DataRecovery');
				const recovery = new DataRecovery(this);
				
				new Notice(t('Starting data recovery from backup, please check console output'));
				const success = await recovery.autoRecover();
				
				if (success) {
					new Notice(t('Data recovery successful! Please reload the plugin to see the effects'));
					// 重新加载CommentStore以显示恢复的数据
					await this.commentStore.loadComments();
				} else {
					new Notice(t('Data recovery failed, please check console error messages'));
				}
			}
		});

		// 添加打开对话窗口的命令
		this.addCommand({
			id: 'open-chat-window',
			name: t('Open AI chat window'),
			callback: () => {
				const chatView = ChatView.getInstance(this.app, this);
				chatView.show();
			}
		});

		// 添加在主窗口打开评论面板的命令
		this.addCommand({
			id: 'open-comment-main-window',
			name: t('Open in main window'),
			callback: async () => {
				const { workspace } = this.app;
				
				// 检查评论面板是否已经打开
				const existing = workspace.getLeavesOfType(VIEW_TYPE_COMMENT);
				if (existing.length) {
					// 如果已经打开，尝试将其移动到主视图区域
					const existingLeaf = existing[0];
					
					// 先激活现有视图
					workspace.setActiveLeaf(existingLeaf, {focus: true});
					
					// 使用另一种方式将视图移动到主视图区域
					// 先分离当前叶子
					workspace.detachLeavesOfType(VIEW_TYPE_COMMENT);
					
					// 然后在主视图区域创建新的叶子（使用tab而不是split避免分屏）
					const newLeaf = workspace.getLeaf('tab');
					await newLeaf.setViewState({
						type: VIEW_TYPE_COMMENT,
						active: true,
					});
					
					// 将视图标记为主窗口模式
					const view = newLeaf.view;
					if (view && view instanceof CommentView) {
						(view as any).isDraggedToMainView = true;
						// 强制刷新文件列表，确保显示最新的文件和高亮
						if ((view as any).fileListManager) {
							(view as any).fileListManager.invalidateCache();
						}
						(view as any).updateViewLayout();
						(view as any).updateHighlights();
					}
					return;
				}

				// 如果评论面板未打开，在主视图区域创建新标签页
				const leaf = workspace.getLeaf('tab');
				if (leaf) {
					await leaf.setViewState({
						type: VIEW_TYPE_COMMENT,
						active: true,
					});
					
					// 将新创建的视图标记为主窗口模式
					setTimeout(() => {
						const view = leaf.view;
						if (view && view instanceof CommentView) {
							(view as any).isDraggedToMainView = true;
							// 强制刷新文件列表，确保显示最新的文件和高亮
							if ((view as any).fileListManager) {
								(view as any).fileListManager.invalidateCache();
							}
							(view as any).updateViewLayout();
							(view as any).updateHighlights();
						}
					}, 100);
				}
			}
		});
	}

	async onunload() {

        // 保存最终状态
		try {
			await this.commentStore.saveComments();
		} catch (error) {

		}

		// 清理高亮装饰器
		if (this.highlightDecorator) {
			this.highlightDecorator.disable();
		}

		// 清理高亮服务（注销事件监听器，清空索引）
		if (this.highlightService) {
			this.highlightService.destroy();
		}

		// 如果对话窗口打开，关闭它
		if (ChatView.instance) {
			ChatView.instance.close();
		}
	}

	/**
	 * 在右侧侧边栏打开评论面板
	 * 如果面板已在主视图中打开，则移动到侧边栏
	 */
	private async openCommentPanelInSidebar() {
		const { workspace } = this.app;
		
		// 检查评论面板是否已经打开
		const existing = workspace.getLeavesOfType(VIEW_TYPE_COMMENT);
		if (existing.length) {
			// 如果已经打开，先检查当前视图是否在主视图区域
			const existingLeaf = existing[0];
			const view = existingLeaf.view;
			
			// 如果在主视图区域，则移动到右侧侧边栏
			if (view && view instanceof CommentView && (view as any).isDraggedToMainView) {
				// 先分离当前叶子
				workspace.detachLeavesOfType(VIEW_TYPE_COMMENT);
				
				// 然后在右侧侧边栏创建新的叶子
				const newLeaf = workspace.getRightLeaf(false);
				if (newLeaf) {
					await newLeaf.setViewState({
						type: VIEW_TYPE_COMMENT,
						active: true,
					});
					
					// 将视图标记为侧边栏模式
					const newView = newLeaf.view;
					if (newView && newView instanceof CommentView) {
						(newView as any).isDraggedToMainView = false;
						(newView as any).updateViewLayout();
						(newView as any).updateHighlights();
					}
				}
			} else {
				// 如果已经在侧边栏，则直接激活它
				workspace.revealLeaf(existingLeaf);
			}
			return;
		}

		// 如果评论面板未打开，则在右侧打开评论面板
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_COMMENT,
				active: true,
			});
			
			// 确保视图标记为侧边栏模式
			const view = leaf.view;
			if (view && view instanceof CommentView) {
				(view as any).isDraggedToMainView = false;
				(view as any).updateViewLayout();
			}
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

        // 确保每个 AI 服务提供商的设置都存在
        if (!this.settings.ai.openai && DEFAULT_SETTINGS.ai.openai) {
            this.settings.ai.openai = { ...DEFAULT_SETTINGS.ai.openai };
        }
        if (!this.settings.ai.anthropic && DEFAULT_SETTINGS.ai.anthropic) {
            this.settings.ai.anthropic = { ...DEFAULT_SETTINGS.ai.anthropic };
        }
        if (!this.settings.ai.gemini && DEFAULT_SETTINGS.ai.gemini) {
            this.settings.ai.gemini = { ...DEFAULT_SETTINGS.ai.gemini };
        }
        if (!this.settings.ai.ollama && DEFAULT_SETTINGS.ai.ollama) {
            this.settings.ai.ollama = { ...DEFAULT_SETTINGS.ai.ollama };
        }
        if (!this.settings.ai.deepseek && DEFAULT_SETTINGS.ai.deepseek) {
            this.settings.ai.deepseek = { ...DEFAULT_SETTINGS.ai.deepseek };
        }
        if (!this.settings.ai.siliconflow && DEFAULT_SETTINGS.ai.siliconflow) {
            this.settings.ai.siliconflow = { ...DEFAULT_SETTINGS.ai.siliconflow };
        }
        
        // 确保 prompts 对象存在
        if (!this.settings.ai.prompts) {
            this.settings.ai.prompts = { ...DEFAULT_SETTINGS.ai.prompts };
        }

        await this.saveData(this.settings);
    }
}

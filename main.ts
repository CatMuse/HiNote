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

import { EventManager } from './src/services/EventManager';

export default class CommentPlugin extends Plugin {
	settings: PluginSettings;
	DEFAULT_SETTINGS = {
		...DEFAULT_SETTINGS,
		anthropic: {
			apiKey: '',
			model: 'claude-2',
			apiAddress: '',
			isCustomModel: false,
			lastCustomModel: ''
		}
	};
	private commentStore: CommentStore;
	private highlightDecorator: HighlightDecorator;
	public fsrsManager: FSRSManager;
	public eventManager: EventManager;
	public highlightMatchingService: HighlightMatchingService;
	public highlightService: HighlightService;
	public dataManager: HiNoteDataManager;

	async onload() {

		// 加载设置
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// 将 html2canvas 添加到全局对象
		// 安全地扩展 Window 接口并添加 html2canvas
		(window as Window & typeof globalThis & { html2canvas?: typeof html2canvas }).html2canvas = html2canvas;

		// 初始化数据管理器
		this.dataManager = new HiNoteDataManager(this.app);

		// 初始化评论存储（会自动处理数据迁移）
		this.commentStore = new CommentStore(this);
		await this.commentStore.loadComments();

		// 初始化事件管理器
		this.eventManager = new EventManager(this.app);

		// 初始化 FSRS 管理器（传入数据管理器以使用新存储层）
		this.fsrsManager = new FSRSManager(this, this.dataManager);

		// 初始化高亮匹配服务
		this.highlightMatchingService = new HighlightMatchingService(this.app, this.commentStore);

		// 初始化高亮服务
		this.highlightService = new HighlightService(this.app);

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
				const { workspace } = this.app;
				
				// 检查评论面板是否已经打开，如果已经打开，就激活它
				const existing = workspace.getLeavesOfType(VIEW_TYPE_COMMENT);
				if (existing.length) {
					workspace.revealLeaf(existing[0]);
					return;
				}

				// 在右侧打开评论面板
				const leaf = workspace.getRightLeaf(false);
				if (leaf) {
					await leaf.setViewState({
						type: VIEW_TYPE_COMMENT,
						active: true,
					});
				}
			}
		);

		// 添加打开评论面板的命令
		this.addCommand({
			id: 'open-comment-window',
			name: t('Open in right sidebar'),
			callback: async () => {
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
		});

		// 添加设置标签页
		this.addSettingTab(new AISettingTab(this.app, this));

		// 监控评论加载性能
		const measureCommentPerformance = () => {
			const start = performance.now();
			
			// 评论加载操作		
			const end = performance.now();
		}

		// 监听文件重命名事件
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				this.commentStore.updateFilePath(oldPath, file.path);
			})
		);

		// 添加检查迁移状态的命令
		this.addCommand({
			id: 'check-migration-status',
			name: '检查数据迁移状态',
			callback: async () => {
				const migrationManager = (this.commentStore as any).migrationManager;
				if (migrationManager) {
					const status = await migrationManager.getMigrationStatus();
					const needsMigration = await migrationManager.needsMigration();
					
					
					new Notice(`迁移状态: ${status.isCompleted ? '已完成' : '未完成'}`);
				}
			}
		});


		// 添加数据恢复命令
		this.addCommand({
			id: 'recover-data',
			name: '从备份恢复数据',
			callback: async () => {
				const { DataRecovery } = await import('./src/storage/DataRecovery');
				const recovery = new DataRecovery(this);
				
				new Notice('开始从备份恢复数据，请查看控制台输出');
				const success = await recovery.autoRecover();
				
				if (success) {
					new Notice('数据恢复成功！请重新加载插件查看效果');
					// 重新加载CommentStore以显示恢复的数据
					await this.commentStore.loadComments();
				} else {
					new Notice('数据恢复失败，请查看控制台错误信息');
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
			const finalData = await this.loadData();
		} catch (error) {

		}

		// 清理高亮装饰器
		if (this.highlightDecorator) {
			this.highlightDecorator.disable();
		}

		// 如果对话窗口打开，关闭它
		if (ChatView.instance) {
			ChatView.instance.close();
		}
	}

	async loadSettings() {
        const loadedData = await this.loadData();
        
        // 初始化设置
        if (!this.settings) {
            this.settings = {
                excludePatterns: DEFAULT_SETTINGS.excludePatterns,
                useCustomPattern: DEFAULT_SETTINGS.useCustomPattern,
                regexRules: [...DEFAULT_SETTINGS.regexRules],
                ai: {
                    provider: DEFAULT_SETTINGS.ai.provider,
                    openai: DEFAULT_SETTINGS.ai.openai ? { ...DEFAULT_SETTINGS.ai.openai } : undefined,
                    anthropic: DEFAULT_SETTINGS.ai.anthropic ? { ...DEFAULT_SETTINGS.ai.anthropic } : undefined,
                    gemini: DEFAULT_SETTINGS.ai.gemini ? { ...DEFAULT_SETTINGS.ai.gemini } : undefined,
                    ollama: DEFAULT_SETTINGS.ai.ollama ? { ...DEFAULT_SETTINGS.ai.ollama } : undefined,
                    deepseek: DEFAULT_SETTINGS.ai.deepseek ? { ...DEFAULT_SETTINGS.ai.deepseek } : undefined,
                    prompts: { ...DEFAULT_SETTINGS.ai.prompts }
                },
                export: {
                    exportPath: DEFAULT_SETTINGS.export.exportPath
                }
            };
        }

        // 加载排除模式设置
        if (loadedData?.excludePatterns !== undefined) {
            this.settings.excludePatterns = loadedData.excludePatterns;
        }

        if (loadedData?.ai) {
            // 分别合并每个服务提供商的设置
            if (loadedData.ai.provider) {
                this.settings.ai.provider = loadedData.ai.provider;
            }
            if (loadedData.ai.openai && this.settings.ai.openai) {
                this.settings.ai.openai = {
                    apiKey: loadedData.ai.openai.apiKey || this.settings.ai.openai.apiKey,
                    model: loadedData.ai.openai.model || this.settings.ai.openai.model,
                    baseUrl: loadedData.ai.openai.baseUrl
                };
            }
            if (loadedData.ai.anthropic && this.settings.ai.anthropic) {
                this.settings.ai.anthropic = {
                    apiKey: loadedData.ai.anthropic.apiKey || this.settings.ai.anthropic.apiKey,
                    model: loadedData.ai.anthropic.model || this.settings.ai.anthropic.model,
                    availableModels: loadedData.ai.anthropic.availableModels,
                    apiAddress: loadedData.ai.anthropic.apiAddress || loadedData.ai.anthropic.baseUrl,
                    isCustomModel: loadedData.ai.anthropic.isCustomModel || false,
                    lastCustomModel: loadedData.ai.anthropic.lastCustomModel || ''
                };
            }
            if (loadedData.ai.gemini && this.settings.ai.gemini) {
                this.settings.ai.gemini = {
                    apiKey: loadedData.ai.gemini.apiKey || this.settings.ai.gemini.apiKey,
                    model: loadedData.ai.gemini.model || this.settings.ai.gemini.model,
                    baseUrl: loadedData.ai.gemini.baseUrl,
                    isCustomModel: loadedData.ai.gemini.isCustomModel || false
                };
            }
            if (loadedData.ai.ollama && this.settings.ai.ollama) {
                this.settings.ai.ollama = {
                    host: loadedData.ai.ollama.host || this.settings.ai.ollama.host,
                    model: loadedData.ai.ollama.model || this.settings.ai.ollama.model,
                    availableModels: loadedData.ai.ollama.availableModels
                };
            }
            if (loadedData.ai.deepseek && this.settings.ai.deepseek) {
                this.settings.ai.deepseek = {
                    apiKey: loadedData.ai.deepseek.apiKey || this.settings.ai.deepseek.apiKey,
                    model: loadedData.ai.deepseek.model || this.settings.ai.deepseek.model,
                    baseUrl: loadedData.ai.deepseek.baseUrl
                };
            }
            if (loadedData.ai.prompts) {
                this.settings.ai.prompts = {
                    ...this.settings.ai.prompts,
                    ...loadedData.ai.prompts
                };
            }
        }

        if (loadedData?.export) {
            if (loadedData.export.exportPath) {
                this.settings.export.exportPath = loadedData.export.exportPath;
            }
        }

        // 保留评论数据
        if (loadedData?.comments) {
            this.settings.comments = loadedData.comments;
        }
        if (loadedData?.comments) {
            this.settings.comments = loadedData.comments;
        }

        await this.saveSettings();
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

        // 确保高亮相关设置存在并有默认值
        this.settings.excludePatterns = this.settings.excludePatterns ?? DEFAULT_SETTINGS.excludePatterns;
        this.settings.useCustomPattern = this.settings.useCustomPattern ?? DEFAULT_SETTINGS.useCustomPattern;
        // 确保 regexRules 存在
        if (!this.settings.regexRules || !Array.isArray(this.settings.regexRules)) {
            this.settings.regexRules = [...DEFAULT_SETTINGS.regexRules];
        }

        // 确保 AI 设置存在
        if (!this.settings.ai) {
            this.settings.ai = { ...DEFAULT_SETTINGS.ai };
        }

        // 确保导出设置存在
        if (!this.settings.export) {
            this.settings.export = { ...DEFAULT_SETTINGS.export };
        }

        // 确保每个 AI 服务提供商的设置都存在并有默认值
        if (!this.settings.ai.openai) {
            this.settings.ai.openai = {
                apiKey: '',
                model: DEFAULT_SETTINGS.ai.openai?.model || 'gpt-4o',
                baseUrl: DEFAULT_SETTINGS.ai.openai?.baseUrl
            };
        }
        if (!this.settings.ai.anthropic) {
            this.settings.ai.anthropic = {
                apiKey: '',  // 提供默认值
                model: 'claude-2',  // 提供默认值
                availableModels: DEFAULT_SETTINGS.ai.anthropic?.availableModels,
                apiAddress: DEFAULT_SETTINGS.ai.anthropic?.apiAddress,
                isCustomModel: false,  // 提供默认值
                lastCustomModel: ''  // 提供默认值
            };
        }
        if (!this.settings.ai.gemini) {
            this.settings.ai.gemini = {
                apiKey: '',  // 提供默认值
                model: 'gemini-1.5-flash',  // 提供默认值
                isCustomModel: false,  // 提供默认值
                baseUrl: DEFAULT_SETTINGS.ai.gemini?.baseUrl
            };
        }
        if (!this.settings.ai.ollama) {
            this.settings.ai.ollama = {
                host: 'http://localhost:11434',  // 提供默认值
                model: '',  // 删除提供默认值
                availableModels: DEFAULT_SETTINGS.ai.ollama?.availableModels
            };
        }
        if (!this.settings.ai.deepseek) {
            this.settings.ai.deepseek = {
                apiKey: '',  // 提供默认值
                model: 'deepseek-chat',  // 提供默认值
                baseUrl: DEFAULT_SETTINGS.ai.deepseek?.baseUrl
            };
        }
        
        // 确保 prompts 对象存在
        if (!this.settings.ai.prompts) {
            this.settings.ai.prompts = { ...DEFAULT_SETTINGS.ai.prompts };
        }
        
        // 确保 export 对象存在
        if (!this.settings.export) {
            this.settings.export = {
                exportPath: DEFAULT_SETTINGS.export.exportPath
            };
        }
        await this.saveData(this.settings);
    }
}

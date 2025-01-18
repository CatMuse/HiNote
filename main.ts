import { App, Plugin } from 'obsidian';
import { CommentView, VIEW_TYPE_COMMENT } from './src/CommentView';
import { CommentStore } from './src/CommentStore';
import { HighlightDecorator } from './src/HighlightDecorator';
import { AISettingTab } from './src/settings/SettingTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';
import html2canvas from 'html2canvas';
import { ChatView } from './src/components/ChatView';
import { t } from './src/i18n';

export default class CommentPlugin extends Plugin {
	settings: PluginSettings;
	DEFAULT_SETTINGS = DEFAULT_SETTINGS;
	private commentStore: CommentStore;
	private highlightDecorator: HighlightDecorator;

	async onload() {
		// 加载设置
		await this.loadSettings();

		// 将 html2canvas 添加到全局对象
		(window as any).html2canvas = html2canvas;

		// 初始化评论存储
		this.commentStore = new CommentStore(this);
		await this.commentStore.loadComments();

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
			'message-square-quote',
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

		// 添加设置标签页
		this.addSettingTab(new AISettingTab(this.app, this));

		// 定期清理不存在文件的评论
		this.registerInterval(
			window.setInterval(async () => {
				const existingFiles = new Set(
					this.app.vault.getFiles().map(file => file.path)
				);
				await this.commentStore.cleanupComments(existingFiles);
			}, 24 * 60 * 60 * 1000) // 每天检查一次
		);

		// 监控评论加载性能
		const measureCommentPerformance = () => {
			const start = performance.now();
			
			// 评论加载操作		
			const end = performance.now();
		}

		// 添加打开对话窗口的命令
		this.addCommand({
			id: 'open-chat-window',
			name: t('Open AI chat window'),
			callback: () => {
				const chatView = ChatView.getInstance(this.app, this);
				chatView.show();
			}
		});

		// 添加切换评论面板的命令
		this.addCommand({
			id: 'toggle-comment-panel',
			name: t('Toggle comment panel'),
			callback: async () => {
				const { workspace } = this.app;
				const existing = workspace.getLeavesOfType(VIEW_TYPE_COMMENT);
				
				if (existing.length) {
					// 如果面板已打开，关闭它
					existing.forEach(leaf => leaf.detach());
				} else {
					// 如果面板未打开，在右侧打开它
					const leaf = workspace.getRightLeaf(false);
					if (leaf) {
						await leaf.setViewState({
							type: VIEW_TYPE_COMMENT,
							active: true,
						});
					}
				}
			},
		});

		// 添加切换评论面板位置的命令
		this.addCommand({
			id: 'toggle-comment-panel-location',
			name: t('Toggle comment panel location'),
			callback: async () => {
				const { workspace } = this.app;
				const existing = workspace.getLeavesOfType(VIEW_TYPE_COMMENT);
				
				if (existing.length) {
					const currentLeaf = existing[0];
					// 检查面板是否在右侧侧边栏
					const isInSidebar = currentLeaf.getRoot() === workspace.rightSplit;
					
					// 保存当前状态
					const state = currentLeaf.getViewState();
					
					// 移除当前面板
					currentLeaf.detach();
					
					// 在新位置创建面板
					let newLeaf;
					if (isInSidebar) {
						// 如果在侧边栏，移到主区域
						newLeaf = workspace.getLeaf('split');
					} else {
						// 如果在主区域，移到侧边栏
						newLeaf = workspace.getRightLeaf(false);
					}
					
					// 恢复状态
					if (newLeaf) {
						await newLeaf.setViewState(state);
					}
				} else {
					// 如果面板未打开，在右侧打开它
					const leaf = workspace.getRightLeaf(false);
					if (leaf) {
						await leaf.setViewState({
							type: VIEW_TYPE_COMMENT,
							active: true,
						});
					}
				}
			},
		});
	}

	onunload() {
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
                    baseUrl: loadedData.ai.anthropic.baseUrl
                };
            }
            if (loadedData.ai.gemini && this.settings.ai.gemini) {
                this.settings.ai.gemini = {
                    apiKey: loadedData.ai.gemini.apiKey || this.settings.ai.gemini.apiKey,
                    model: loadedData.ai.gemini.model || this.settings.ai.gemini.model,
                    baseUrl: loadedData.ai.gemini.baseUrl
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
        if (loadedData?.fileComments) {
            this.settings.fileComments = loadedData.fileComments;
        }

        await this.saveSettings();
    }

    async saveSettings() {
        // 确保所有必要的对象都存在
        if (!this.settings.ai) {
            this.settings.ai = { ...DEFAULT_SETTINGS.ai };
        }
        
        // 确保每个服务提供商的设置都存在并且有必需的字段
        if (!this.settings.ai.openai) {
            this.settings.ai.openai = {
                apiKey: '',  // 提供默认值
                model: 'gpt-4',  // 提供默认值
                baseUrl: DEFAULT_SETTINGS.ai.openai?.baseUrl
            };
        }
        if (!this.settings.ai.anthropic) {
            this.settings.ai.anthropic = {
                apiKey: '',  // 提供默认值
                model: 'claude-2',  // 提供默认值
                availableModels: DEFAULT_SETTINGS.ai.anthropic?.availableModels,
                baseUrl: DEFAULT_SETTINGS.ai.anthropic?.baseUrl
            };
        }
        if (!this.settings.ai.gemini) {
            this.settings.ai.gemini = {
                apiKey: '',  // 提供默认值
                model: 'gemini-pro',  // 提供默认值
                baseUrl: DEFAULT_SETTINGS.ai.gemini?.baseUrl
            };
        }
        if (!this.settings.ai.ollama) {
            this.settings.ai.ollama = {
                host: 'http://localhost:11434',  // 提供默认值
                model: 'qwen2.5:14b',  // 提供默认值
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

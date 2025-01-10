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

		// 添加导出样式,这段代码好像没用，我删除之后导出依然可用
		// const styleEl = document.createElement('style');
		// styleEl.id = 'highlight-export-styles';
		// try {
		// 	const response = await fetch(`app://local/${this.manifest.dir}/src/templates/styles.css`);
		// 	styleEl.textContent = await response.text();
		// } catch (error) {
		// 	console.error('Failed to load export styles:', error);
		// }
		// document.head.appendChild(styleEl);

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
        
        // 深度合并函数
        const deepMerge = <T extends object>(target: T, source: Partial<T>): T => {
            if (!source) return target;
            const merged = { ...target };
            for (const key in source) {
                if (source[key] instanceof Object && target[key] instanceof Object) {
                    merged[key] = deepMerge(target[key] as object, source[key] as object) as any;
                } else if (source[key] !== undefined && source[key] !== null) {
                    merged[key] = source[key];
                }
            }
            return merged;
        };

        // 如果有已保存的数据，使用它；否则使用默认设置
        if (loadedData && loadedData.ai) {
            this.settings = deepMerge<PluginSettings>(DEFAULT_SETTINGS, loadedData);
        } else {
            this.settings = { ...DEFAULT_SETTINGS };
        }

        // 确保基本结构存在
        if (!this.settings.ai) {
            this.settings.ai = { ...DEFAULT_SETTINGS.ai };
        }

        // 确保所有服务的设置结构存在，但保留现有值
        const services = ['openai', 'anthropic', 'gemini', 'ollama'] as const;
        type ServiceKey = typeof services[number];
        
        for (const service of services) {
            const key = service as ServiceKey;
            const defaultValue = DEFAULT_SETTINGS.ai[key];
            if (defaultValue) {
                this.settings.ai = {
                    ...this.settings.ai,
                    [key]: this.settings.ai[key] || { ...defaultValue }
                };
            }
        }

        // 确保 prompts 对象存在，但保留现有的提示词
        if (!this.settings.ai.prompts) {
            this.settings.ai.prompts = { ...DEFAULT_SETTINGS.ai.prompts };
        }

        // 如果没有选择 provider，使用默认值
        if (!this.settings.ai.provider) {
            this.settings.ai.provider = DEFAULT_SETTINGS.ai.provider;
        }

        // 保存合并后的设置
        await this.saveSettings();
    }

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

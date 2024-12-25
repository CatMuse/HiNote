import { App, Plugin } from 'obsidian';
import { CommentView, VIEW_TYPE_COMMENT } from './src/CommentView';
import { CommentStore } from './src/CommentStore';
import { HighlightDecorator } from './src/HighlightDecorator';
import { AISettingTab } from './src/settings/SettingTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';
import html2canvas from 'html2canvas';
import { ChatView } from './src/components/ChatView';

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
			'Highlight Comment',
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
			console.log(`Comments loaded in ${end - start}ms`);
		}

		// 添加打开对话窗口的命令
		this.addCommand({
			id: 'open-chat-window',
			name: '打开 AI 对话窗口',
			callback: () => {
				const chatView = ChatView.getInstance(this.app, this);
				chatView.show();
			}
		});
	}

	onunload() {
		// 清理视图
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_COMMENT);

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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		
		// Ensure AI settings exist
		if (!this.settings.ai) {
			this.settings.ai = DEFAULT_SETTINGS.ai;
		}

		// Initialize or update Ollama settings with default values
		this.settings.ai.ollama = {
			host: this.settings.ai.ollama?.host || 'http://localhost:11434',
			model: this.settings.ai.ollama?.model || 'qwen2.5:14b'
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

import { App, Plugin } from 'obsidian';
import { CommentView, VIEW_TYPE_COMMENT } from './src/CommentView';
import { CommentStore } from './src/CommentStore';
import { HighlightDecorator } from './src/HighlightDecorator';
import { AISettingTab } from './src/settings/SettingTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/types';
import html2canvas from 'html2canvas';

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
			'message-square',
			'打开评论面板',
			async () => {
				const { workspace } = this.app;
				
				// 检查评论面板是否已经打开
				const existing = workspace.getLeavesOfType(VIEW_TYPE_COMMENT);
				if (existing.length) {
					// 如果已经打开，就激活它
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
			}, 60 * 60 * 1000) // 每小时检查一次
		);
	}

	onunload() {
		// 清理视图
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_COMMENT);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

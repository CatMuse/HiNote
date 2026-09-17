import { t } from './src/i18n';
import { Plugin, Notice } from 'obsidian';
import { AISettingTab } from './src/settings/SettingsTab';
import { PluginSettings } from './src/types/settings';
import { InitializationManager } from './src/services/InitializationManager';
import { WindowManager } from './src/plugin/WindowManager';
import type { PluginServices } from './src/plugin/PluginServices';
import { migrateSettings, normalizeSettings, hasLegacyApiKeys } from './src/settings/SettingsMigration';
import {
	createPluginWindowManager,
	registerPluginCommands,
	registerPluginRibbon,
	registerPluginVaultEvents,
	registerPluginViews
} from './src/plugin/PluginBootstrap';

export default class CommentPlugin extends Plugin {
	settings: PluginSettings;
	private initManager: InitializationManager;
	private windowManager: WindowManager;

	// 公开服务实例供外部访问
	get services(): PluginServices | null { return this.initManager.currentServices; }
	get highlightDecorator() { return this.requireInitializedServices().highlightDecorator; }
	get fsrsManager() { return this.requireInitializedServices().fsrsManager; }
	get eventManager() { return this.requireInitializedServices().eventManager; }
	get highlightService() { return this.requireInitializedServices().highlightService; }
	get dataManager() { return this.requireInitializedServices().dataManager; }
	get canvasService() { return this.requireInitializedServices().canvasService; }
	
	// 架构层实例
	get highlightRepository() { return this.requireInitializedServices().highlightRepository; }
	get highlightManager() { return this.requireInitializedServices().highlightManager; }

	requireInitializedServices(): PluginServices {
		const services = this.initManager.currentServices;
		if (!services) {
			throw new Error('HiNote services have not been initialized.');
		}
		return services;
	}

	async ensureServicesInitialized(): Promise<PluginServices> {
		return this.initManager.ensureInitialized();
	}

	async onload() {
		// 加载设置
		const loadedData = await this.loadData();
		this.settings = migrateSettings(loadedData);
		if (hasLegacyApiKeys(loadedData?.ai)) {
			await this.saveData(this.settings);
			new Notice(t('HiNote now uses Keychain. Previous API keys were removed from settings. Please configure your AI keys again on this device.'), 12000);
		}

		// 初始化管理器
		this.initManager = new InitializationManager(this);
		this.windowManager = createPluginWindowManager(this);

		registerPluginViews(this);
		registerPluginRibbon(this, this.windowManager);
		registerPluginCommands(this, this.windowManager);

		// 添加设置标签页
		this.addSettingTab(new AISettingTab(this.app, this));

		registerPluginVaultEvents(this);
	}


	onunload() {
		// 清理初始化管理器
		if (this.initManager) {
			void this.initManager.cleanup().catch(error => console.error('[HiNote] Cleanup failed:', error));
		}
	}

	async saveSettings() {
		const existingData = await this.loadData();
		this.settings = normalizeSettings(this.settings, existingData);
		await this.saveData(this.settings);
        const services = this.initManager?.currentServices;
        if (services && (existingData?.excludePatterns || '') !== (this.settings.excludePatterns || '')) {
            services.highlightService.invalidateExclusions();
            services.eventManager.emitExclusionsChanged();
        }
	}
}

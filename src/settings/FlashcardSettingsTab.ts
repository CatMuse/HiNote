import { Setting, Notice } from 'obsidian';
import { t } from '../i18n';
import { FSRSService } from '../services/FSRSService';
import { DailyStats } from '../types/FSRSTypes';

export class FlashcardSettingsTab {
    private plugin: any;
    private containerEl: HTMLElement;
    private fsrsService: FSRSService;

    constructor(plugin: any, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
        this.fsrsService = plugin.fsrsManager.fsrsService;
    }

    display(): void {
        const container = this.containerEl.createEl('div', {
            cls: 'flashcard-settings-container'
        });

        new Setting(container)
            .setName(t('Flashcard learning'))
            .setHeading();

        // 每日新卡片学习上限
        new Setting(container)
            .setName(t('New cards per day'))
            .setDesc(t('Maximum number of new cards to learn each day'))
            .addSlider(slider => {
                const params = this.fsrsService.getParameters();
                slider
                    .setLimits(1, 200, 1)
                    .setValue(params.newCardsPerDay)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.newCardsPerDay = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.saveSettings();
                    });
                
                // 添加数值显示
                const valueDisplay = createEl('span', {
                    cls: 'slider-value',
                    text: String(params.newCardsPerDay)
                });
                
                slider.sliderEl.parentElement?.appendChild(valueDisplay);
                
                slider.sliderEl.addEventListener('input', () => {
                    valueDisplay.textContent = String(slider.getValue());
                });
            });

        // 每日复习卡片上限
        new Setting(container)
            .setName(t('Reviews per day'))
            .setDesc(t('Maximum number of cards to review each day'))
            .addSlider(slider => {
                const params = this.fsrsService.getParameters();
                slider
                    .setLimits(10, 500, 10)
                    .setValue(params.reviewsPerDay)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.reviewsPerDay = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.saveSettings();
                    });
                
                // 添加数值显示
                const valueDisplay = createEl('span', {
                    cls: 'slider-value',
                    text: String(params.reviewsPerDay)
                });
                
                slider.sliderEl.parentElement?.appendChild(valueDisplay);
                
                slider.sliderEl.addEventListener('input', () => {
                    valueDisplay.textContent = String(slider.getValue());
                });
            });

        // 目标记忆保持率
        new Setting(container)
            .setName(t('Target retention'))
            .setDesc(t('Target memory retention rate (0.8 = 80%)'))
            .addSlider(slider => {
                const params = this.fsrsService.getParameters();
                slider
                    .setLimits(0.7, 0.95, 0.01)
                    .setValue(params.request_retention)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.request_retention = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.saveSettings();
                    });
                
                // 添加数值显示
                const valueDisplay = createEl('span', {
                    cls: 'slider-value',
                    text: `${Math.round(params.request_retention * 100)}%`
                });
                
                slider.sliderEl.parentElement?.appendChild(valueDisplay);
                
                slider.sliderEl.addEventListener('input', () => {
                    valueDisplay.textContent = `${Math.round(slider.getValue() * 100)}%`;
                });
            });

        // 最大间隔天数
        new Setting(container)
            .setName(t('Maximum interval'))
            .setDesc(t('Maximum interval in days between reviews'))
            .addSlider(slider => {
                const params = this.fsrsService.getParameters();
                slider
                    .setLimits(365, 3650, 365)
                    .setValue(params.maximum_interval)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.maximum_interval = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.saveSettings();
                    });
                
                // 添加数值显示
                const valueDisplay = createEl('span', {
                    cls: 'slider-value',
                    text: `${params.maximum_interval} ${t('days')}`
                });
                
                slider.sliderEl.parentElement?.appendChild(valueDisplay);
                
                slider.sliderEl.addEventListener('input', () => {
                    valueDisplay.textContent = `${slider.getValue()} ${t('days')}`;
                });
            });

        // 重置学习统计
        new Setting(container)
            .setName(t('Reset daily stats'))
            .setDesc(t('Reset today\'s learning statistics'))
            .addButton(button => button
                .setButtonText(t('Reset'))
                .onClick(async () => {
                    // 重置今天的学习统计
                    const todayTimestamp = new Date();
                    todayTimestamp.setHours(0, 0, 0, 0);
                    
                    // 找到并移除今天的统计数据
                    const dailyStats = this.plugin.fsrsManager.storage.dailyStats;
                    const todayStatsIndex = dailyStats.findIndex(
                        (stats: DailyStats) => stats.date === todayTimestamp.getTime()
                    );
                    
                    if (todayStatsIndex >= 0) {
                        dailyStats.splice(todayStatsIndex, 1);
                        await this.plugin.fsrsManager.saveStorage();
                        new Notice(t('Daily statistics have been reset'));
                    } else {
                        new Notice(t('No statistics to reset for today'));
                    }
                }));

        // 添加高级设置标题
        new Setting(container)
            .setName(t('Advanced'))
            .setHeading();
        
        // 添加高级设置说明
        container.createEl('p', { 
            text: t('These settings control the FSRS algorithm parameters. Only change them if you understand the algorithm.'),
            cls: 'setting-item-description'
        });
        
        // 添加一个重置为默认值的按钮
        new Setting(container)
            .setName(t('Reset algorithm parameters'))
            .setDesc(t('Reset the FSRS algorithm parameters to default values'))
            .addButton(button => button
                .setButtonText(t('Reset to default'))
                .onClick(async () => {
                    // 重置 FSRS 参数
                    this.fsrsService.resetParameters();
                    await this.plugin.saveSettings();
                    // 刷新设置页面
                    this.display();
                    new Notice(t('FSRS parameters have been reset to default values'));
                }));
    }
}

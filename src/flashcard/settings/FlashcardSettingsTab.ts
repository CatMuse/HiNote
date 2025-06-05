import { Setting, Notice } from 'obsidian';
import { t } from '../../i18n';
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
            .addText(text => {
                const params = this.fsrsService.getParameters();
                text
                    .setValue(params.maximum_interval.toString())
                    .setPlaceholder('365')
                    .onChange(async (value) => {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue > 0) {
                            const params = this.fsrsService.getParameters();
                            params.maximum_interval = numValue;
                            this.fsrsService.setParameters(params);
                            await this.plugin.saveSettings();
                        }
                    });
                
                // 设置输入框样式和后缀
                const inputEl = text.inputEl;
                inputEl.type = 'number';
                inputEl.min = '1';
                inputEl.style.width = '80px';
                
                // 添加天数后缀
                const suffixEl = createEl('span', {
                    text: ` ${t('days')}`,
                    cls: 'setting-item-suffix'
                });
                
                inputEl.after(suffixEl);
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
                    
                    // 获取重置后的参数
                    const params = this.fsrsService.getParameters();
                    
                    // 更新目标保持率滑动条
                    const retentionSlider = this.containerEl.querySelector('.setting-item:nth-child(4) .slider') as HTMLInputElement;
                    const retentionValue = this.containerEl.querySelector('.setting-item:nth-child(4) .slider-value') as HTMLElement;
                    if (retentionSlider && retentionValue) {
                        retentionSlider.value = String(params.request_retention);
                        retentionValue.textContent = `${Math.round(params.request_retention * 100)}%`;
                    }
                    
                    // 更新最大间隔输入框
                    const maxIntervalInput = this.containerEl.querySelector('.setting-item:nth-child(5) input[type="number"]') as HTMLInputElement;
                    if (maxIntervalInput) {
                        maxIntervalInput.value = String(params.maximum_interval);
                    }
                    
                    // 更新每日新卡片滑动条
                    const newCardsSlider = this.containerEl.querySelector('.setting-item:nth-child(2) .slider') as HTMLInputElement;
                    const newCardsValue = this.containerEl.querySelector('.setting-item:nth-child(2) .slider-value') as HTMLElement;
                    if (newCardsSlider && newCardsValue) {
                        newCardsSlider.value = String(params.newCardsPerDay);
                        newCardsValue.textContent = String(params.newCardsPerDay);
                    }
                    
                    // 更新每日复习卡片滑动条
                    const reviewsSlider = this.containerEl.querySelector('.setting-item:nth-child(3) .slider') as HTMLInputElement;
                    const reviewsValue = this.containerEl.querySelector('.setting-item:nth-child(3) .slider-value') as HTMLElement;
                    if (reviewsSlider && reviewsValue) {
                        reviewsSlider.value = String(params.reviewsPerDay);
                        reviewsValue.textContent = String(params.reviewsPerDay);
                    }
                    
                    // 更新 FSRS 权重参数文本区域
                    const textareaEl = this.containerEl.querySelector('.fsrs-weights-textarea') as HTMLTextAreaElement;
                    if (textareaEl) {
                        textareaEl.value = JSON.stringify(params.w);
                    }
                    
                    new Notice(t('FSRS parameters have been reset to default values'));
                }));

        // FSRS 算法参数编辑
        const fsrsParamsContainer = container.createEl('div', {
            cls: 'fsrs-params-container'
        });

        // 添加 FSRS 参数说明
        fsrsParamsContainer.createEl('p', {
            text: t('FSRS weight parameter. The default value is obtained from a smaller sample; if adjustment is needed, please use the FSRS optimizer for calculation.'),
            cls: 'setting-item-description'
        });

        // 获取当前参数
        const params = this.fsrsService.getParameters();
        const wParamsString = JSON.stringify(params.w);

        // 创建文本区域设置
        new Setting(fsrsParamsContainer)
            .setName(t('FSRS parameters'))
            .setDesc(t('Edit the 17 FSRS algorithm weights. Format: JSON array of numbers.'))
            .addTextArea(textarea => {
                textarea
                    .setValue(wParamsString)
                    .setPlaceholder('[0.4872, 1.4003, ...]')
                    .onChange(async (value) => {
                        try {
                            // 尝试解析用户输入的 JSON
                            const newParams = JSON.parse(value);
                            
                            // 验证参数是否有效（必须是 17 个数字的数组）
                            if (Array.isArray(newParams) && 
                                newParams.length === 17 && 
                                newParams.every(p => typeof p === 'number')) {
                                
                                // 更新参数
                                const currentParams = this.fsrsService.getParameters();
                                currentParams.w = newParams;
                                this.fsrsService.setParameters(currentParams);
                                await this.plugin.saveSettings();
                                
                                // 显示成功提示
                                new Notice(t('FSRS weights updated successfully'));
                            } else {
                                // 显示错误提示
                                new Notice(t('Invalid format. Must be an array of 17 numbers.'), 5000);
                            }
                        } catch (e) {
                            // JSON 解析错误
                            new Notice(t('Invalid JSON format. Please check your input.'), 5000);
                        }
                    });
                
                // 设置文本区域样式
                textarea.inputEl.rows = 2;
                textarea.inputEl.cols = 32;
                textarea.inputEl.addClass('fsrs-weights-textarea');
            });

        // 不再需要按钮容器和验证按钮
    }
}

import { Setting, Notice } from 'obsidian';
import { t } from '../../i18n';
import { FSRSService } from '../services';
import type CommentPlugin from '../../../main';

export class FlashcardSettingsTab {
    private plugin: CommentPlugin;
    private containerEl: HTMLElement;
    private fsrsService: FSRSService;

    constructor(plugin: CommentPlugin, containerEl: HTMLElement) {
        this.plugin = plugin;
        this.containerEl = containerEl;
        this.fsrsService = plugin.fsrsManager.fsrsService;
    }

    display(): void {
        const container = this.containerEl.createDiv({
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
                    .setLimits(0, 200, 1)
                    .setValue(params.newCardsPerDay)
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.newCardsPerDay = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.fsrsManager.saveStoragePublic();
                    });
                
                // 添加数值显示
                const valueDisplay = createSpan({
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
                    .setLimits(0, 500, 10)
                    .setValue(params.reviewsPerDay)
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.reviewsPerDay = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.fsrsManager.saveStoragePublic();
                    });
                
                // 添加数值显示
                const valueDisplay = createSpan({
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
                    .onChange(async (value) => {
                        const params = this.fsrsService.getParameters();
                        params.request_retention = value;
                        this.fsrsService.setParameters(params);
                        await this.plugin.fsrsManager.saveStoragePublic();
                    });
                
                // 添加数值显示
                const valueDisplay = createSpan({
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
                            await this.plugin.fsrsManager.saveStoragePublic();
                        }
                    });
                
                // 设置输入框样式和后缀
                const inputEl = text.inputEl;
                inputEl.type = 'number';
                inputEl.min = '1';
                inputEl.setCssProps({ width: '80px' });
                
                // 添加天数后缀
                const suffixEl = createSpan({
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
                    const wasReset = await this.plugin.fsrsManager.resetTodayStats();
                    if (wasReset) {
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
                    await this.plugin.fsrsManager.saveStoragePublic();
                    
                    container.remove();
                    this.display();

                    new Notice(t('FSRS parameters have been reset to default values'));
                }));

        // FSRS 算法参数编辑
        const fsrsParamsContainer = container.createDiv({
            cls: 'fsrs-params-container'
        });

        // 添加 FSRS 参数说明
        fsrsParamsContainer.createEl('p', {
            text: t('Uses the FSRS-6 default weights. Custom weights are adjusted to valid ranges. Changes apply to future reviews without rescheduling existing cards.'),
            cls: 'setting-item-description'
        });

        // 获取当前参数
        const params = this.fsrsService.getParameters();
        const wParamsString = JSON.stringify(params.w);

        // 创建文本区域设置
        new Setting(fsrsParamsContainer)
            .setName(t('FSRS parameters'))
            .setDesc(t('Edit the 21 FSRS algorithm weights. Format: JSON array of numbers.'))
            .addTextArea(textarea => {
                textarea
                    .setValue(wParamsString)
                    .setPlaceholder(wParamsString)
                    .onChange(async (value) => {
                        try {
                            // 尝试解析用户输入的 JSON
                            const newParams = JSON.parse(value);
                            
                            // 验证参数是否有效（必须是 21 个数字的数组）
                            if (Array.isArray(newParams) && 
                                newParams.length === 21 && 
                                newParams.every(Number.isFinite)) {
                                
                                // 更新参数
                                const currentParams = this.fsrsService.getParameters();
                                currentParams.w = newParams;
                                this.fsrsService.setParameters(currentParams);
                                await this.plugin.fsrsManager.saveStoragePublic();
                                
                                textarea.setValue(JSON.stringify(this.fsrsService.getParameters().w));
                                // 显示成功提示
                                new Notice(t('FSRS weights updated successfully'));
                            } else {
                                // 显示错误提示
                                new Notice(t('Invalid format. Must be an array of 21 numbers.'), 5000);
                            }
                        } catch {
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

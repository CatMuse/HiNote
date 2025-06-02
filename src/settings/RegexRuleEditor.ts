import { Setting, ButtonComponent, TextComponent, ToggleComponent, setIcon } from 'obsidian';
import { RegexRule } from '../types';
import { t } from '../i18n';

/**
 * 正则表达式规则编辑器组件
 * 用于管理高亮匹配的正则表达式规则列表
 */
export class RegexRuleEditor {
  private containerEl: HTMLElement;
  private plugin: any;
  private rules: RegexRule[];
  private rulesContainer: HTMLElement;

  constructor(containerEl: HTMLElement, plugin: any) {
    this.containerEl = containerEl;
    this.plugin = plugin;
    this.rules = plugin.settings.regexRules || [];
    this.rulesContainer = containerEl.createDiv({ cls: 'regex-rules-container' });
    
    // 样式已移动到全局 styles.css 文件中
    this.display();
  }
  
  // 样式已移动到全局 styles.css 文件中
  
  /**
   * 显示规则列表
   */
  private display() {
    this.rulesContainer.empty();
    
    // 添加警告提示和示例
    const warningEl = this.rulesContainer.createDiv({ cls: 'regex-rule-warning' });
    warningEl.innerHTML = t('Use regex with caution. If there are capture groups (), the first capture group will be used as the highlight text; if there are no capture groups, the entire match will be used.')
    
    // 显示现有规则
    if (this.rules.length === 0) {
      const emptyEl = this.rulesContainer.createDiv();
      emptyEl.setText(t('No custom regex rules. Click "+" to add a new rule.'));
    } else {
      this.rules.forEach((rule, index) => {
        this.createRuleItem(rule, index);
      });
    }
    
    // 添加新规则按钮
    const addButton = this.rulesContainer.createDiv({ cls: 'regex-rule-add' });
    
    // 添加加号图标和文本
    const textSpan = addButton.createSpan({ cls: 'regex-rule-add-text' });
    textSpan.setText(t('Add new rule'));
    
    // 添加点击事件
    addButton.addEventListener('click', () => {
      const newRule: RegexRule = {
        id: `rule-${Date.now()}`,
        name: '',
        pattern: '',
        color: '#ffeb3b', // 使用固定的默认黄色
        enabled: true
      };
      
      this.rules.push(newRule);
      this.saveRules();
      this.display(); // 重新渲染整个列表
    });
  }
  
  /**
   * 创建单个规则项
   * @param rule 规则对象
   * @param index 规则索引
   */
  private createRuleItem(rule: RegexRule, index: number) {
    const ruleContainer = this.rulesContainer.createDiv({ cls: 'regex-rule-item' });
    
    // 名称输入框
    const nameInput = new TextComponent(ruleContainer);
    nameInput.setPlaceholder(t('Rule name'));
    nameInput.setValue(rule.name);
    nameInput.onChange(value => {
      rule.name = value;
      this.saveRules();
    });
    
    // 正则表达式输入框
    const patternInput = new TextComponent(ruleContainer);
    patternInput.setPlaceholder(t('Regular expression with capture groups'));
    patternInput.setValue(rule.pattern);
    patternInput.onChange(value => {
      rule.pattern = value;
      this.saveRules();
    });
    
    // 颜色文本输入框
    const colorContainer = ruleContainer.createDiv();
    const colorInput = new TextComponent(colorContainer);
    colorInput.setPlaceholder('#ffeb3b');
    colorInput.setValue(rule.color);
    colorInput.inputEl.addClass('color-input'); // 使用CSS类替代内联样式
    colorInput.onChange(value => {
      // 确保颜色值有效
      const colorValue = value.trim();
      if (colorValue && (colorValue.startsWith('#') || colorValue.startsWith('rgb') || colorValue.startsWith('rgba'))) {
        rule.color = colorValue;
        this.saveRules();
      }
    });
    
    // 删除图标
    const deleteContainer = ruleContainer.createDiv({ cls: 'regex-rule-delete' });
    setIcon(deleteContainer, 'trash-2'); // 使用 Obsidian 的 trash-2 图标
    deleteContainer.setAttr('aria-label', t('Delete rule'));
    deleteContainer.addEventListener('click', () => {
      this.rules.splice(index, 1);
      this.saveRules();
      this.display(); // 重新渲染整个列表
    });
    
    // 启用/禁用开关 - 直接添加到规则容器中，不使用额外的div
    const toggle = new ToggleComponent(ruleContainer);
    toggle.setValue(rule.enabled);
    toggle.onChange(value => {
      rule.enabled = value;
      this.saveRules();
    });
    // 为开关添加类名，便于CSS选择器定位
    toggle.toggleEl.addClass('regex-rule-toggle');
  }
  
  /**
   * 保存规则到插件设置
   */
  private async saveRules() {
    this.plugin.settings.regexRules = this.rules;
    await this.plugin.saveSettings();
  }
}

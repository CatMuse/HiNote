# HiNote 0.5.9

## 中文

本次更新新增 Obsidian 原生高亮颜色支持，重新整理设置界面，并修复移动端操作按钮、输入法评论提交和数据保存相关问题。

### 兼容性

- 最低支持版本提高至 **Obsidian 1.13.0**，升级 HiNote 前请确认 Obsidian 版本。
- Obsidian 的原生高亮颜色菜单和编辑器交互需要 **Obsidian 1.14**；HiNote 在 1.13 中仍可识别带颜色标记的高亮文本。

### 新增与优化

- 支持 `==🔴高亮内容==` 等原生颜色高亮，识别红、橙、黄、绿、蓝、紫色圆形及对应方形标记。卡片颜色跟随主题，显示和导出的正文不包含颜色标记，修改颜色保留关联评论。
- 设置改为单页平铺的高亮、AI 服务、HiCard 三个独立卡片分区，保留 Obsidian 设置搜索。
- 统一设置标题、边距、说明和控件布局，优化窄屏显示，为新增 Prompt 表单添加卡片背景。
- 降低侧边栏高亮装饰线的不透明度，使颜色更柔和。

### 修复

- 修复移动端搜索栏右侧操作按钮不可见、无法找到导出入口的问题。保留搜索聚焦时输入框全宽显示的交互，可通过完成按钮退出搜索聚焦，恢复操作按钮；桌面也可使用 Escape。
- 修复中日韩输入法确认候选词时意外提交评论，以及空评论保存和删除最后一条评论的处理问题。
- 改进颜色高亮的定位、预览、导出和移除逻辑，减少相同文本之间的错误匹配。
- 修复设置卡片空白处出现多余悬浮提示的问题，使用 Obsidian 原生设置标题组件。

### 稳定性与数据保护

- 新增高亮记录使用独立存储标识，保留现有数据映射兼容性，并加强文件重命名、初始化和并发读写处理。
- 覆盖已有高亮、闪卡和映射数据前保留上一份内容至 `.bak` 文件；遇到无法读取或无效的数据时停止相关操作，避免用空数据覆盖。
- 改进闪卡保存队列与卸载时的保存处理，修复可匹配空文本的正则规则可能导致处理无法结束的问题。
- 清理冗余代码和未使用依赖，更新相关依赖，调整 DOM、计时器和 CSS 写法以处理本轮 Obsidian 审查反馈。

`.bak` 仅保留上一份内容，不能代替仓库备份。

## English

This update adds native Obsidian highlight color support, reorganizes settings, and fixes mobile controls, IME comment submission, and data-saving issues.

### Compatibility

- **Obsidian 1.13.0 or later is now required.** Update Obsidian before upgrading HiNote if necessary.
- Native highlight color menus and editor interactions require **Obsidian 1.14**. HiNote can still recognize color-marked highlights on 1.13.

### New and improved

- Recognize native color highlights such as `==🔴Highlighted text==`, including red, orange, yellow, green, blue, and purple circles and matching squares. Cards follow theme colors, displayed and exported text omits color markers, and recoloring preserves comments.
- Organize settings into three distinct cards on one page: Highlight, AI service, and HiCard. Obsidian settings search remains available.
- Improve spacing, headings, descriptions, narrow-screen layouts, and the new Prompt form background.
- Soften sidebar highlight decoration colors with reduced opacity.

### Fixes

- Restore mobile search toolbar actions, including the export entry point. Search still expands to full width while focused; the finish button restores toolbar actions, and desktop users can also press Escape.
- Prevent CJK IME candidate confirmation from accidentally submitting comments, and improve empty-comment and last-comment deletion handling.
- Improve matching, preview, export, and removal of colored highlights, including duplicate text handling.
- Remove unintended settings-card tooltips and use native Obsidian setting headings.

### Reliability and data protection

- Use independent storage identifiers for new highlight records while retaining existing mappings. Improve rename handling, initialization, and concurrent storage operations.
- Keep the previous contents of existing highlight, flashcard, and mapping files in sibling `.bak` files before replacement. Stop affected operations on unreadable or invalid data instead of overwriting it with an empty library.
- Improve flashcard save queuing and unload flushing, and prevent non-terminating extraction from regex rules that match empty text.
- Remove redundant code and unused dependencies, update related dependencies, and address this review round's DOM, timer, and CSS feedback.

Each `.bak` file retains only one previous version and does not replace vault backups.

# HiNote 0.6.0

本次加入官方彩色高亮识别，以及划词高亮与批注工具栏，继续保留 0.5.9 的评论和数据保存修复。

## 彩色高亮

- 识别 `==🔴文字==`、`==🟠文字==`、`==🟡文字==`、`==🟢文字==`、`==🔵文字==`、`==🟣文字==`，兼容对应方形标记。
- 颜色标记必须紧接开头的 `==`；正文内的其他 emoji 保留为正文。卡片色条使用对应主题颜色。
- 评论匹配、显示、复制和导出使用去除格式色标后的正文；定位、块引用和删除仍使用完整的原文范围。
- 兼容旧版本将颜色 emoji 存入正文的记录，尽量保留原有记录 ID、评论和闪卡关联。
- 支持单字高亮，避免相邻同文本高亮被错误合并；阅读模式按颜色和段落匹配批注。
- 兼容 HTML 高亮颜色读取；HTML 正文中的 emoji 不作为 Markdown 颜色标记处理。

## 划词工具栏

- 在编辑器中选中单行文字，提供默认高亮、红、橙、绿、蓝、紫色，以及批注、复制和删除操作。
- 对已有 Markdown 高亮选中文字或点击高亮，可修改颜色、添加批注或删除。
- 直接批注普通选区时先创建默认高亮；取消空批注时，若原文未再变化，则撤销自动创建的高亮。
- 浮动批注复用已有评论输入、输入法保护和已配置的 Tab AI 功能；本次没有变更 AI 配置或引入额外自动 AI 请求。
- 支持阅读模式中能明确定位到原文的选区；重复文本无法确定归属时不修改原文。
- 不支持跨行、跨多个高亮、代码块和行内代码中的划词高亮。
- 写入时检查原文快照；异步返回、关闭插件或笔记发生变化后，过期选区不能覆盖新内容。

## 数据与兼容性

- 最低版本保持 Obsidian 1.8.0。官方彩色高亮的原生显示和编辑菜单需要 Obsidian 1.14；旧版本仍可由 HiNote 识别格式标记，但编辑器原生显示由 Obsidian 版本决定。
- 沿用 `.hinote` v2 格式，不重置评论、卡片或复习记录。
- 颜色和位置元数据写入排队合并到最新记录，保留评论及其更新时间，避免晚到的更新覆盖评论或恢复已删除记录。
- 本次未引入收藏入口、卡片调色面板、批量改色、新版主视图、Keychain 升级或独立 HiCard 工作区。

官方语法依据：[Obsidian Basic formatting syntax](https://obsidian.md/help/syntax)。

## 验证

- `npm test`：评论回归、存储安全、12 种颜色标记、旧记录匹配、颜色转换、定位、预览、导出、删除，以及编辑／阅读模式选区写入、过期快照、批注取消回退和卸载。
- `npm run build`：TypeScript 检查与生产构建。
- 对本批新增和修改的 TypeScript 文件运行 ESLint；`git diff --check`。
- 对本地 `.hinote` 备份进行只读加载和内存往返验证，不在真实数据上试评分或删除评论。
- 仍需用户验收：中文输入法、桌面实际划词／弹窗位置、多窗口及移动端操作。本次自动测试不能替代这些实机验收。

建议依次验证：新增红／蓝高亮 → 检查侧边栏颜色和正文 → 选取普通文字并选色 → 添加批注 → 改色后确认批注仍在 → 取消空批注 → 重启确认记录保存。

## English

Recognize native Obsidian highlight color markers, display matching card accents, and omit formatting markers from displayed and exported text while retaining source spans and legacy comments. A selection toolbar adds highlighting, recoloring, annotations, copying, and deletion in editable Markdown and unambiguous Reading view selections. Stale source snapshots cannot overwrite later edits. Cancelling an empty annotation restores its automatically inserted highlight when the source is unchanged.

Obsidian 1.8.0 remains the minimum plugin version; native colored-highlight rendering and menus require Obsidian 1.14. The v2 storage format, AI configuration, and HiCard workflow remain compatible. Multi-window, mobile, and full desktop manual acceptance checks are still required.

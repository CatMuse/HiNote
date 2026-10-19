# HiNote 0.6.0

本版本带来独立 HiCard 工作区、彩色高亮与划词工具栏，并完善批注、AI 设置和数据保存。

## 升级前

- 最低支持版本从 Obsidian 1.8.0 提高到 **1.14.0**。
- **AI 密钥改用 Obsidian Keychain，不会自动迁移旧密钥。** 首次加载会移除插件设置中的旧 API key 字段。升级前请保留所需密钥，升级后在每台设备重新选择或创建 Keychain 密钥。
- 其他 AI 设置、Prompt、高亮和评论保留；无需身份验证的 Ollama 不需要配置密钥。历史备份与同步历史中的明文副本不会自动删除。
- 建议先备份知识库和插件配置；`.bak` 只保留上一份内容，不能代替完整备份。

## 高亮与批注

- 识别官方六色高亮及对应方形标记，颜色跟随主题，正文、复制和导出不包含格式色标。
- 点击卡片装饰色条打开调色面板；支持键盘操作，以及多选卡片后批量改色。
- Default 与 Yellow 独立：Default 跟随主题默认高亮色，Yellow 写入明确的黄色标记；默认色选中外圈使用柔和的主题边框色。
- 改色原位刷新，保留卡片、选中状态与评论输入；原文变化或无法确认来源时拒绝按旧位置修改。
- 编辑器划词工具栏支持高亮、选色、批注、复制和删除；支持可明确定位的阅读模式选区。
- 添加高亮收藏、批量收藏和收藏集合。
- 重整搜索、筛选、排序和文件评论工具栏；改善文件列表键盘导航、加载反馈及旧异步结果隔离。
- 保留视图会话中的评论草稿，完善文件评论上下文、浮层、复制及评论与闪卡同步。

## AI 与设置

- 支持手动输入模型 ID、主动刷新列表及搜索选择，刷新失败不会替换已选模型。
- 自定义服务明确选择 OpenAI Chat Completions、Anthropic Messages 或 Gemini GenerateContent 协议。
- 连接测试检查所选模型的真实文本响应，显示耗时和错误，不发送笔记内容；服务商可能计费。
- 请求等待上限 45 秒，忽略迟到结果；底层请求仍可能由服务商完成并计费，Ollama 不再自动重试生成请求。
- 设置使用卡片分区，接入 Obsidian 设置搜索；完善中英文覆盖，HiCard 学习设置移入独立工作区。

## HiCard

- 独立 HiCard 标签页及命令入口，包含今日、学习分组、卡片管理、统计和学习设置。
- HiCard 需激活 Pro 授权后使用，未激活时显示激活入口。
- 卡片搜索筛选、分组管理、批量操作、暂停与恢复，关联批注编辑同步到源高亮。
- 升级到 FSRS-6，完善参数兼容、每日限额、短期学习、到期入队和评分撤销。
- 评分和撤销在写盘成功后提交状态，保留并发修改的答案，改善多视图状态同步与统计。
- 沿用已有卡片、分组、历史和授权。旧无来源卡片保持编辑兼容，不提供新建无来源卡片。

## 数据与稳定性

- 保留旧记录 ID 和 `.hinote` v2 格式，区分扫描、视图与持久记录。
- 加强重复文本、上下文、文件重命名和不确定关联的处理，提供高亮关联检查。
- 高亮、闪卡与文件映射覆盖前保留 `.bak`，无效或不可读数据阻止相关保存。
- 统一事件通知与渲染失效处理，改善保存队列、卸载清理、排除规则缓存和正则空匹配处理。
- 保留 0.5.9 的输入法误提交、空评论、最后一条评论删除及数据保存修复。

智能高亮、关联推荐和实时上下文推荐已在开发分支中撤回；Custom study 已移除，不属于此次发布范围。

## 验证与验收

- `npm ci --ignore-scripts`。
- `npm run check`：全项目 ESLint、TypeScript／生产构建及自动测试。
- `git diff --check`。
- 仍需实机验收：划词及色条调色、批量改色保留输入状态、中文输入法、Keychain 重配与真实服务连接、旧卡片继续学习／撤销、窗口弹出和移动端操作。
- 自动测试使用模拟数据和服务，不代表真实 AI 服务、移动端或全部桌面交互已经验收。

## English

This release integrates the complete development branch, including native highlight colors, card and batch color palettes, the selection toolbar, favorites, navigation and comment improvements, searchable settings, Keychain credentials, model discovery and connection tests, and the standalone HiCard workspace with FSRS-6 scheduling and transactional review updates.

Obsidian 1.14.0 or later is required. Default and Yellow are separate color choices. HiCard requires an activated Pro license. Existing API keys are not migrated to Keychain: preserve the keys you need before upgrading, then configure a secret on each device. Legacy plaintext credential fields are removed from plugin settings on first load. Existing notes, comments, cards and review history remain compatible. Smart highlights, related recommendations, live context recommendations and Custom study are not included.

# HiNote 0.5.9

本次为评论与数据保存修复版本，最低支持 Obsidian 1.8.0。

- 修复中文、日文和韩文输入法确认候选词时误提交评论；组合输入期间不触发 Tab AI 操作。
- 空评论不写入存储；关闭空编辑框时恢复原评论。
- 删除普通高亮的最后一条评论后保留高亮卡片；删除文件评论的最后一条评论时移除对应虚拟卡片；保留仍有关联闪卡或已有收藏元数据的记录。
- 修复可匹配空文本的自定义正则规则导致提取无法结束。
- 高亮、闪卡和文件映射写入前保留上一份内容至同目录 `.bak` 文件；无效或无法读取的数据阻止相关保存。
- 新增高亮存储文件使用独立文件名，保留旧映射、记录 ID、评论及闪卡关联；重命名笔记保留物理存储文件。
- 对高亮读写与闪卡保存排队，等待数据加载完成后开放视图，并在卸载时提交待保存的闪卡修改。
- 清理分组弹窗及相关监听器，避免跨窗口关闭时遗留资源。

`.bak` 只保留上一份内容，不能代替知识库备份。无法确定归属的旧文件映射会停止加载，不会猜测或自动合并。

收藏和高亮格式元数据仅作兼容保留，本版本没有新增收藏入口、彩色高亮工具栏、AI 配置升级或独立 HiCard 工作区。AI 密钥配置方式和学习算法沿用 0.5.8。

## 自动检查

- `npm ci --ignore-scripts`
- `npm test`：组合输入、快捷键、空评论、最后一条评论删除、版本一致性，以及存储隔离、备份、损坏数据、并发读取、初始化、卸载保存和空匹配正则。
- `npm run build`：TypeScript 检查与生产构建。
- 对修改的 TypeScript 文件运行 ESLint；`git diff --check`。
- 可选：`npm run test:storage -- /absolute/path/to/backup/.hinote`，只读取快照，在内存中验证已有映射、高亮和闪卡往返。

## 本地使用验收

- [ ] 重新加载插件或重启 Obsidian，确认版本为 0.5.9。
- [ ] 中文输入法确认候选词后仍可继续输入；再次按 Enter 保存，Shift+Enter 换行。
- [ ] 新建空评论和清空已有评论后提交，检查原评论恢复与编辑框关闭。
- [ ] 分别删除普通高亮、文件评论、关联闪卡高亮的最后一条评论。
- [ ] 新增评论后重启，确认评论和关联仍在；重命名含评论的测试笔记，再次重启验证。
- [ ] 使用测试闪卡验证保存后重启；打开／关闭分组弹窗。
- [ ] 检查修改后对应数据旁的 `.bak` 文件。损坏数据验证仅在临时测试库进行。

尚未完成桌面完整交互与移动端实机验收；自动测试不代替这些验收。

## English

This maintenance update requires Obsidian 1.8.0 or later. It fixes IME comment submission, empty comment editors, last-comment deletion, and custom regular expressions that match empty text. It adds previous-version `.bak` files, blocks saving over unreadable or invalid data, preserves legacy storage mappings, serializes storage operations, and flushes pending flashcard saves on unload.

Existing development-version favorite and highlight-format metadata is retained for compatibility. The new favorite UI, color toolbar, AI configuration changes, and standalone HiCard workspace are deferred. API key configuration and the learning algorithm remain as in 0.5.8. Desktop and mobile manual acceptance checks remain pending.

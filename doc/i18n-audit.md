# HiNote 中英文支持审计

审计范围：当前工作区的 232 个业务 TypeScript 文件（src 中不含 i18n 的文件及 main.ts），并检查两份翻译表、CSS Style Settings 配置和日期/时间显示。静态 AST 扫描后人工核对；未逐页运行 Obsidian 中英文界面。

以下统计为修复前基线。本次已据此补齐翻译、修复参数插值和硬编码界面文案，并统一日期语言；新增自动检查，未逐页验收。统计是已确认项/静态扫描范围，不是完整界面覆盖率；变量传递、用户配置和外部服务错误需要结合调用链继续核验。

## 结论

- 349 处字面量 t() 调用，使用 273 个不同键。
- 92 个英文固定键缺少中文映射；另有 2 个中文固定键缺少英文映射。合计 94 个不同键、117 处调用（中文键在中文环境原文回退仍可读）。
- 17 处 t(插值模板) 把运行时变量拼进查找键，现有精确查表方式不能翻译这些动态消息。其他 15 处非字面量调用不是全部有问题：有些是已覆盖的条件分支、颜色标签或内置分组。
- 直接显示的硬编码、变量间接传入的文案、Style Settings 和时间格式另列，不与以上统计简单相加。
- en.ts 有 248 个键，zh.ts 有 298 个键；没有发现重复键。英文键不在 en.ts 中会回退为英文原文，因此不能据此判为缺英文翻译。

## 根本原因

当前 [src/i18n/index.ts:10](../src/i18n/index.ts#L10) 只提供 t(key)，使用 moment.locale() 区分 zh 开头语言与其他语言，查不到就返回 key。它没有参数插值，也没有缺失键校验。

大小写、标点、空格均参与精确匹配。例如调用 New cards per day: 后带空格，词典键却没有尾部空格；General 与 General Settings、Use custom rules 与 Use Custom Pattern 也无法自动对应。

## 修复优先级

1. 高频主界面：批注输入、卡片工具提示、更多菜单、主视图返回按钮、两个打开命令。
2. 批量操作和错误提示：改成固定模板键，翻译后替换参数；同时补中英文键。
3. HiCard：分组、学习统计、空状态、删除确认、FSRS 参数设置。
4. 设置、导出模板、Ollama 通知与加载/保存失败通知。
5. 内置默认名称、时间单位、日期语言及 Style Settings。

## 固定键缺失清单

英文文案列表示缺中文；中文文案列表示缺英文。相同键合并列出所有调用点。

| 文案键 | 缺失语言 | 位置 |
| --- | --- | --- |
| Open in right sidebar | 中文 | [src/commands/openCommentPanel.ts:27](../src/commands/openCommentPanel.ts#L27) |
| Open in main window | 中文 | [src/commands/openMainWindow.ts:27](../src/commands/openMainWindow.ts#L27) |
| AI comments added | 中文 | [src/components/AIButton.ts:160](../src/components/AIButton.ts#L160) |
| Submit | 中文 | [src/components/comment/CommentInputActionBar.ts:42](../src/components/comment/CommentInputActionBar.ts#L42) |
| Add comment... | 中文 | [src/components/comment/UnfocusedCommentInput.ts:29](../src/components/comment/UnfocusedCommentInput.ts#L29) |
| Jump to highlight | 中文 | [src/components/highlight/HighlightContent.ts:101](../src/components/highlight/HighlightContent.ts#L101) |
| Only HiNote Pro | 中文 | [src/components/highlight/card/FlashcardController.ts:34](../src/components/highlight/card/FlashcardController.ts#L34)、[src/views/selection/BatchFlashcardOperations.ts:26](../src/views/selection/BatchFlashcardOperations.ts#L26)、[src/views/selection/BatchOperationsHandler.ts:222](../src/views/selection/BatchOperationsHandler.ts#L222)、[src/views/selection/BatchOperationsHandler.ts:228](../src/views/selection/BatchOperationsHandler.ts#L228)、[src/views/selection/BatchOperationsHandler.ts:232](../src/views/selection/BatchOperationsHandler.ts#L232)、[src/views/selection/BatchOperationsHandler.ts:237](../src/views/selection/BatchOperationsHandler.ts#L237) |
| FSRS 管理器未初始化 | 英文 | [src/components/highlight/card/FlashcardController.ts:39](../src/components/highlight/card/FlashcardController.ts#L39)、[src/views/highlight/flashcards/HighlightFlashcardManager.ts:44](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L44)、[src/views/highlight/flashcards/HighlightFlashcardManager.ts:131](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L131) |
| Delete HiCard | 中文 | [src/components/highlight/card/MenuController.ts:16](../src/components/highlight/card/MenuController.ts#L16)、[src/views/selection/BatchOperationsHandler.ts:253](../src/views/selection/BatchOperationsHandler.ts#L253) |
| Create HiCard | 中文 | [src/components/highlight/card/MenuController.ts:16](../src/components/highlight/card/MenuController.ts#L16)、[src/views/selection/BatchOperationsHandler.ts:197](../src/views/selection/BatchOperationsHandler.ts#L197)、[src/views/selection/BatchOperationsHandler.ts:213](../src/views/selection/BatchOperationsHandler.ts#L213) |
| Copy Highlight | 中文 | [src/components/highlight/card/MenuController.ts:23](../src/components/highlight/card/MenuController.ts#L23) |
| Open (DoubleClick) | 中文 | [src/components/highlight/card/TitleBarRenderer.ts:56](../src/components/highlight/card/TitleBarRenderer.ts#L56)、[src/views/managers/FileListItemRenderer.ts:95](../src/views/managers/FileListItemRenderer.ts#L95) |
| AI comment | 中文 | [src/components/highlight/card/TitleBarRenderer.ts:125](../src/components/highlight/card/TitleBarRenderer.ts#L125) |
| More | 中文 | [src/components/highlight/card/TitleBarRenderer.ts:135](../src/components/highlight/card/TitleBarRenderer.ts#L135) |
| Groups | 中文 | [src/flashcard/components/FlashcardRenderer.ts:122](../src/flashcard/components/FlashcardRenderer.ts#L122)、[src/flashcard/components/controllers/FlashcardProgress.ts:64](../src/flashcard/components/controllers/FlashcardProgress.ts#L64) |
| Update group failed | 中文 | [src/flashcard/components/controllers/FlashcardGroupManager.ts:44](../src/flashcard/components/controllers/FlashcardGroupManager.ts#L44) |
| Group name cannot be empty | 中文 | [src/flashcard/components/controllers/FlashcardGroupManager.ts:61](../src/flashcard/components/controllers/FlashcardGroupManager.ts#L61) |
| Group created | 中文 | [src/flashcard/components/controllers/FlashcardGroupManager.ts:83](../src/flashcard/components/controllers/FlashcardGroupManager.ts#L83) |
| Group update successful | 中文 | [src/flashcard/components/controllers/FlashcardGroupManager.ts:107](../src/flashcard/components/controllers/FlashcardGroupManager.ts#L107) |
| Edit group | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:31](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L31) |
| Enter name | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:89](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L89) |
| Support format: <br>Folder: folder1, folder1/folder2<br>Note: [[note1]], [[note2]] | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:100](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L100) |
| Reverse cards (use comments as questions) | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:117](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L117) |
| Learning settings | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:130](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L130) |
| New cards per day:  | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:151](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L151) |
| Reviews per day:  | 中文 | [src/flashcard/components/controllers/FlashcardGroupModal.ts:162](../src/flashcard/components/controllers/FlashcardGroupModal.ts#L162) |
| Due | 中文 | [src/flashcard/components/controllers/FlashcardProgress.ts:76](../src/flashcard/components/controllers/FlashcardProgress.ts#L76) |
| New | 中文 | [src/flashcard/components/controllers/FlashcardProgress.ts:77](../src/flashcard/components/controllers/FlashcardProgress.ts#L77) |
| Learned | 中文 | [src/flashcard/components/controllers/FlashcardProgress.ts:78](../src/flashcard/components/controllers/FlashcardProgress.ts#L78)、[src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:154](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L154) |
| All flashcards completed for today! | 中文 | [src/flashcard/components/controllers/FlashcardReviewQueue.ts:12](../src/flashcard/components/controllers/FlashcardReviewQueue.ts#L12)、[src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:103](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L103) |
| No cards due for review | 中文 | [src/flashcard/components/controllers/FlashcardReviewQueue.ts:17](../src/flashcard/components/controllers/FlashcardReviewQueue.ts#L17) |
| Group completed:  | 中文 | [src/flashcard/components/controllers/FlashcardReviewQueue.ts:20](../src/flashcard/components/controllers/FlashcardReviewQueue.ts#L20)、[src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:102](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L102) |
| . Add more cards in Settings, but remember: more cards = more reviews. | 中文 | [src/flashcard/components/controllers/FlashcardReviewQueue.ts:20](../src/flashcard/components/controllers/FlashcardReviewQueue.ts#L20) |
| No cards available | 中文 | [src/flashcard/components/renderers/FlashcardCardRenderer.ts:25](../src/flashcard/components/renderers/FlashcardCardRenderer.ts#L25) |
| No Flashcard Groups | 中文 | [src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:47](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L47) |
| You haven't created any flashcard groups yet. Create a group to get started with your flashcards. | 中文 | [src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:51](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L51) |
| Create Flashcard Group | 中文 | [src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:56](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L56) |
| No Cards in This Group | 中文 | [src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:73](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L73) |
| This group doesn't contain any flashcards yet. Add some flashcards to this group to start learning. | 中文 | [src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:77](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L77) |
| . All cards have been reviewed. | 中文 | [src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts:102](../src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts#L102) |
| Add Group | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:42](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L42) |
| Delete Group | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:108](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L108)、[src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:119](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L119) |
| Are you sure you want to delete group " | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:120](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L120) |
| "? | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:120](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L120) |
| Delete group failed | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:133](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L133)、[src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:137](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L137) |
| Due Today | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:152](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L152) |
| New Cards | 中文 | [src/flashcard/components/renderers/FlashcardGroupListRenderer.ts:153](../src/flashcard/components/renderers/FlashcardGroupListRenderer.ts#L153) |
| Edit the 21 FSRS algorithm weights. Format: JSON array of numbers. | 中文 | [src/flashcard/settings/FlashcardSettingsTab.ts:208](../src/flashcard/settings/FlashcardSettingsTab.ts#L208) |
| FSRS weights updated successfully | 中文 | [src/flashcard/settings/FlashcardSettingsTab.ts:230](../src/flashcard/settings/FlashcardSettingsTab.ts#L230) |
| Invalid format. Must be an array of 21 numbers. | 中文 | [src/flashcard/settings/FlashcardSettingsTab.ts:233](../src/flashcard/settings/FlashcardSettingsTab.ts#L233) |
| Invalid JSON format. Please check your input. | 中文 | [src/flashcard/settings/FlashcardSettingsTab.ts:237](../src/flashcard/settings/FlashcardSettingsTab.ts#L237) |
| No highlights to export. | 中文 | [src/services/ExportService.ts:51](../src/services/ExportService.ts#L51) |
| No highlights found in the current file. | 中文 | [src/services/ExportService.ts:115](../src/services/ExportService.ts#L115) |
| Export file already exists. Please try again in a moment. | 中文 | [src/services/export/ExportFileWriter.ts:14](../src/services/export/ExportFileWriter.ts#L14) |
| Failed to create export file:  | 中文 | [src/services/export/ExportFileWriter.ts:17](../src/services/export/ExportFileWriter.ts#L17) |
| General | 中文 | [src/settings/SettingsTab.ts:24](../src/settings/SettingsTab.ts#L24) |
| AI service | 中文 | [src/settings/SettingsTab.ts:28](../src/settings/SettingsTab.ts#L28) |
| Verifying... | 中文 | [src/settings/SettingsTab.ts:117](../src/settings/SettingsTab.ts#L117) |
| Activation successful! | 中文 | [src/settings/SettingsTab.ts:120](../src/settings/SettingsTab.ts#L120) |
| Activation failed. Please check your license key. | 中文 | [src/settings/SettingsTab.ts:124](../src/settings/SettingsTab.ts#L124) |
| No custom regex rules. Click "+" to add a new rule. | 中文 | [src/settings/components/RegexRuleEditor.ts:39](../src/settings/components/RegexRuleEditor.ts#L39) |
| Add new rule | 中文 | [src/settings/components/RegexRuleEditor.ts:51](../src/settings/components/RegexRuleEditor.ts#L51) |
| Rule name | 中文 | [src/settings/components/RegexRuleEditor.ts:79](../src/settings/components/RegexRuleEditor.ts#L79) |
| Regular expression with capture groups | 中文 | [src/settings/components/RegexRuleEditor.ts:88](../src/settings/components/RegexRuleEditor.ts#L88) |
| Delete rule | 中文 | [src/settings/components/RegexRuleEditor.ts:113](../src/settings/components/RegexRuleEditor.ts#L113) |
| Use custom rules | 中文 | [src/settings/tabs/GeneralSettingsTab.ts:109](../src/settings/tabs/GeneralSettingsTab.ts#L109) |
| Data management | 中文 | [src/settings/tabs/GeneralSettingsTab.ts:124](../src/settings/tabs/GeneralSettingsTab.ts#L124) |
| Add prompt | 中文 | [src/settings/tabs/PromptSettingsTab.ts:35](../src/settings/tabs/PromptSettingsTab.ts#L35) |
| Include Comments | 中文 | [src/templates/ExportModal.ts:88](../src/templates/ExportModal.ts#L88) |
| Export failed, please try again | 中文 | [src/templates/ExportModal.ts:160](../src/templates/ExportModal.ts#L160) |
| Delete highlight | 中文 | [src/views/highlight/actions/HighlightDeletionManager.ts:40](../src/views/highlight/actions/HighlightDeletionManager.ts#L40) |
| Delete this highlight and all its data, including Comments and HiCards? Can't undo. | 中文 | [src/views/highlight/actions/HighlightDeletionManager.ts:41](../src/views/highlight/actions/HighlightDeletionManager.ts#L41) |
| Highlight deleted successfully | 中文 | [src/views/highlight/actions/HighlightDeletionManager.ts:67](../src/views/highlight/actions/HighlightDeletionManager.ts#L67) |
| Please open a file first. | 中文 | [src/views/highlight/exports/ExportManager.ts:51](../src/views/highlight/exports/ExportManager.ts#L51)、[src/views/highlight/virtual/VirtualHighlightManager.ts:64](../src/views/highlight/virtual/VirtualHighlightManager.ts#L64) |
| Failed to create flashcard, please check highlight content | 中文 | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:68](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L68) |
| Flashcard created successfully! | 中文 | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:77](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L77) |
| Flashcard and highlight deleted | 中文 | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:149](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L149) |
| Flashcard deleted, highlight and comments preserved | 中文 | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:151](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L151) |
| Flashcard not found | 中文 | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:162](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L162) |
| Error loading highlights. Please try again. | 中文 | [src/views/highlight/list/HighlightListController.ts:141](../src/views/highlight/list/HighlightListController.ts#L141) |
| No matching highlights found for your search. | 中文 | [src/views/highlight/rendering/HighlightRenderManager.ts:315](../src/views/highlight/rendering/HighlightRenderManager.ts#L315) |
| BACK | 中文 | [src/views/managers/UIInitializer.ts:125](../src/views/managers/UIInitializer.ts#L125)、[src/views/managers/UIInitializer.ts:125](../src/views/managers/UIInitializer.ts#L125)、[src/views/managers/UIInitializer.ts:130](../src/views/managers/UIInitializer.ts#L130) |
| Please select highlights to export | 中文 | [src/views/selection/BatchExportOperations.ts:19](../src/views/selection/BatchExportOperations.ts#L19) |
| Successfully exported selected highlights to:  | 中文 | [src/views/selection/BatchExportOperations.ts:27](../src/views/selection/BatchExportOperations.ts#L27) |
| HiCard function is not initialized, please enable FSRS function | 中文 | [src/views/selection/BatchFlashcardOperations.ts:32](../src/views/selection/BatchFlashcardOperations.ts#L32)、[src/views/selection/BatchFlashcardOperations.ts:126](../src/views/selection/BatchFlashcardOperations.ts#L126)、[src/views/selection/BatchOperationsHandler.ts:200](../src/views/selection/BatchOperationsHandler.ts#L200) |
| Confirm delete HiCard | 中文 | [src/views/selection/BatchFlashcardOperations.ts:70](../src/views/selection/BatchFlashcardOperations.ts#L70) |
| Are you sure you want to delete the HiCards of the selected highlights? This action cannot be undone. | 中文 | [src/views/selection/BatchFlashcardOperations.ts:73](../src/views/selection/BatchFlashcardOperations.ts#L73) |
| Create missing HiCard | 中文 | [src/views/selection/BatchFlashcardOperations.ts:99](../src/views/selection/BatchFlashcardOperations.ts#L99) |
| Delete existing HiCards | 中文 | [src/views/selection/BatchFlashcardOperations.ts:107](../src/views/selection/BatchFlashcardOperations.ts#L107) |
| No highlights selected | 中文 | [src/views/selection/BatchHighlightDeletionOperations.ts:26](../src/views/selection/BatchHighlightDeletionOperations.ts#L26)、[src/views/selection/BatchHighlightDeletionOperations.ts:64](../src/views/selection/BatchHighlightDeletionOperations.ts#L64) |
| Confirm delete highlights | 中文 | [src/views/selection/BatchHighlightDeletionOperations.ts:31](../src/views/selection/BatchHighlightDeletionOperations.ts#L31) |
| 删除高亮失败 | 英文 | [src/views/selection/BatchHighlightDeletionOperations.ts:211](../src/views/selection/BatchHighlightDeletionOperations.ts#L211) |
| Export | 中文 | [src/views/selection/BatchOperationsHandler.ts:146](../src/views/selection/BatchOperationsHandler.ts#L146) |
| Manage HiCard | 中文 | [src/views/selection/BatchOperationsHandler.ts:269](../src/views/selection/BatchOperationsHandler.ts#L269) |

## 动态翻译失效清单

这些调用应使用固定键和参数，而不是先拼接运行时数据再查词典。

| 当前表达式 | 位置 |
| --- | --- |
| &#96;Not found named "${promptName}" Prompt&#96; | [src/components/AIButton.ts:143](../src/components/AIButton.ts#L143) |
| &#96;AI comments failed: ${error.message}&#96; | [src/components/AIButton.ts:163](../src/components/AIButton.ts#L163) |
| &#96;AI generation failed: ${message}&#96; | [src/components/comment/InlineAICommentHandler.ts:58](../src/components/comment/InlineAICommentHandler.ts#L58) |
| &#96;删除高亮失败: ${message}&#96; | [src/components/highlight/HighlightCard.ts:315](../src/components/highlight/HighlightCard.ts#L315) |
| &#96;操作失败: ${message}&#96; | [src/components/highlight/card/FlashcardController.ts:49](../src/components/highlight/card/FlashcardController.ts#L49) |
| &#96;Failed to delete highlight: ${error.message}&#96; | [src/views/highlight/actions/HighlightDeletionManager.ts:74](../src/views/highlight/actions/HighlightDeletionManager.ts#L74) |
| &#96;Failed to create flashcard: ${error.message}&#96; | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:83](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L83) |
| &#96;Failed to delete flashcard: ${error.message}&#96; | [src/views/highlight/flashcards/HighlightFlashcardManager.ts:167](../src/views/highlight/flashcards/HighlightFlashcardManager.ts#L167) |
| &#96;Successfully ${action} ${successCount} HiCard&#96; | [src/views/selection/BatchFlashcardOperations.ts:202](../src/views/selection/BatchFlashcardOperations.ts#L202) |
| &#96;Successfully ${action} ${successCount} HiCard, ${failCount} failed&#96; | [src/views/selection/BatchFlashcardOperations.ts:204](../src/views/selection/BatchFlashcardOperations.ts#L204) |
| &#96;No HiCard to ${operation}&#96; | [src/views/selection/BatchFlashcardOperations.ts:206](../src/views/selection/BatchFlashcardOperations.ts#L206) |
| &#96;Failed to ${operation} HiCard! Please check the selected highlight content&#96; | [src/views/selection/BatchFlashcardOperations.ts:208](../src/views/selection/BatchFlashcardOperations.ts#L208) |
| &#96;Are you sure you want to delete ${selectedHighlights.size} highlights and all their data, including Comments and HiCards? This action cannot be undone.&#96; | [src/views/selection/BatchHighlightDeletionOperations.ts:34](../src/views/selection/BatchHighlightDeletionOperations.ts#L34) |
| &#96;成功删除 ${fileMarkSuccess} 个高亮&#96; | [src/views/selection/BatchHighlightDeletionOperations.ts:200](../src/views/selection/BatchHighlightDeletionOperations.ts#L200) |
| &#96;成功删除 ${fileMarkSuccess} 个高亮&#96; | [src/views/selection/BatchHighlightDeletionOperations.ts:202](../src/views/selection/BatchHighlightDeletionOperations.ts#L202) |
| &#96;，${fileMarkFailed} 个文件标记删除失败&#96; | [src/views/selection/BatchHighlightDeletionOperations.ts:204](../src/views/selection/BatchHighlightDeletionOperations.ts#L204) |
| &#96;，${dataDeleteFailed} 个数据删除失败&#96; | [src/views/selection/BatchHighlightDeletionOperations.ts:207](../src/views/selection/BatchHighlightDeletionOperations.ts#L207) |

推荐形式（需要先给 t 增加参数支持）：

```ts
t("Deleted {count} highlights", { count: deletedCount })
```

## 已核实的直接硬编码界面文案

| 位置 | 当前文案/现象 |
| --- | --- |
| [src/components/comment/CommentWidgetHelper.ts:97](../src/components/comment/CommentWidgetHelper.ts#L97) | 还有 N 条评论…，英文界面也显示中文 |
| [src/components/highlight/CommentList.ts:128](../src/components/highlight/CommentList.ts#L128) | Double click to edit |
| [src/components/highlight/card/Clipboard.ts:10](../src/components/highlight/card/Clipboard.ts#L10) | Copied |
| [src/components/highlight/card/Clipboard.ts:13](../src/components/highlight/card/Clipboard.ts#L13) | Failed to copy content |
| [src/components/highlight/card/Clipboard.ts:17](../src/components/highlight/card/Clipboard.ts#L17) | Failed to copy content |
| [src/flashcard/services/FSRSManager.ts:166](../src/flashcard/services/FSRSManager.ts#L166) | HiNote could not save flashcards… |
| [src/services/ai/OllamaService.ts:89](../src/services/ai/OllamaService.ts#L89) | Downloading model… |
| [src/services/ai/OllamaService.ts:102](../src/services/ai/OllamaService.ts#L102) | Model … downloaded successfully |
| [src/services/ai/OllamaService.ts:166](../src/services/ai/OllamaService.ts#L166) | Ollama service is not running… |
| [src/settings/tabs/AIServiceTab.ts:20](../src/settings/tabs/AIServiceTab.ts#L20) | AI service |
| [src/settings/tabs/GeneralSettingsTab.ts:27](../src/settings/tabs/GeneralSettingsTab.ts#L27) | Example: folder 1/folder 2 |
| [src/templates/index.ts:64](../src/templates/index.ts#L64) | Untitled 回退标题 |
| [src/templates/index.ts:104](../src/templates/index.ts#L104) | Untitled 回退标题 |
| [src/templates/index.ts:109](../src/templates/index.ts#L109) | Retrieved: 日期 |
| [src/templates/index.ts:172](../src/templates/index.ts#L172) | Untitled 回退标题 |
| [src/views/highlight/list/InfiniteScrollManager.ts:90](../src/views/highlight/list/InfiniteScrollManager.ts#L90) | 加载高亮内容时出错 |
| [src/views/hinote/HiNoteView.ts:110](../src/views/hinote/HiNoteView.ts#L110) | HiNote could not load its data… |
| [src/flashcard/components/FlashcardStatsPanel.ts:212](../src/flashcard/components/FlashcardStatsPanel.ts#L212) | 热力图 tooltip：Learned N new cards, reviewed N cards |
| [src/flashcard/components/FlashcardStatsPanel.ts:216](../src/flashcard/components/FlashcardStatsPanel.ts#L216) | 热力图 tooltip：Rating distribution: Again / Hard / Good / Easy |

## 其他需处理的语言问题

- [src/flashcard/components/FlashcardStatsPanel.ts:43](../src/flashcard/components/FlashcardStatsPanel.ts#L43)：New / Learned / Review 经变量传给 t(label)，其中 Review 也缺中文，未计入字面量调用统计。
- [src/types/settings.ts:23](../src/types/settings.ts#L23)：内置正则规则名 Default Highlight、Mark format、Span format 是英文默认值；编辑器直接显示保存的名称。应区分内置默认值与用户改名，不能直接改写所有已保存名称。
- [src/flashcard/components/renderers/FlashcardCardRenderer.ts:322](../src/flashcard/components/renderers/FlashcardCardRenderer.ts#L322)：间隔单位固定 m/h/d/mo/y，中文未本地化。
- [src/templates/index.ts:76](../src/templates/index.ts#L76)、[src/templates/ExportModal.ts:211](../src/templates/ExportModal.ts#L211)、[src/components/comment/CommentWidgetHelper.ts:89](../src/components/comment/CommentWidgetHelper.ts#L89)、[src/flashcard/components/FlashcardStatsPanel.ts:212](../src/flashcard/components/FlashcardStatsPanel.ts#L212)：日期使用默认 toLocaleDateString/toLocaleString；显示语言取决于运行环境默认 locale，可能与 Obsidian 语言不同。
- [styles.css:43](../styles.css#L43) 起的 @settings 元数据标题/描述仅中文，使用 Style Settings 的英文用户也会看到中文。该部分不经过 t()，需单独处理。
- [src/services/ai/AITestHelper.ts:27](../src/services/ai/AITestHelper.ts#L27) 附近：未识别的错误原文会直出。应用层应尽量提供已翻译的概括，再附原始技术详情；不应将任意外部错误当作翻译键。
- [src/i18n/en.ts:163](../src/i18n/en.ts#L163)：General 映射成 Highlight，而中文仅有 General Settings；除缺失外，还有命名口径不统一。

## 已排除的误报

- HiNote、HiCard、Ollama 等品牌名；API URL、model-id、JSON、十六进制颜色等技术标记。
- L13 等行号、用户笔记正文、批注、用户自定义分组及提示词内容。
- FlashcardGroups 和颜色选项保存的是稳定英文标签，但渲染时已调用 t()，不能仅因定义为英文就判断漏翻译。
- FlashcardStorageService 中 Add answer / 添加答案 用于兼容清理历史占位符，不是新界面文案。
- 注释、控制台日志、纯内部诊断不计入界面漏翻译数量。

## 建议的修复与验收方式

1. 固定模板键 + 参数插值，清除 t(动态拼接结果)；统一大小写、空白和标点。
2. 补齐实际使用的键；不要求将可回退的英文原文机械复制到 en.ts。
3. 增加 CI/本地扫描：静态缺中文键、中文键缺英文、t(插值模板)、明显未翻译的 Notice 和 UI 属性。变量标签采用显式允许列表或类型约束。
4. 手动分别以英文、简体中文验证侧边栏、主视图、收藏、HiCard、设置、批量操作、导出和失败场景。
5. 用户自定义内容和历史存储名称不做全量自动翻译或覆写。

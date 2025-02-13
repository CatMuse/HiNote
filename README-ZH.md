<div align="center">
	<h1>HiNote-高亮文本添加评论</h1>
	<img src="https://img.shields.io/github/downloads/CatMuse/HiNote/total" alt="GitHub Downloads (all assets, all releases)" />
	<img src="https://img.shields.io/github/v/release/CatMuse/HiNote" alt="GitHub release (latest by date)" />
	<img src="https://img.shields.io/github/last-commit/CatMuse/HiNote" alt="GitHub last commit" />
	<img src="https://img.shields.io/github/issues/CatMuse/HiNote" alt="GitHub issues" />
	<img src="https://img.shields.io/github/stars/CatMuse/HiNote?style=social" alt="GitHub stars" />
</div>

---

简体中文 | [English](./README.md)

这款由 AI 编程的 Obsidian 插件能够自动提取笔记中的高亮文本，支持用户添加评论、生成 AI 评论及与高亮文本进行对话。用户可以使用多种格式进行文本高亮，并将其导出为知识卡片图片，同时在主视图中享受更多扩展功能。

>  我完全没有研发经验，这款插件是我和 AI 共同完成，作为 Beta 版请谨慎使用。

[![HighlightComment Plugin Tutorial](https://img.youtube.com/vi/M3K80g5MYM8/maxresdefault.jpg)](https://www.youtube.com/watch?v=M3K80g5MYM8)

---
## 高亮文本获取

当打开包含高亮文本的笔记时，侧边栏会自动获取高亮文本以卡片的样式展示。支持以下三种格式的高亮标记：`==` 、`<mark> `、`<span>`。

![Highlighted text retrieval](./doc/highlighted-text-retrieval.jpg)

---
## 高亮评论

高亮评论功能让您能够快速与高亮文本进行对话，防止灵感稍纵即逝。只需点击编辑区的 Widgets 或直接在卡片上点击添加评论按钮，即可打开输入框。

笔记评论功能让你可以不依赖于任何高亮文本为整个文件添加你的思考。点击搜索栏右侧添加文件评论即可在高亮列表最顶部打开输入框。

>  所有高亮和评论数据都会保存在插件的 `data.json` 文件中，完全由您自行掌控。

---

## 导出为图片

将您的高亮文本导出为精美的知识卡片，便于分享。

![Export image](./doc/export-image.jpg)

---

## 导出为笔记

将你的全部高亮文本和评论导出为一篇新的笔记，笔记采用 Callout 格式展示。

![export as file](./doc/export-as-file.jpg)

---

## 主视图的扩展功能

将右侧侧边栏窗口拖动到主视图，可以解锁更多功能，例如：包含高亮文本的笔记列表、所有高亮卡片以及 AI 对话窗口（详见后文）。

- 笔记列表：显示知识库中所有包含高亮文本的笔记，并标注高亮数量；
- 全部高亮：展示知识库中所有高亮卡片，让你更专注地查看高亮知识；
- AI 对话：可以通过右下角对话图标打开 AI 对话窗口（详见后文）；

![main view](./doc/main-view.jpg)

---

## AI 评论

AI 可以辅助你进行思考，并将生成的内容以评论的形式添加到高亮文本的下方。首先，你需要在插件的设置菜单中配置 AI 服务商、API Key 和模型。目前支持的服务商包括 OpenAI、Gemini、Anthropic 和 Ollama。

接下来，配置你自定义的 Prompt。在这里，你可以使用两个字段来获取高亮文本和评论内容： `{{highlight}}` 和 `{{Comment}}` 。

最后，你就可以在高亮卡片的 AI 按钮中使用你自定义的 Prompt 了。

---

## AI  对话

在主视图的右下角，你可以点击对话图标，或使用快捷命令（`Ctrl/Cmd+P`）打开 AI 对话窗口。该窗口可以自由拖动和调整大小。在对话窗口中，您可以切换 AI 服务的模型，并清空当前对话内容（请注意，清空后无法恢复，且目前不支持导出和保存）。

此外，您还可以将高亮的卡片拖入对话窗口，作为对话的一部分，并支持同时拖入多条高亮内容。

![AI chat](./doc/ai-chat.jpg)

export default {

    //通用翻译

    "Ollama (Local)": "Ollama (本地)",
    "Model": "模型",
    "Save": "保存",
    "Cancel": "取消",
    "Edit": "编辑",
    "Delete": "删除",
    "Custom Model": "自定义模型",
    "Checking...": "检查中...",
   
    //AI 通用   

    "Select the AI service provider": "选择 AI 服务提供商。",
    "API Key": "API 密钥",
    "Please enter your API Key.": "请输入您的 API 密钥。",
    "API Key is valid!": "API 密钥有效！",
    "API Key and model available.": "API 密钥和模型可用！",
    "Invalid API Key or server error. Please verify your API Key.": "API密钥无效或服务器错误，请检查密钥。",
    "Select a model or enter a custom one.": "选择模型或输入自定义模型。",
    "Provider URL": "服务地址",
    "Leave it blank, unless you are using a proxy.": "留空，除非您使用代理。",
    "Please enter an API Key first": "请先输入 API 密钥。",
    "Custom model unavailable. Please check the model ID and your access permissions.": "自定义模型不可用。请检查模型 ID 和您的访问权限。",

    //OpenAI 设置

    "OpenAI service": "OpenAI 服务",
    "No models available. Please check your API Key.": "没有可用的模型。请检查您的 API 密钥。",

    //Anthropic 设置

    "Anthropic service": "Anthropic 服务",
    "Model ID can only contain letters, numbers, underscores, dots and hyphens.": "模型 ID 只能包含字母、数字、下划线、点和连字符",

    //Gemini 设置

    "Unable to create model selection dropdown menu.": "无法创建模型选择下拉菜单。",
    "Gemini service": "Gemini 服务",

    //Deepseek 设置

    "Deepseek service": "Deepseek 服务",

    //Ollama 设置

    "Ollama service": "Ollama 服务",
    "Ollama server URL (default: http://localhost:11434)": "Ollama server URL（默认：http://localhost:11434）",
    "Check": "验证",
    "Server URL": "服务器 URL",
    "Successfully connected to Ollama service": "成功连接到 Ollama 服务",
    "No models found. Please download models using ollama": "未找到模型。请使用 ollama 下载模型",
    "Could not connect to Ollama service": "无法连接到 Ollama 服务",
    "Failed to connect to Ollama service. Please check the server URL.": "无法连接到 Ollama 服务，请检查 server URL。",
    "Currently selected model (Test connection to see all available models)": "当前选择的模型（测试连接以查看可用模型）",
    "Select a Ollama model.": "选择一个 Ollama 模型",
    "No models available. Please load an available model first.": "无可用模型，请先加载可用模型。",
    "No models available": "无可用模型",

    //Prompt 设置

    "Prompt settings": "自定义 Prompt",
    "Add Prompt": "添加 Prompt",
    "Input Prompt Name": "输入 Prompt 名称",
    "Input Prompt Content\nAvailable parameters:\n{{highlight}} - Current highlighted text\n{{comment}} - Existing comment": "输入 Prompt 内容\n可用参数:\n{{highlight}} - 当前高亮文本\n{{comment}} - 已存在的注释",
    "Prompt added": "Prompt 已添加",
    "Prompt updated": "Prompt 已更新",

    //CommentInput

    "Shift + Enter Wrap, Enter Save": "Shift + Enter 换行，Enter 保存",
    "Delete comment": "删除评论",

    //ActionButtons

    "Add Comment": "添加评论",
    "Export as Image": "导出为图片",

    //AIButton

    "Select Prompt": "选择 Prompt",
    "Please add Prompt in the settings first": "请先在设置中添加 Prompt",
    "AI comments added ": "AI 评论已添加",
    "AI comments failed:": "AI 评论失败：",

    //ChatView

    "Chat": "对话",
    "Failed to process dropped highlight:": "无法处理删除的高亮：",
    "highlighted notes": " 条高亮笔记",
    "Input message...": "输入消息...",
    "Unable to access the Ollama model, please check the service.": "无法访问 Ollama 模型，请检查服务是否正常运行",
    "Unable to get Gemini model list, please check API Key and network connection.": "无法获取 Gemini 模型列表，请检查 API Key 和网络连接",

    //ExportModal

    "Download": "下载",
    "Export successful!": "导出成功！",
    "Export failed, please try again.": "导出失败，请重试",

    //CommentView

    "Loading...": "加载中...",
    "Search...": "搜索高亮或评论...",
    "No matching content found.": "未找到匹配的内容。",
    "The current document has no highlighted content.": "当前文档没有高亮内容。",
    "No corresponding file found.": "未找到相应的文件。",
    "Export failed: Failed to load necessary components.": "导出失败：加载必要组件失败。",
    "All Highlight": "全部高亮",
    "Export as notes": "导出为笔记",
    "Add File Comment": "添加文件评论",
    "File Comment": "文件评论",
    "Successfully exported highlights to: ": "成功导出高亮到：",
    "Failed to export highlights: ": "无法导出高亮：",

    //index

    "Default Template": "默认模板",
    "Modern minimalist knowledge card style": "现代极简知识卡片风格",
    "Academic Template": "学术模板",
    "Formal style suitable for academic citations": "适用于学术引用的正式风格",
    "Social Template": "社交模板",
    "Modern style suitable for social media sharing": "适用于社交媒体分享的现代风格",

    //main

    "Open AI chat window": "打开 AI 对话窗口",
    "Open HiNote window": "打开 HiNote 窗口",

    // Settings
    'General Settings': '通用设置',
    'Export Path': '导出路径',
    'Set the path for exported highlight notes. Leave empty to use vault root. The path should be relative to your vault root.': '设置高亮笔记的导出路径。留空则使用 vault 根目录。路径应相对于 vault 根目录。',
    "Exclusions": "排除",
    "Comma separated list of paths, tags, note titles or file extensions that will be excluded from highlighting. e.g. folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md": "逗号分隔的路径，标签，笔记标题或文件扩展名，将从高亮中排除。例如：folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md",
    "Custom text extraction": "自定义文本提取",
    "Use Custom Pattern": "使用自定义模式",
    "Enable to use a custom regular expression for extracting text.": "启用自定义正则表达式以提取文本。",
    "Custom Pattern": "自定义模式",
    "Enter a custom regular expression for extracting text. Use capture groups () to specify the text to extract. The first non-empty capture group will be used as the extracted text.": "输入自定义正则表达式以提取文本。使用捕获组 () 指定要提取的文本。第一个非空捕获组将用作提取的文本。",
    "Default Color": "默认颜色",
    "Set the default color for decorators when no color is specified. Leave empty to use system default.": "设置当未指定颜色时的装饰器的默认颜色。留空以使用系统默认颜色。",
    "Export template": "导出模板",
    "Clean orphaned data": "清理孤立数据",
    "Remove highlights and comments that no longer exist in your documents. This is useful if you have deleted highlights but their comments are still stored in the data file.": "删除不再存在于您的文档中的高亮和注释。这在您删除高亮但注释仍然存储在数据文件中时很有用。",

    // Flashcard Settings
    "Flashcard learning": "闪卡学习设置",
    "New cards per day": "每日新卡片数量",
    "Maximum number of new cards to learn each day": "每天学习的新卡片最大数量",
    "Reviews per day": "每日复习数量",
    "Maximum number of cards to review each day": "每天复习的卡片最大数量",
    "Target retention": "目标记忆保持率",
    "Target memory retention rate (0.8 = 80%)": "目标记忆保持率（0.8 = 80%）",
    "Maximum interval": "最大间隔",
    "Maximum interval in days between reviews": "复习之间的最大间隔天数",
    "Reset daily stats": "重置今日统计",
    "Reset today's learning statistics": "重置今天的学习统计数据",
    "Reset": "重置",
    "Daily statistics have been reset": "今日统计已重置",
    "No statistics to reset for today": "今天没有可重置的统计数据",
    "Advanced": "高级设置",
    "These settings control the FSRS algorithm parameters. Only change them if you understand the algorithm.": "这些设置控制FSRS算法参数。仅在理解算法的情况下更改它们。",
    "Reset algorithm parameters": "重置算法参数",
    "Reset the FSRS algorithm parameters to default values": "将FSRS算法参数重置为默认值",
    "Reset to default": "重置为默认值",
    "FSRS parameters have been reset to default values": "FSRS参数已重置为默认值",
    "days": "天",
    
    // FSRS 权重参数编辑
    "FSRS weight parameter. The default value is obtained from a smaller sample; if adjustment is needed, please use the FSRS optimizer for calculation.": "算法权重参数。默认值为较小样本获得，如果需要调整请使用 FSRS 优化器计算",
    "FSRS parameters": "FSRS 参数",
    "Edit the 17 FSRS algorithm weights. Format: JSON array of numbers.": "编辑 17 个 FSRS 算法权重。格式：数字数组的 JSON 格式。",

    "FSRS parameters updated successfully": "FSRS 参数更新成功",

    // Flashcard UI
    "Activate HiCard": "激活 HiCard",
    "Enter your license key to activate HiCard feature.": "输入您的许可证密钥以激活 HiCard 功能。",
    "Enter license key": "输入许可证密钥",
    "Activate": "激活",
    "Please enter a license key": "请输入许可证密钥",
    "HiCard activated successfully!": "HiCard 激活成功！",
    "Invalid license key": "无效的许可证密钥",
    "Use global settings": "使用全局设置",
    "New cards per day:": "每日新卡数量:",
    "Reviews per day:": "每日复习数量:",
    "Create group": "创建分组",
    "Create": "创建",
    "Again": "重来",
    "Hard": "困难",
    "Good": "良好",
    "Easy": "简单",
    "Card": "卡片",
    "of": "共",
    "Settings": "设置",
    "Are you sure you want to delete this group?": "确定要删除此分组吗？",
    "Yes": "是",
    "No": "否",
    "You've completed All cards for today!": "您今天已完成所有卡片！",
    "No cards available.": "没有可用的卡片。",
    "Return to First Card": "返回第一张卡片",
    "Edit Group": "编辑分组",
    "Create New Group": "创建新分组",
    "Please fill in all fields": "请填写所有字段",
    "Saving...": "保存中...",
    "Creating...": "创建中...",
    "Group updated successfully": "分组更新成功",
    "Failed to update group": "分组更新失败",
    "Group created successfully": "分组创建成功",
    "Failed to create or update group": "创建或更新分组失败",
    "Retention": "保留率",
    "Limits:": "限制：",
    "Learning completed!": "学习完成！",
    "Group deleted": "分组已删除",
    
    // 搜索前缀提示
    "search-prefix-all": "跨文件搜索所有高亮",
    "search-prefix-hicard": "只搜索闪卡高亮",
    "search-prefix-comment": "只搜索带批注的高亮",
    "search-prefix-path": "按文件路径搜索高亮",

    // 其他

    "Open (double-click)": "双击打开"
};

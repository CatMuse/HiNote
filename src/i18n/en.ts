export default {

//设置通用翻译

    "Select the AI service provider": "Select the AI service provider.",
    "Ollama (Local)": "Ollama (local)",
    "Model": "Model",
    "Failed to fetch models": "Failed to fetch models.",
    "API Key": "API key",
    "Custom API Address": "Custom API address",
    "If using a custom API proxy, please enter the full API address": "If using a custom API proxy, please enter the full API address.",
    "Please enter your API Key": "Please enter your API key.",
    "Validating API Key...": "Validating API key...",
    "API Key verification successful!": "API key verification successful!",
    "API Key verification failed. Please check your API Key.": "API key verification failed. Please check your API key.",
    "Save": "Save",
    "Cancel": "Cancel",
    "Edit": "Edit",
    "Delete": "Delete",
    "Custom Model": "Custom model",
    "API Key is valid!": "API Key is valid!",
    "Failed to validate API Key. Please check your key and try again.": "Failed to validate API Key. Please check your key and try again.",
    "Please enter an API Key first": "Please enter an API Key first.",
    "Checking...": "Checking...",
    "API Key and the current model are both available!": "API Key and the current model are both available!",
    "API Key is invalid or there is a server error. Please check if your API Key is correct.": "API Key is invalid or there is a server error. Please check if your API Key is correct.",
    
//OpenAI 设置

    "Select the OpenAI model to use": "Select the OpenAI model to use.",
    "OpenAI Settings": "OpenAI service",
    "Enter your OpenAI API Key.": "Enter your OpenAI API key.",
    "No available models found.": "No available models found.",
    "API Key validated successfully!": "API Key validated successfully!",
    "No models available. Please check your API Key.": "No models available. Please check your API Key.",
    

//Anthropic 设置

    "Anthropic Settings": "Anthropic service",
    "Enter your Anthropic API Key.": "Enter your Anthropic API key.",
    "Select the Anthropic model to use": "Select the Anthropic model to use.",
    "Select a model or use a custom one": "Select a model or use a custom one.",
    "Model ID can only contain letters, numbers, underscores, dots and hyphens": "Model ID can only contain letters, numbers, underscores, dots and hyphens.",

//Gemini 设置

    "Select the Gemini model to use": "Select the Gemini model to use.",
    "Unable to create model selection dropdown menu.": "Unable to create model selection dropdown menu.",
    "Gemini Settings": "Gemini service",
    "Enter your Gemini API Key": "Enter your Gemini API key.",

//Deepseek 设置

    "Deepseek Settings": "Deepseek service",
    "Enter your Deepseek API Key": "Enter your Deepseek API key.",

//Ollama 设置

    "Ollama Settings": "Ollama service",
    "Server Address": "Server address",
    "Ollama server address (default: http://localhost:11434)": "Ollama server address (default: http://localhost:11434)",
    "Check": "Check",
    "Successfully connected to Ollama service": "Successfully connected to Ollama service.",
    "No models found. Please download models using ollama": "No models found. Please download models using ollama.",
    "Could not connect to Ollama service": "Could not connect to Ollama service",
    "Failed to connect to Ollama service. Please check the server address.": "Failed to connect to Ollama service. Please check the server address.",
    "Currently selected model (Test connection to see all available models)": "Currently selected model (Test connection to see all available models)",
    "Select a model to use": "Select a model to use",
    "No models available. Please load an available model first.": "No models available. Please load an available model first.",
    "No models available": "No models available",

//Prompt 设置

    "Prompt settings": "Custom prompt",
    "Add Prompt": "Add prompt",
    "Input Prompt Name": "Input prompt name",
    "Input Prompt Content\nAvailable parameters:\n{{highlight}} - Current highlighted text\n{{comment}} - Existing comment": "Input prompt content\nAvailable parameters:\n{{highlight}} - Current highlighted text\n{{comment}} - Existing comment",
    "Prompt added": "Prompt added",
    "Prompt updated": "Prompt updated",

//CommentInput

    "Shift + Enter Wrap, Enter Save": "Shift + Enter Wrap, Enter Save",
    "Delete comment": "Delete",

//ActionButtons

    "Add Comment": "Add comment",
    "Export as Image": "Export as image",

//AIButton

    "Select Prompt": "Select prompt",
    "Please add Prompt in the settings first": "Please add prompt in the settings first",
    "AI comments have been added": "AI comments have been added",
    "AI comments failed:": "AI comments failed:",

//ChatView

    "Chat": "Chat",
    "Failed to process dropped highlight:": "Failed to process dropped highlight:",
    "highlighted notes": " highlighted notes",
    "Input message...": "Input message...",
    "Unable to access the Ollama model, please check the service.": "Unable to access the Ollama model, please check the service.",
    "Unable to get Gemini model list, please check API Key and network connection.": "Unable to get Gemini model list, please check API key and network connection.",

//ExportModal

    "Download": "Download",
    "Export successful!": "Export successful!",
    "Export failed, please try again.": "Export failed, please try again.",

//CommentView

    "Loading...": "Loading...",
    "Search...": "Search...",
    "No matching content found.": "No matching content found.",
    "The current document has no highlighted content.": "The current document has no highlighted content.",
    "No corresponding file found.": "No corresponding file found.",
    "Export failed: Failed to load necessary components.": "Export failed: Failed to load necessary components.",
    "All Highlight": "All highlight",
    "Export as notes": "Export as notes",
    "Add File Comment": "Add file comment",
    "File Comment": "File comment",
    "Successfully exported highlights to: ": "Successfully exported highlights to: ",
    "Failed to export highlights: ": "Failed to export highlights: ",

//index

    "Default Template": "Default template",
    "Modern minimalist knowledge card style": "Modern minimalist knowledge card style",
    "Academic Template": "Academic template",
    "Formal style suitable for academic citations": "Formal style suitable for academic citations",
    "Social Template": "Social template",
    "Modern style suitable for social media sharing": "Modern style suitable for social media sharing",

//main

    "Open AI chat window": "Open AI chat window",
    "Open HiNote window": "Open HiNote window",

// Settings
    'General': 'Highlight',
    'Export Path': 'Export path',
    'Set the path for exported highlight notes. Leave empty to use vault root. The path should be relative to your vault root.': 'Set the path for exported highlight notes. Leave empty to use vault root. The path should be relative to your vault root.',
    "Exclusions": "Exclusions",
    "Comma separated list of paths, tags, note titles or file extensions that will be excluded from highlighting. e.g. folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md": "Comma separated list of paths, tags, note titles or file extensions that will be excluded from highlighting. e.g. folder1, folder1/folder2, [[note1]], [[note2]], *.excalidraw.md",
    "Custom text extraction": "Custom text extraction",
    "Use Custom Pattern": "Use custom pattern",
    "Enable to use a custom regular expression for extracting text.": "Enable to use a custom regular expression for extracting text.",
    "Custom Pattern": "Custom pattern",
    "Enter a custom regular expression for extracting text. Use capture groups () to specify the text to extract. The first non-empty capture group will be used as the extracted text.": "Enter a custom regular expression for extracting text. Use capture groups () to specify the text to extract. The first non-empty capture group will be used as the extracted text.",
    "Default Color": "Default color",
    "Set the default color for decorators when no color is specified. Leave empty to use system default.": "Set the default color for decorators when no color is specified. Leave empty to use system default.",
    "Export template": "Export template",
    "Clean orphaned data": "Clean orphaned data",
    "Remove highlights and comments that no longer exist in your documents. This is useful if you have deleted highlights but their comments are still stored in the data file.": "Remove highlights and comments that no longer exist in your documents. This is useful if you have deleted highlights but their comments are still stored in the data file.",

// Flashcard Settings
    "Flashcard learning": "Flashcard learning",
    "New cards per day": "New cards per day",
    "Maximum number of new cards to learn each day": "Maximum number of new cards to learn each day.",
    "Reviews per day": "Reviews per day",
    "Maximum number of cards to review each day": "Maximum number of cards to review each day.",
    "Target retention": "Target retention",
    "Target memory retention rate (0.8 = 80%)": "Target memory retention rate (0.8 = 80%).",
    "Maximum interval": "Maximum interval",
    "Maximum interval in days between reviews": "Maximum interval in days between reviews.",
    "Reset daily stats": "Reset daily stats",
    "Reset today's learning statistics": "Reset today's learning statistics.",
    "Reset": "Reset",
    "Daily statistics have been reset": "Daily statistics have been reset",
    "No statistics to reset for today": "No statistics to reset for today",
    "Advanced": "Advanced",
    "These settings control the FSRS algorithm parameters. Only change them if you understand the algorithm.": "These settings control the FSRS algorithm parameters. Only change them if you understand the algorithm.",
    "Reset algorithm parameters": "Reset algorithm parameters",
    "Reset the FSRS algorithm parameters to default values": "Reset the FSRS algorithm parameters to default values.",
    "Reset to Default": "Reset to default",
    "FSRS parameters have been reset to default values": "FSRS parameters have been reset to default values.",
    "days": "days",
    
    // Flashcard UI
    "Activate HiCard": "Activate HiCard",
    "Enter your license key to activate HiCard feature.": "Enter your license key to activate HiCard feature.",
    "Enter license key": "Enter license key",
    "Activate": "Activate",
    "Please enter a license key": "Please enter a license key",
    "HiCard activated successfully!": "HiCard activated successfully!",
    "Invalid license key": "Invalid license key",
    "Use global settings": "Use global settings",
    "New cards per day:": "New cards per day:",
    "Reviews per day:": "Reviews per day:",
    "All cards": "All cards",
    "Due Today": "Due today",
    "New Cards": "New cards",
    "Learned": "Learned",
    "Create Group": "Create group",
    "Group name": "Group name",
    "Create": "Create",
    "Again": "Again",
    "Hard": "Hard",
    "Good": "Good",
    "Easy": "Easy",
    "Card": "Card",
    "of": "of",
    "Settings": "Settings",
    "Are you sure you want to delete this group?": "Are you sure you want to delete this group?",
    "Yes": "Yes",
    "No": "No",
    "You've completed All cards for today!": "You've completed All cards for today!",
    "No cards available.": "No cards available.",
    "Return to First Card": "Return to First Card",
    "Edit Group": "Edit group",
    "Create New Group": "Create new group",
    "Group Name": "Group name",
    "Please fill in all fields": "Please fill in all fields",
    "Saving...": "Saving...",
    "Creating...": "Creating...",
    "Group updated successfully": "Group updated successfully",
    "Failed to update group": "Failed to update group",
    "Group created successfully": "Group created successfully",
    "Failed to create or update group": "Failed to create or update group",
    "Due": "Due",
    "New": "New",
    "Review": "Review",
    "Retention": "Retention",
    "Limits:": "Limits:",
    "每日学习限制\n": "Daily learning limits\n",
    "新卡片:": "New cards:",
    "复习卡片:": "Review cards:",
    "学习完成！": "Learning completed!",
    "返回第一张卡片": "Return to first card",
    "您今天的新卡片学习配额已用完！明天再来学习吧。": "You've reached your daily quota for new cards! Come back tomorrow.",
    "您今天的复习配额已用完！明天再来复习吧。": "You've reached your daily quota for reviews! Come back tomorrow.",
    "您今天在 \"": "You've reached your daily quota in \"",
    "\" 分组的新卡片学习配额已用完！明天再来学习吧。": "\" group for new cards! Come back tomorrow.",
    "\" 分组的复习配额已用完！明天再来复习吧。": "\" group for reviews! Come back tomorrow.",
    "恭喜！您已完成 \"": "Congratulations! You've completed All cards in \"",
    "\" 中的所有卡片学习。": "\" group.",
    "确定要删除分组 \"": "Are you sure you want to delete group \"",
    "\" 吗？": "\"?",
    "分组删除成功": "Group deleted successfully",
    "删除分组失败": "Failed to delete group",
    "支持以下格式：\n- 文件夹：folder1, folder1/folder2\n- 笔记：[[note1]], [[note2]]\n- 标签：#tag1, #tag2\n- 通配符：*.excalidraw.md\n- 内容：直接输入要搜索的文本": "Supports the following formats:\n- Folders: folder1, folder1/folder2\n- Notes: [[note1]], [[note2]]\n- Tags: #tag1, #tag2\n- Wildcards: *.excalidraw.md\n- Content: directly enter text to search for",
    "反转卡片（使用评论作为问题）": "Reverse cards (use comments as questions)",
    "Learning settings": "Learning settings",
    "记忆保持率 = (总复习次数 - 遗忘次数) / 总复习次数\n该指标反映了你的学习效果，越高说明记忆效果越好": "Memory retention = (total reviews - forgotten reviews) / total reviews\nThis metric reflects your learning effectiveness. Higher means better memory retention",

// 其他

    "Open (DoubleClick)": "Open (double-click)"

};

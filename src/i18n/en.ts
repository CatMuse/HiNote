export default {

//通用翻译

    "Ollama (Local)": "Ollama (local)",
    "Model": "Model",
    "Save": "Save",
    "Cancel": "Cancel",
    "Edit": "Edit",
    "Delete": "Delete",
    "Custom Model": "Custom model",
    "Checking...": "Checking...",
  
//AI 通用

    "Select the AI service provider": "Select the AI service provider.",
    "API Key": "API key",  
    "Please enter your API Key.": "Please enter your API key.",
    "API Key is valid!": "API Key is valid!",
    "API Key and model available.": "API Key and model available.",
    "Invalid API Key or server error. Please verify your API Key.": "Invalid API Key or server error. Please verify your API Key.",
    "Select a model or enter a custom one.": "Select a model or enter a custom one.",
    "Provider URL": "Provider URL",
    "Leave it blank, unless you are using a proxy.": "Leave it blank, unless you are using a proxy.",
    "Please enter an API Key first": "Please enter an API Key first.",
    "Custom model unavailable. Please check the model ID and your access permissions.": "Custom model unavailable. Please check the model ID and your access permissions.",

//OpenAI 设置

    "OpenAI service": "OpenAI service",
    "No models available. Please check your API Key.": "No models available. Please check your API Key.",

//Anthropic 设置

    "Anthropic service": "Anthropic service",
    "Model ID can only contain letters, numbers, underscores, dots and hyphens.": "Model ID can only contain letters, numbers, underscores, dots and hyphens.",

//Gemini 设置

    "Unable to create model selection dropdown menu.": "Unable to create model selection dropdown menu.",
    "Gemini service": "Gemini service",

//Deepseek 设置

    "Deepseek service": "Deepseek service",

//Ollama 设置

    "Ollama service": "Ollama service",
    "Ollama server URL (default: http://localhost:11434)": "Ollama server URL (default: http://localhost:11434)",
    "Check": "Check",
    "Server URL": "Server URL",
    "Successfully connected to Ollama service": "Successfully connected to Ollama service.",
    "No models found. Please download models using ollama": "No models found. Please download models using ollama.",
    "Could not connect to Ollama service": "Could not connect to Ollama service",
    "Failed to connect to Ollama service. Please check the server URL.": "Failed to connect to Ollama service. Please check the server URL.",
    "Currently selected model (Test connection to see all available models)": "Currently selected model (Test connection to see all available models)",
    "Select a Ollama model.": "Select a Ollama model.",
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
    "Tab AI, Shift + Enter Wrap, Enter Save": "Tab AI, Shift + Enter Wrap, Enter Save",
    "Please enter AI instruction": "Please enter AI instruction",
    "AI response generated": "AI response generated",
    "AI generation failed": "AI generation failed",
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
    "Show Comment Widget": "Show comment widget",
    "Show or hide the comment widget next to highlights. Disabling this can reduce visual clutter while reading.": "Show or hide the comment widget next to highlights. Disabling this can reduce visual clutter while reading.",
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
    "Create Group": "Create group",
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
    "Please fill in all fields": "Please fill in all fields",
    "Saving...": "Saving...",
    "Creating...": "Creating...",
    "Group updated successfully": "Group updated successfully",
    "Failed to update group": "Failed to update group",
    "Group created successfully": "Group created successfully",
    "Failed to create or update group": "Failed to create or update group",
    "Retention": "Retention",
    "Limits:": "Limits:",
    "Learning completed!": "Learning completed!",
    "Group deleted": "Group deleted",
    
    // 搜索前缀提示
    "search-prefix-all": "match all file highlights",
    "search-prefix-hicard": "match flashcards only",
    "search-prefix-comment": "match with comments only",
    "search-prefix-path": "match path of the file",

// 其他

    "Open (DoubleClick)": "Open (double-click)"

};

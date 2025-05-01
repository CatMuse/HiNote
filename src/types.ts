export interface CommentItem {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

export interface HighlightInfo {
    id?: string;
    text: string;          // 只保留高亮的文本内容
    position?: number;     // 修改为可选
    paragraphOffset?: number;  // 修改为可选
    blockId?: string;     // 纯 BlockID，不包含文件路径
    paragraphId?: string;  // 兼容旧数据，将被 blockId 替代
    backgroundColor?: string;
    comments?: CommentItem[];
    createdAt?: number;
    updatedAt?: number;
    fileName?: string;
    filePath?: string;
    fileIcon?: string;
    isVirtual?: boolean;  // 标记是否为虚拟高亮
    displayText?: string; // 显示给用户看的文本
    timestamp?: number;   // 添加时间戳
    fileType?: string;    // 文件类型
    originalLength?: number;  // 原始匹配文本的长度，包括标签
    isCloze?: boolean;    // 标记是否为挖空格式
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'deepseek' | 'siliconflow';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini';
export type AnthropicModel = 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307' | 'claude-2' | 'claude-instant-1';

export interface AIModel {
    id: string;
    name: string;
    isCustom?: boolean;
}

export interface DeepseekModel extends AIModel {}

export interface DeepseekModelState {
    selectedModel: DeepseekModel;
    apiKey: string;
}

export const DEFAULT_DEEPSEEK_MODELS: DeepseekModel[] = [
    { id: 'deepseek-chat', name: 'Deepseek Chat' },
    { id: 'deepseek-reasoner', name: 'Deepseek Reasoner' }
];

export interface GeminiModel extends AIModel {}

export interface GeminiModelState {
    selectedModel: GeminiModel;
    apiKey: string;
}

export const DEFAULT_GEMINI_MODELS: GeminiModel[] = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-lite-preview-02-05', name: 'Gemini 2.0 Flash Lite' }
];

export interface AISettings {
    provider: AIProvider;
    openai?: {
        apiKey: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    siliconflow?: {
        apiKey: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    anthropic?: {
        apiKey: string;
        model: string;
        availableModels?: string[];
        apiAddress?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    ollama?: {
        host: string;
        model: string;
        availableModels?: string[];
    };
    gemini?: {
        apiKey: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
    };
    deepseek?: {
        apiKey: string;
        model: string;
        baseUrl?: string;
        isCustomModel?: boolean;
        lastCustomModel?: string;
    };
    prompts: {
        [key: string]: string;
    };
}

export interface FlashcardLicense {
    key: string;
    token: string;
    features: string[];
}

export interface PluginSettings extends HighlightSettings {
    ai: AISettings;
    comments?: Record<string, Record<string, HighlightInfo>>;
    fileComments?: Record<string, FileComment[]>;
    'flashcard-license'?: FlashcardLicense;
}

export interface FileComment {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    filePath: string;
}

export const DEFAULT_SILICONFLOW_MODELS: AIModel[] = [
    { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', isCustom: false },
    { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5 7B', isCustom: false },
    { id: 'Qwen/Qwen2.5-14B-Instruct', name: 'Qwen2.5 14B', isCustom: false },
    { id: 'Pro/Qwen/Qwen2-7B-Instruct', name: 'Qwen2 7B', isCustom: false },
    { id: 'Pro/THUDM/glm-4-9b-chat', name: 'GLM-4 9B', isCustom: false },
    { id: 'google/gemma-2-9b-it', name: 'Gemma2 9B', isCustom: false },
];

export const DEFAULT_SETTINGS: PluginSettings = {
    excludePatterns: '',  // 默认不排除任何文件
    useCustomPattern: false,
    regexRules: [
        {
            id: 'default-md',
            name: '默认Markdown高亮',
            pattern: '==\\s*([\\s\\S]*?)\\s*==',
            color: '#ffeb3b',
            enabled: true
        },
        {
            id: 'default-mark',
            name: 'HTML Mark标签',
            pattern: '<mark[^>]*>([\\s\\S]*?)</mark>',
            color: '#ffeb3b',
            enabled: true
        },
        {
            id: 'default-span',
            name: 'HTML Span标签',
            pattern: '<span[^>]*>([\\s\\S]*?)</span>',
            color: '#ffeb3b',
            enabled: true
        }
    ],
    ai: {
        provider: 'ollama',
        ollama: {
            host: 'http://localhost:11434',
            model: ''
        },
        gemini: {
            apiKey: '',
            model: 'gemini-pro',
            baseUrl: '',
            isCustomModel: false
        },
        openai: {
            apiKey: '',
            model: 'gpt-4o',
            baseUrl: ''
        },
        anthropic: {
            apiKey: '',
            model: 'claude-2',
            apiAddress: '',
            isCustomModel: false,
            lastCustomModel: ''
        },
        deepseek: {
            apiKey: '',
            model: 'deepseek-chat',
            baseUrl: ''
        },
        prompts: {
            '🤔 Key Insight': '{{highlight}}.Please reinterpret the above content from a fresh perspective and summarize its core idea within 200 characters.'
        }
    },
    export: {
        exportPath: ''  // 默认为空，表示保存在 vault 根目录
    }
};

// 添加自定义事件类型
export interface CommentUpdateEvent {
    fileId: string;
    highlightId: string;
    text: string;
    comments: CommentItem[];
}

export interface ChatMessageState {
    type: 'user' | 'assistant' | 'preview';
    content: string;
    previewCards?: {
        text: string;
        createdAt: number;
        updatedAt: number;
        paragraphId: string;
        position: number;
        paragraphOffset: number;
    }[];
}

export interface ChatViewState {
    chatHistory: { role: "user" | "assistant", content: string }[];
    draggedContents: HighlightInfo[];
    currentPreviewContainer: boolean;
}

declare global {
    interface WindowEventMap {
        'comment-updated': CustomEvent<CommentUpdateEvent>;
    }
}

// 正则表达式规则
export interface RegexRule {
  id: string;         // 唯一标识符
  name: string;       // 规则名称
  pattern: string;    // 正则表达式
  color: string;      // 高亮颜色
  enabled: boolean;   // 是否启用
}

export interface HighlightSettings {
  export: {
    exportPath: string;
    exportTemplate?: string;
  };
  excludePatterns: string;
  useCustomPattern: boolean;
  regexRules: RegexRule[];   // 正则表达式规则数组
}
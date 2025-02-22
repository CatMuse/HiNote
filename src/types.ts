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
    paragraphId?: string;  // 使用 paragraphId 来引用段落
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
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'deepseek';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini';
export type AnthropicModel = 'claude-2' | 'claude-instant-1';

export interface DeepseekModel {
    id: string;
    name: string;
    isCustom?: boolean;
}

export interface DeepseekModelState {
    selectedModel: DeepseekModel;
    apiKey: string;
}

export const DEFAULT_DEEPSEEK_MODELS: DeepseekModel[] = [
    { id: 'deepseek-chat', name: 'Deepseek Chat' },
    { id: 'deepseek-reasoner', name: 'Deepseek Reasoner' }
];

export interface GeminiModel {
    id: string;
    name: string;
    isCustom?: boolean;
}

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
        model: OpenAIModel;
        baseUrl?: string;
    };
    anthropic?: {
        apiKey: string;
        model: AnthropicModel;
        availableModels?: string[];
        baseUrl?: string;
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

export interface PluginSettings extends HighlightSettings {
    ai: AISettings;
    comments?: Record<string, Record<string, HighlightInfo>>;
    fileComments?: Record<string, FileComment[]>;
}

export interface FileComment {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    filePath: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    excludePatterns: '',  // 默认不排除任何文件
    useCustomPattern: false,
    highlightPattern: '==\\s*(.*?)\\s*==|<mark[^>]*>(.*?)<\/mark>|<span[^>]*>(.*?)<\/span>',
    defaultHighlightColor: '#ffeb3b',
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
            baseUrl: ''
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

export interface HighlightSettings {
    export: {
        exportPath: string;
    };
    excludePatterns: string;
    useCustomPattern: boolean;
    highlightPattern: string;
    defaultHighlightColor: string;
}
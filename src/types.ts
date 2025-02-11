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
export type DeepseekModel = 'deepseek-chat' | 'deepseek-coder';

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
    };
    deepseek?: {
        apiKey: string;
        model: DeepseekModel;
        baseUrl?: string;
    };
    prompts: {
        [key: string]: string;
    };
}

export interface PluginSettings {
    ai: AISettings;
    export: {
        exportPath: string;  // 导出路径，相对于 vault 根目录
    };
    excludePatterns?: string;  // 排除高亮的文件或格式列表（逗号分隔）
    useCustomPattern: boolean;  // 是否使用自定义正则表达式
    highlightPattern: string;   // 自定义的高亮文本提取正则表达式
    defaultHighlightColor: string;  // 默认的高亮颜色
    comments?: Record<string, Record<string, HighlightInfo>>;
    fileComments?: Record<string, FileComment[]>;
    // ... 其他插件设置
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
        provider: 'ollama',  // 默认使用 ollama，但会被用户的选择覆盖
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
        gemini: {
            apiKey: '',
            model: 'gemini-pro',
            baseUrl: ''
        },
        ollama: {
            host: 'http://localhost:11434',
            model: 'qwen2.5:14b'
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
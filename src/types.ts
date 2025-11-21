// 导入 AI 相关类型
import type { AIModel as AIModelBase, AIProviderType, AIMessage } from './services/ai';

// 重新导出，保持向后兼容
export type { AIModelBase as AIModel, AIProviderType, AIMessage };

export interface CommentItem {
    id: string;
    content: string;
    createdAt: number;
    updatedAt: number;
}

export interface HighlightInfo {
    // 核心字段
    id: string;                    // 高亮的唯一ID（必填）
    text: string;                  // 高亮的文本内容（必填）
    createdAt: number;             // 创建时间（必填）
    updatedAt: number;             // 最后更新时间（必填）
    comments: CommentItem[];       // 评论列表（必填，可为空数组）
    
    // 位置相关字段
    position: number;              // 文本位置（必填）
    paragraphOffset?: number;      // 段落偏移量（可选）
    blockId?: string;              // 纯 BlockID，不包含文件路径（可选）
    paragraphId?: string;          // 兼容旧数据，将被 blockId 替代（可选）
    
    // 文件相关字段
    filePath?: string;             // 文件路径（可选）
    fileName?: string;             // 文件名（可选）
    fileIcon?: string;             // 文件图标（可选）
    fileType?: string;             // 文件类型（可选）
    
    // 显示相关字段
    backgroundColor?: string;      // 背景颜色（可选）
    displayText?: string;          // 显示给用户看的文本（可选）
    originalLength?: number;       // 原始匹配文本的长度，包括标签（可选）
    
    // 标记字段
    isVirtual?: boolean;           // 标记是否为虚拟高亮（可选）
    isCloze?: boolean;             // 标记是否为挖空格式（可选）
    isGlobalSearch?: boolean;      // 标记是否为全局搜索结果（可选）
    isFromCanvas?: boolean;        // 标记是否来自 Canvas 文件（可选）
    
    // Canvas 相关字段
    canvasSource?: string;         // Canvas 文件的路径（可选）
    
    // 时间戳（兼容字段）
    timestamp?: number;            // 添加时间戳（可选，与 createdAt 重复）
}

export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'deepseek' | 'siliconflow' | 'custom';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-o1';
export type AnthropicModel = 'claude-opus-4-1-20250805' | 'claude-opus-4-20250514' | 'claude-sonnet-4-20250514' | 'claude-3-7-sonnet-20250219' | 'claude-3-5-haiku-20241022' | 'claude-3-haiku-20240307';

export interface DeepseekModel extends AIModelBase {}

export interface DeepseekModelState {
    selectedModel: DeepseekModel;
    apiKey: string;
}

export const DEFAULT_DEEPSEEK_MODELS: DeepseekModel[] = [
    { id: 'deepseek-chat', name: 'Deepseek Chat' },
    { id: 'deepseek-reasoner', name: 'Deepseek Reasoner' }
];

export interface SiliconFlowModel extends AIModelBase {}

export interface GeminiModel extends AIModelBase {}

export interface GeminiModelState {
    selectedModel: GeminiModel;
    apiKey: string;
}

export const DEFAULT_GEMINI_MODELS: GeminiModel[] = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Legacy)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Legacy)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Legacy)' }
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
    custom?: {
        name: string;              // 自定义服务商名称
        apiKey: string;            // API Key
        baseUrl: string;           // API 端点 URL
        model: string;             // 模型名称
        detectedApiType?: 'openai' | 'anthropic' | 'gemini';  // 自动检测的 API 类型
        headers?: Record<string, string>;  // 可选的自定义请求头
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
    'flashcard-license'?: FlashcardLicense;
    contextOptions?: {
        strategy: 'paragraph' | 'section' | 'surrounding' | 'smart';
        surroundingLines?: number;
        includeTitle?: boolean;
        maxLength?: number;
    };
    showCommentWidget?: boolean;
}

// FileComment 接口已移除

export const DEFAULT_SILICONFLOW_MODELS: AIModelBase[] = [
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
            name: 'Default Highlight',
            pattern: '==([^=\\n](?:[^=\\n]|=[^=\\n])*?[^=\\n])==',
            color: '#ffeb3b',
            enabled: true
        },
        {
            id: 'default-mark',
            name: 'Mark format',
            pattern: '<mark[^>]*>([\\s\\S]*?)</mark>',
            color: '#ffeb3b',
            enabled: true
        },
        {
            id: 'default-span',
            name: 'Span format',
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
        siliconflow: {
            apiKey: '',
            model: DEFAULT_SILICONFLOW_MODELS[0].id,
            baseUrl: '',
            isCustomModel: false,
            lastCustomModel: ''
        },
        prompts: {
            '🤔 Key Insight': '{{highlight}}.Please reinterpret the above content from a fresh perspective and summarize its core idea within 200 characters.'
        }
    },
    export: {
        exportPath: ''  // 默认为空，表示保存在 vault 根目录
    },
    contextOptions: {
        strategy: 'smart',
        includeTitle: true,
        maxLength: 2000,
        surroundingLines: 3
    },
    showCommentWidget: true
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
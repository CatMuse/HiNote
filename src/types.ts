import { CommentItem } from './CommentStore';

export interface HighlightInfo {
    text: string;
    position: number;
    paragraphOffset?: number;
    paragraphText?: string;
    comments?: CommentItem[];
    id?: string;
    createdAt?: number;
    updatedAt?: number;
}

export type AIProvider = 'openai' | 'anthropic' | 'ollama';
export type OpenAIModel = 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4';
export type AnthropicModel = 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku';
export type OllamaModel = 'llama3.2' | 'qwen2.5:14b' | 'mixtral' | 'phi';

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
    };
    ollama?: {
        host: string;
        model: OllamaModel;
    };
    prompts: {
        [key: string]: string;
    };
}

export interface PluginSettings {
    ai: AISettings;
    // ... 其他插件设置
}

export const DEFAULT_SETTINGS: PluginSettings = {
    ai: {
        provider: 'ollama',
        openai: {
            apiKey: '',
            model: 'gpt-4o'
        },
        ollama: {
            host: 'http://localhost:11434',
            model: 'llama2'
        },
        prompts: {
            '总结评论': `请帮我总结和分析以下高亮内容及其相关评论：

高亮内容：
{{highlight}}

相关评论：
{{comment}}

请从以下几个方面进行分析：
1. 高亮内容的核心观点
2. 评论的主要见解和补充
3. 综合建议和启示

请以结构化的方式组织回答。`
        }
    }
};

// 添加自定义事件类型
export interface CommentUpdateEvent {
    fileId: string;
    highlightId: string;
    text: string;
    comments: CommentItem[];
}

declare global {
    interface WindowEventMap {
        'comment-updated': CustomEvent<CommentUpdateEvent>;
    }
} 
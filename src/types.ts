import { CommentItem } from './CommentStore';

export interface HighlightInfo {
    id?: string;
    text: string;
    position: number;
    comments?: CommentItem[];
    createdAt?: number;
    updatedAt?: number;
}

export type AIProvider = 'openai' | 'anthropic' | 'ollama';
export type OpenAIModel = 'gpt-3.5-turbo' | 'gpt-4' | 'gpt-4-turbo-preview';
export type AnthropicModel = 'claude-3-opus' | 'claude-3-sonnet' | 'claude-3-haiku';
export type OllamaModel = 'llama2' | 'mistral' | 'mixtral' | 'phi';

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
        provider: 'openai',
        openai: {
            apiKey: '',
            model: 'gpt-3.5-turbo',
        },
        prompts: {
            '分析要点': `作为一个知识助手，请帮我分析和理解以下高亮内容，并提供以下几个方面的见解：

1. 核心观点总结
2. 关键概念解释
3. 实践启示或应用建议
4. 相关延伸阅读推荐

高亮内容：
{{text}}

请以简洁清晰的方式组织回答，每个部分使用标题区分。`
        }
    }
}; 
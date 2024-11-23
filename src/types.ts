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
{{highlight}}

请以简洁清晰的方式组织回答，每个部分使用标题区分。`,

            '总结评论': `请帮我总结和分析以下高亮内容及其相关评论：

高亮内容：
{{highlight}}

相关评论：
{{comment}}

请从以下几个方面进行分析：
1. 高亮内容的核心观点
2. 评论的主要见解和补充
3. 综合建议和启示

请以结构化的方式组织回答。`,

            '生成标签': `请为以下高亮内容及其评论生成相关标签：

高亮内容：
{{highlight}}

相关评论：
{{comment}}

要求：
1. 生成3-5个关键词标签
2. 每个标签不超过4个字
3. 标签应涵盖主题、领域、概念等不同维度
4. 使用中文标签

格式：#标签1 #标签2 #标签3`
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
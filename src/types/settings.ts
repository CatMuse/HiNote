import type { AISettings } from './ai';
import type { HighlightInfo, HighlightSettings } from './highlight';
import type { HighlightColor } from '../services/highlight/HighlightColor';

export type SmartHighlightDensity = 'concise' | 'balanced' | 'rich';
export type SmartHighlightPurpose = 'general' | 'study' | 'research' | 'action';

export interface SmartHighlightSettings {
    apiKeySecretId: string;
    model: string;
    density: SmartHighlightDensity;
    purpose: SmartHighlightPurpose;
    color: HighlightColor | null;
}

export interface FlashcardLicense {
    key: string;
    token: string;
    features: string[];
}

export interface PluginSettings extends HighlightSettings {
    ai: AISettings;
    smartHighlight: SmartHighlightSettings;
    comments?: Record<string, Record<string, HighlightInfo>>;
    'flashcard-license'?: FlashcardLicense;
    showCommentWidget?: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    excludePatterns: '',
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
            apiKeySecretId: '',
            model: '',
            baseUrl: '',
            isCustomModel: false
        },
        openai: {
            apiKeySecretId: '',
            model: '',
            baseUrl: ''
        },
        anthropic: {
            apiKeySecretId: '',
            model: '',
            apiAddress: '',
            isCustomModel: false,
            lastCustomModel: ''
        },
        deepseek: {
            apiKeySecretId: '',
            model: '',
            baseUrl: ''
        },
        siliconflow: {
            apiKeySecretId: '',
            model: '',
            baseUrl: '',
            isCustomModel: false,
            lastCustomModel: ''
        },
        prompts: {
            '🤔 Key Insight': '{{highlight}}.Please reinterpret the above content from a fresh perspective and summarize its core idea within 200 characters.'
        }
    },
    smartHighlight: {
        apiKeySecretId: '',
        model: 'jev-1.13.0',
        density: 'balanced',
        purpose: 'general',
        color: null
    },
    export: {
        exportPath: ''
    },
    showCommentWidget: true
};

import { HighlightInfo } from '../../types';

/**
 * 对话视图状态
 */
export interface ChatViewState {
    chatHistory: { role: "user" | "assistant", content: string }[];
    draggedContents: HighlightInfo[];
    currentPreviewContainer: boolean;
}

/**
 * 对话模型状态
 */
export interface ChatModelState {
    provider: string;
    model: string;
}

/**
 * 对话消息
 */
export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

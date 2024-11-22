import { CommentItem } from './CommentStore';

export interface HighlightInfo {
    id?: string;
    text: string;
    position: number;
    comments?: CommentItem[];
    createdAt?: number;
    updatedAt?: number;
} 
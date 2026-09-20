import type { HighlightInfo } from '../../types/highlight';

export type RelatedHighlightRelation =
    'supplement' | 'evidence' | 'contrast' | 'similar' | 'cause' |
    'prerequisite' | 'extension' | 'application' | 'keyword' | 'other';

export interface RelatedHighlightResult {
    highlight: HighlightInfo;
    localScore: number;
    relevanceScore: number;
    noveltyScore?: number;
    finalScore: number;
    relation?: RelatedHighlightRelation;
    confidence?: number;
    relationConfidence?: number;
    aiRanked: boolean;
}

export interface RelatedDocumentProfile {
    title: string;
    headings: string[];
    excerpt: string;
}

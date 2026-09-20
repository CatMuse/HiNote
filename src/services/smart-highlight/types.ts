import type { HighlightColor } from '../highlight/HighlightColor';
import type { SmartHighlightDensity, SmartHighlightPurpose } from '../../types/settings';

export type SmartHighlightCategory =
    'definition' | 'claim' | 'evidence' | 'mechanism' | 'comparison' |
    'conclusion' | 'action' | 'question' | 'expression' | 'other';

export interface HighlightCandidate {
    id: string;
    start: number;
    end: number;
    line: number;
    rawText: string;
    text: string;
    sectionHeading: string;
    before: string;
    after: string;
}

export interface HighlightEvaluation {
    candidate: HighlightCandidate;
    category: SmartHighlightCategory;
    categoryConfidence: number;
    importanceConfidence: number;
    importanceProbabilities: Record<string, number>;
    standaloneProbability: number;
    rank: number;
    selected: boolean;
}

export interface SmartHighlightRequest {
    content: string;
    purpose: SmartHighlightPurpose;
    density: SmartHighlightDensity;
}

export interface SmartHighlightApplyOptions {
    snapshot: string;
    evaluations: HighlightEvaluation[];
    color: HighlightColor | null;
}

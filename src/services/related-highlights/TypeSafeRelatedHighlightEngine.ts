import type { SecretStorage } from 'obsidian';
import { BaseHTTPClient } from '../ai/BaseHTTPClient';
import { readApiKey } from '../ai/AISecrets';
import type { RelatedDocumentProfile, RelatedHighlightRelation, RelatedHighlightResult } from './types';

interface ScoreAnswer { type: 'score'; score?: number; probabilities?: Record<string, number>; confidence?: number }
interface ChoiceAnswer { type: 'choice'; choice: string; confidence?: number; probabilities?: Record<string, number> }
interface Response { answers?: Record<string, ScoreAnswer | ChoiceAnswer> }
const RELATIONS: Record<RelatedHighlightRelation, string> = {
    supplement: 'Adds a useful explanation or missing context.', evidence: 'Provides supporting evidence or an example.',
    contrast: 'Challenges the document or provides a meaningful counterexample.', similar: 'Expresses a closely related idea.',
    cause: 'Has a causal or mechanistic relationship.', prerequisite: 'Provides useful prerequisite knowledge.',
    extension: 'Suggests a worthwhile next direction.', application: 'Shows a practical application.',
    keyword: 'Shares words but has little semantic relationship.', other: 'Another kind of relationship.'
};

export class TypeSafeRelatedHighlightEngine {
    private http = new BaseHTTPClient();
    constructor(private secrets: Pick<SecretStorage, 'getSecret'>, private secretId: string, private model: string) {}

    async rerank(profile: RelatedDocumentProfile, input: RelatedHighlightResult[],
        shouldContinue: () => boolean = () => true): Promise<RelatedHighlightResult[]> {
        const candidates = input.slice(0, 30);
        const batches: RelatedHighlightResult[][] = [];
        for (let index = 0; index < candidates.length; index += 20) batches.push(candidates.slice(index, index + 20));
        const output: RelatedHighlightResult[] = [];
        for (const batch of batches) {
            if (!shouldContinue()) throw new Error('Related-highlight analysis was cancelled.');
            output.push(...await this.rerankBatch(profile, batch));
        }
        return output.sort((a, b) => b.finalScore - a.finalScore);
    }

    private async rerankBatch(profile: RelatedDocumentProfile, batch: RelatedHighlightResult[]): Promise<RelatedHighlightResult[]> {
        const questions: Record<string, unknown> = {};
        batch.forEach((_item, index) => {
            const target = `\`candidates[${index}]\``;
            questions[`relevance_${index}`] = {
                type: 'score', instructions: `How semantically useful is ${target} while reading \`current_document\`?`,
                criteria: ['Unrelated or only accidental word overlap.', 'Some shared topic but limited reading value.',
                    'Clearly related and useful alongside the document.', 'Directly relevant and highly valuable in this reading context.']
            };
            questions[`novelty_${index}`] = {
                type: 'score', instructions: `How much new information does ${target} add beyond \`current_document\`?`,
                criteria: ['Adds no meaningful new information.', 'Adds a somewhat distinct detail, example, or angle.',
                    'Adds a genuinely new and useful insight.']
            };
            questions[`relation_${index}`] = {
                type: 'choice', instructions: `What is the primary relationship between ${target} and \`current_document\`?`, criteria: RELATIONS
            };
        });
        const response = await this.request({
            state: {
                current_document: profile,
                candidates: batch.map(item => ({ source: item.highlight.fileName, text: item.highlight.text.slice(0, 1200),
                    comments: (item.highlight.comments || []).slice(0, 3).map(comment => comment.content.slice(0, 500)) }))
            }, model: this.model, questions
        });
        const answers = response.answers || {};
        return batch.map((item, index) => {
            const relevance = answers[`relevance_${index}`];
            const novelty = answers[`novelty_${index}`];
            const relation = answers[`relation_${index}`];
            if (relevance?.type !== 'score' || novelty?.type !== 'score' || relation?.type !== 'choice') {
                throw new Error('TypeSafe returned an incomplete related-highlight response.');
            }
            const ai = this.normalizedScore(relevance, 3);
            const noveltyScore = this.normalizedScore(novelty, 2);
            const selectedRelation = Object.prototype.hasOwnProperty.call(RELATIONS, relation.choice)
                ? relation.choice as RelatedHighlightRelation : 'other';
            const relationPenalty = selectedRelation === 'keyword' ? 0.45 : 1;
            const confidence = this.combineConfidence(relevance.confidence, relation.confidence);
            return { ...item, relevanceScore: ai, noveltyScore, confidence,
                relationConfidence: relation.confidence, finalScore: (item.localScore * 0.2 + ai * 0.6 + noveltyScore * 0.2) * relationPenalty,
                relation: selectedRelation, aiRanked: true };
        });
    }

    private normalizedScore(answer: ScoreAnswer, maximum: number): number {
        if (typeof answer.score === 'number') return Math.max(0, Math.min(1, answer.score / maximum));
        const probabilities = answer.probabilities || {};
        return Math.max(0, Math.min(1, Object.entries(probabilities)
            .reduce((sum, [level, probability]) => sum + Number(level) * probability, 0) / maximum));
    }

    private combineConfidence(relevance?: number, relation?: number): number | undefined {
        if (typeof relevance !== 'number' && typeof relation !== 'number') return undefined;
        return (typeof relevance === 'number' ? relevance * 0.7 : 0) + (typeof relation === 'number' ? relation * 0.3 : 0);
    }

    private request(body: unknown): Promise<Response> {
        return this.http.request<Response>({ url: 'https://api.typesafe.ai/v1/systemone', method: 'POST', timeout: 45000,
            headers: BaseHTTPClient.buildAuthHeaders(readApiKey(this.secrets, this.secretId)), body: JSON.stringify(body) });
    }
}

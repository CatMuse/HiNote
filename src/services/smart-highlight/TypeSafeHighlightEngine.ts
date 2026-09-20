import type { SecretStorage } from 'obsidian';
import { BaseHTTPClient } from '../ai/BaseHTTPClient';
import { readApiKey } from '../ai/AISecrets';
import type { SmartHighlightDensity, SmartHighlightPurpose } from '../../types/settings';
import type { HighlightCandidate, HighlightEvaluation, SmartHighlightCategory } from './types';

interface ChoiceAnswer {
    type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number>;
}
interface ScoreAnswer {
    type: 'score'; score: number; confidence: number; probabilities: Record<string, number>;
}
interface NoulAnswer { type: 'noul'; noul: number }
type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;
interface TypeSafeResponse { answers?: Record<string, Answer>; model?: string }

const PURPOSES: Record<SmartHighlightPurpose, string> = {
    general: 'Preserve the ideas a careful reader needs to understand the section.',
    study: 'Preserve definitions, mechanisms, distinctions, and knowledge worth reviewing later.',
    research: 'Preserve claims, evidence, assumptions, limitations, and conclusions useful for critical analysis.',
    action: 'Preserve decisions, obligations, concrete next steps, constraints, and risks.'
};

const CATEGORIES: Record<SmartHighlightCategory, string> = {
    definition: 'A definition or explanation of a concept.',
    claim: 'A central claim or important viewpoint.',
    evidence: 'A fact, example, quotation, or evidence supporting a claim.',
    mechanism: 'A cause, reason, process, or mechanism.',
    comparison: 'A meaningful contrast, distinction, or tradeoff.',
    conclusion: 'A conclusion, implication, or synthesis.',
    action: 'A decision, obligation, instruction, or concrete next step.',
    question: 'A question worth preserving for later thought.',
    expression: 'A particularly memorable or precise expression.',
    other: 'None of the other categories clearly applies.'
};

export class TypeSafeHighlightEngine {
    private readonly http = new BaseHTTPClient();

    constructor(
        private secrets: Pick<SecretStorage, 'getSecret'>,
        private apiKeySecretId: string,
        private model: string
    ) {}

    async evaluate(candidates: HighlightCandidate[], purpose: SmartHighlightPurpose,
        density: SmartHighlightDensity, shouldContinue: () => boolean = () => true): Promise<HighlightEvaluation[]> {
        const batches = this.chunk(candidates, 30, 12000);
        const evaluations: HighlightEvaluation[] = [];
        for (const batch of batches) {
            if (!shouldContinue()) throw new Error('Smart-highlight analysis was cancelled.');
            evaluations.push(...await this.evaluateBatch(batch, purpose));
        }
        this.selectByDensity(evaluations, density);
        return evaluations.sort((a, b) => a.candidate.start - b.candidate.start);
    }

    async testConnection(): Promise<string> {
        const response = await this.request({
            state: 'A short connection test.', model: this.model,
            questions: { relevant: { type: 'noul', instructions: 'Is the provided state understandable natural-language text?' } }
        });
        return response.model || this.model;
    }

    private async evaluateBatch(candidates: HighlightCandidate[], purpose: SmartHighlightPurpose): Promise<HighlightEvaluation[]> {
        const questions: Record<string, unknown> = {};
        candidates.forEach((candidate, index) => {
            const target = `\`candidates[${index}].text\``;
            const goal = PURPOSES[purpose];
            questions[`importance_${index}`] = {
                type: 'score',
                instructions: `How valuable is ${target} to highlight for this reading goal: ${goal}`,
                criteria: [
                    'Do not highlight: boilerplate, transition, repetition, or dispensable detail.',
                    'Helpful background, but removing it would not affect the main understanding.',
                    'Worth highlighting: a useful idea, fact, explanation, distinction, or conclusion.',
                    'Essential: indispensable for understanding this section and the reading goal.'
                ]
            };
            questions[`category_${index}`] = {
                type: 'choice', instructions: `What is the primary role of ${target}?`, criteria: CATEGORIES
            };
            questions[`standalone_${index}`] = {
                type: 'noul',
                instructions: `Can ${target} be understood as a complete and useful highlight with the nearby context in this candidate record?`,
                criteria: {
                    true: 'It is sufficiently complete, specific, and useful when saved as a highlight.',
                    false: 'It is a fragment, transition, reference, or depends too heavily on omitted context.'
                }
            };
        });
        const response = await this.request({
            state: { reading_goal: PURPOSES[purpose], candidates: candidates.map(candidate => ({
                text: candidate.text, section_heading: candidate.sectionHeading,
                previous_line: candidate.before, next_line: candidate.after
            })) },
            model: this.model,
            questions
        });
        const answers = response.answers || {};
        return candidates.map((candidate, index) => this.toEvaluation(candidate, index, answers));
    }

    private toEvaluation(candidate: HighlightCandidate, index: number,
        answers: Record<string, Answer>): HighlightEvaluation {
        const importance = answers[`importance_${index}`];
        const category = answers[`category_${index}`];
        const standalone = answers[`standalone_${index}`];
        if (importance?.type !== 'score' || category?.type !== 'choice' || standalone?.type !== 'noul') {
            throw new Error('TypeSafe returned an incomplete smart-highlight response.');
        }
        const probabilities = importance.probabilities || {};
        const valuable = (probabilities['2'] || 0) + (probabilities['3'] || 0);
        const rank = valuable * (0.55 + 0.45 * standalone.noul) + (probabilities['3'] || 0) * 0.2;
        const selectedCategory = Object.prototype.hasOwnProperty.call(CATEGORIES, category.choice)
            ? category.choice as SmartHighlightCategory : 'other';
        return {
            candidate, category: selectedCategory, categoryConfidence: category.confidence,
            importanceConfidence: importance.confidence, importanceProbabilities: probabilities,
            standaloneProbability: standalone.noul, rank, selected: false
        };
    }

    private selectByDensity(items: HighlightEvaluation[], density: SmartHighlightDensity): void {
        const fraction = density === 'concise' ? 0.06 : density === 'rich' ? 0.22 : 0.12;
        const total = items.reduce((sum, item) => sum + item.candidate.rawText.length, 0);
        const budget = Math.max(80, total * fraction);
        const perLine = new Map<number, number>();
        let used = 0;
        for (const item of [...items].sort((a, b) => b.rank - a.rank)) {
            const useful = (item.importanceProbabilities['2'] || 0) + (item.importanceProbabilities['3'] || 0);
            if (useful < 0.45 || item.standaloneProbability < 0.35) continue;
            const count = perLine.get(item.candidate.line) || 0;
            if (count >= 2 || (used >= budget && items.some(entry => entry.selected))) continue;
            item.selected = true;
            used += item.candidate.rawText.length;
            perLine.set(item.candidate.line, count + 1);
        }
        if (!items.some(item => item.selected) && items.length) {
            [...items].sort((a, b) => b.rank - a.rank)[0].selected = true;
        }
    }

    private chunk(candidates: HighlightCandidate[], maxItems: number, maxChars: number): HighlightCandidate[][] {
        const result: HighlightCandidate[][] = [];
        let current: HighlightCandidate[] = [], chars = 0;
        for (const candidate of candidates) {
            const size = candidate.text.length + candidate.before.length + candidate.after.length;
            if (current.length && (current.length >= maxItems || chars + size > maxChars)) {
                result.push(current); current = []; chars = 0;
            }
            current.push(candidate); chars += size;
        }
        if (current.length) result.push(current);
        return result;
    }

    private request(body: unknown): Promise<TypeSafeResponse> {
        const apiKey = readApiKey(this.secrets, this.apiKeySecretId);
        return this.http.request<TypeSafeResponse>({
            url: 'https://api.typesafe.ai/v1/systemone', method: 'POST', timeout: 45000,
            headers: BaseHTTPClient.buildAuthHeaders(apiKey), body: JSON.stringify(body)
        });
    }
}

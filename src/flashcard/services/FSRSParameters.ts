import { generatorParameters } from 'ts-fsrs';
import { DEFAULT_FSRS_PARAMETERS, FSRSParameters } from '../types/FSRSTypes';

// Match the full historical default, not just its length or trailing zeros.
const LEGACY_DEFAULT_WEIGHTS = [
    0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975,
    0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246,
    1.587, 0.2272, 2.8755, 0, 0, 0, 0
];

export function normalizeFSRSParameters(
    params: FSRSParameters,
    migrateLegacyDefaults = false
): FSRSParameters {
    if (!Number.isFinite(params.request_retention) || params.request_retention <= 0 || params.request_retention >= 1
        || !Number.isInteger(params.maximum_interval) || params.maximum_interval < 1
        || !Number.isInteger(params.newCardsPerDay) || params.newCardsPerDay < 0
        || !Number.isInteger(params.reviewsPerDay) || params.reviewsPerDay < 0
        || !Array.isArray(params.w) || params.w.length !== DEFAULT_FSRS_PARAMETERS.w.length
        || !params.w.every(Number.isFinite)) {
        throw new Error('Invalid flashcard learning parameters');
    }
    const legacy = migrateLegacyDefaults && params.w.every((value, index) => value === LEGACY_DEFAULT_WEIGHTS[index]);
    const normalized = generatorParameters({
        request_retention: params.request_retention,
        maximum_interval: params.maximum_interval,
        w: [...(legacy ? DEFAULT_FSRS_PARAMETERS.w : params.w)],
        enable_fuzz: true,
        enable_short_term: true
    });
    return { ...params, w: [...normalized.w] };
}

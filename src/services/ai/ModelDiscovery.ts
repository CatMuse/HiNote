import { BaseHTTPClient } from './BaseHTTPClient';
import type { AIModel } from './types';

export type AIProtocol = 'openai' | 'anthropic' | 'gemini';

/** Accept an API root or a pasted generation endpoint without duplicating paths. */
export function apiRoot(baseUrl: string, protocol: AIProtocol): string {
    const url = new URL(baseUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('Use an HTTP(S) API base URL without credentials, query parameters or fragments.');
    }
    let path = url.pathname.replace(/\/+$/, '');
    if (protocol === 'openai') path = path.replace(/\/chat\/completions$/, '');
    if (protocol === 'anthropic') {
        path = path.replace(/\/messages$/, '');
        if (!path) path = '/v1';
    }
    if (protocol === 'gemini') {
        path = path.replace(/\/models(?:\/[^/]+:generateContent)?$/, '');
        if (!path) path = '/v1beta';
    }
    return url.origin + path;
}

export async function discoverModels(base: string, protocol: AIProtocol, headers: Record<string, string>): Promise<AIModel[]> {
    const root = apiRoot(base, protocol);
    const client = new BaseHTTPClient();
    const models = new Map<string, AIModel>();
    const deadline = Date.now() + 45000;
    let cursor = '';
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Connection timeout');
        const url = new URL(root + '/models');
        if (protocol === 'anthropic') url.searchParams.set('limit', '1000');
        if (protocol === 'gemini') url.searchParams.set('pageSize', '1000');
        if (cursor) url.searchParams.set(protocol === 'gemini' ? 'pageToken' : 'after_id', cursor);
        const response = await client.request<{
            data?: { id: string; display_name?: string }[];
            models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
            has_more?: boolean; last_id?: string; nextPageToken?: string;
        }>({ url: url.toString(), method: 'GET', headers, timeout: remaining });
        const entries = protocol === 'gemini' ? response.models : response.data;
        if (!Array.isArray(entries)) throw new Error('Invalid model list response');
        if (protocol === 'gemini') {
            for (const model of response.models!) {
                if (model.supportedGenerationMethods && !model.supportedGenerationMethods.includes('generateContent')) continue;
                if (typeof model.name !== 'string') continue;
                const id = model.name.replace(/^models\//, '');
                if (id) models.set(id, { id, name: model.displayName || id });
            }
        } else {
            for (const model of response.data!) {
                if (typeof model.id === 'string' && model.id) models.set(model.id, { id: model.id, name: model.display_name || model.id });
            }
        }
        const next = protocol === 'gemini' ? response.nextPageToken : response.has_more ? response.last_id : '';
        if (!next && response.has_more) throw new Error('Invalid model pagination');
        if (!next) return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
        if (seen.has(next)) throw new Error('Repeated model pagination cursor');
        seen.add(next);
        cursor = next;
    }
    throw new Error('Model list exceeded the page limit. Enter a model ID manually.');
}

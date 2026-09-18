const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto').webcrypto;
const { performance } = require('node:perf_hooks');
const modules = new Map();
class TFile {}
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports, crypto, console, window: { setTimeout, clearTimeout, crypto }, require: name => {
        if (name === 'obsidian') return { TFile, Notice: class {}, normalizePath: s => s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''), moment: { locale: () => 'en' } };
        if (!name.startsWith('.')) return require(name);
        const target = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } }, { filename: file });
    return exports;
}
const { HighlightExtractor } = load('src/services/highlight/HighlightExtractor.ts');
const { HighlightMatcher } = load('src/services/highlight/HighlightMatcher.ts');
const { HighlightRepository } = load('src/repositories/HighlightRepository.ts');
const { HiNoteDataManager } = load('src/storage/HiNoteDataManager.ts');
const { HighlightManager } = load('src/services/HighlightManager.ts');
const { HighlightFlashcardManager } = load('src/views/highlight/flashcards/HighlightFlashcardManager.ts');
const { scanToHighlightView, recordToHighlightView, createHighlightRecord } = load('src/models/HighlightModels.ts');
const { decodeHighlightRecord, encodeHighlightRecord } = load('src/storage/HighlightDataFormat.ts');
const { getHighlightScan } = load('src/services/highlight/HighlightScan.ts');
const { IdGenerator } = load('src/utils/IdGenerator.ts');
const { HIGHLIGHT_SOURCE } = load('src/types/highlight.ts');
const note = path => Object.assign(new TFile(), { path, basename: path.replace(/\.md$/, ''), extension: 'md', stat: { mtime: 1, size: 1 } });
const comment = (id, content = id) => ({ id, content, createdAt: 10, updatedAt: 20 });
function vault(initial = {}) {
    const files = new Map(Object.entries(initial)), dirs = new Set(), writes = [];
    const file = note('note.md');
    const state = { fail: false };
    const app = {
        metadataCache: { getFileCache: () => null },
        vault: {
            getAbstractFileByPath: p => p === file.path ? file : null,
            getMarkdownFiles: () => [file],
            adapter: {
                exists: async p => files.has(p) || dirs.has(p), mkdir: async p => dirs.add(p),
                read: async p => { if (!files.has(p)) throw Error('Missing ' + p); return files.get(p); },
                write: async (p, text) => {
                    if (state.fail && p.startsWith('.hinote/highlights/') && p.endsWith('.json')) throw Error('disk failure');
                    writes.push(p); files.set(p, text);
                },
                remove: async p => files.delete(p),
                list: async p => ({ files: [...files.keys()].filter(f => f.startsWith(p + '/')), folders: [] })
            }
        }
    };
    const disk = new HiNoteDataManager(app);
    const repository = new HighlightRepository(disk);
    const events = { emitCommentUpdate() {}, emitHighlightUpdate() {}, emitFlashcardChanged() {}, emitFavoritesChanged() { state.favoriteEvents = (state.favoriteEvents || 0) + 1; }, emitHighlightDelete() {}, emitCommentDelete() {} };
    const extractor = new HighlightExtractor(app);
    const manager = new HighlightManager(app, repository, events, {
        shouldProcessFile: () => true, extractHighlights: (text, file) => extractor.extractHighlights(text, file)
    });
    return { app, file, files, writes, state, disk, repository, manager, events, extractor };
}
const { HighlightDataService } = load('src/services/highlight/HighlightDataService.ts');
const { CommentService } = load('src/services/comment/CommentService.ts');
const { DataValidator } = load('src/storage/DataValidator.ts');
async function identityAndPersistence() {
    const env = vault();
    const scans = env.extractor.extractHighlights('==same== middle ==same==', env.file);
    const first = scanToHighlightView(scans[0]), anotherView = scanToHighlightView(scans[0]), second = scanToHighlightView(scans[1]);
    await Promise.all([env.manager.setFavorite(first, true, 100), env.manager.setFavorite(anotherView, true, 200), env.manager.setFavorite(second, true, 300)]);
    assert.equal(first.recordId, anotherView.recordId, 'Two views favorite the same source once');
    assert.notEqual(first.recordId, second.recordId, 'Duplicate text occurrences stay distinct');
    assert.equal(anotherView.favoritedAt, 100, 'Repeated favorite preserves sort time');
    assert.equal(env.state.favoriteEvents, 2);
    let records = await new HiNoteDataManager(env.app).getFileHighlights('note.md');
    assert.equal(records.length, 2);
    assert.deepEqual(Array.from(records, r => r.favoritedAt), [100, 300]);
    assert.equal(records[0].comments.length, 0, 'Plain highlights can be favorited without a comment');
    const stale = { ...first, favoritedAt: undefined, comments: [comment('kept')] };
    await env.manager.addHighlight(env.file, stale);
    assert.equal(stale.favoritedAt, 100, 'Stale comment saves preserve persisted favorite state');
    const staleToggle = { ...first, comments: [] };
    await env.manager.setFavorite(staleToggle, false);
    records = await env.repository.getFileHighlights('note.md');
    assert.equal(records[0].comments[0].content, 'kept', 'Unfavorite must not rewrite comments from a stale view');
    assert.equal(records[0].favoritedAt, undefined);
    await env.manager.addHighlight(env.file, stale);
    assert.equal(stale.favoritedAt, undefined, 'A stale favorited view cannot restore a canceled favorite');
    await env.manager.setFavorite(first, true, 100);
    await env.manager.handleFileRename('note.md', 'renamed.md');
    env.file.path = 'renamed.md';
    records = await new HiNoteDataManager(env.app).getFileHighlights('renamed.md');
    assert.equal(records[0].favoritedAt, 100);
    assert.equal(records[0].id, first.recordId);
    console.log('Favorites: distinct occurrences, concurrent first-save, restart, rename and stale comment saves passed.');
}
async function failureAndCleanup() {
    const env = vault();
    const view = scanToHighlightView(env.extractor.extractHighlights('==keep==', env.file)[0]);
    env.state.fail = true;
    await assert.rejects(env.manager.setFavorite(view, true, 100), /disk failure/);
    assert.equal(view.recordId, undefined);
    assert.equal(view.favoritedAt, undefined);
    assert.equal(env.state.favoriteEvents, undefined);
    env.state.fail = false;
    await env.manager.setFavorite(view, true, 100);
    env.state.fail = true;
    await assert.rejects(env.manager.setFavorite(view, false), /disk failure/);
    assert.equal(view.favoritedAt, 100);
    assert.equal(env.manager.findHighlightById(view.id).favoritedAt, 100);
    env.state.fail = false;
    view.comments = [comment('last')];
    await env.manager.addHighlight(env.file, view);
    const plugin = { app: env.app, highlightManager: env.manager, eventManager: env.events,
        fsrsManager: { findCardsBySourceId: () => [], deleteCardsBySourceId: () => 1, cleanupInvalidCardReferences() {} } };
    const comments = new CommentService(env.app, plugin, env.manager);
    await comments.deleteComment({ ...view, favoritedAt: undefined }, 'last');
    assert.equal(env.manager.findHighlightById(view.id).favoritedAt, 100);
    assert.equal(env.manager.findHighlightById(view.id).comments.length, 0);
    const result = await new HighlightFlashcardManager(plugin).deleteFlashcard({ ...view, favoritedAt: undefined, comments: [] }, true);
    assert.equal(result.shouldDeleteHighlight, false, 'Removing the last flashcard retains favorites');
    assert.equal(await env.manager.removeHighlight(env.file, view, true), false, 'Queued cleanup protects favorites');
    await env.manager.setFavorite(view, false);
    await env.manager.setFavorite(view, true, 100); // Undo restores original order.
    assert.equal(view.favoritedAt, 100);
    assert.equal(await env.manager.removeHighlight(env.file, view), true, 'Explicit deletion removes favorites');
    await assert.rejects(env.manager.setFavorite(view, true, 100), /no longer exists/, 'Undo must not resurrect an explicitly deleted highlight');
    assert.equal(DataValidator.sanitizeHighlight({ favoritedAt: Infinity }).favoritedAt, undefined);
    console.log('Favorites: failed writes, last comment/card cleanup, undo and explicit deletion passed.');
}
async function favoriteScope() {
    const env = vault();
    let source = '==older== and ==newer==';
    const scans = env.extractor.extractHighlights(source, env.file);
    const older = scanToHighlightView(scans[0]), newer = scanToHighlightView(scans[1]);
    await env.manager.setFavorite(older, true, 100);
    await env.manager.setFavorite(newer, true, 200);
    const matcher = new HighlightMatcher(() => env.repository);
    let reads = 0, excluded = false;
    env.app.vault.read = async () => { reads++; return source; };
    const service = new HighlightDataService(env.app, {
        shouldProcessFile: () => !excluded,
        extractHighlights: (text, file) => env.extractor.extractHighlights(text, file),
        mergeHighlightsWithComments: (scans, records, file) => matcher.mergeHighlightsWithComments(scans, records, file),
        getAllHighlights() { throw Error('Favorites should not scan unrelated files'); }
    }, env.repository);
    let rows = await service.loadFavoriteHighlights();
    assert.equal(reads, 1);
    assert.deepEqual(Array.from(rows, r => r.text), ['newer', 'older']);
    source = 'prefix '.repeat(100) + source;
    rows = await service.loadFavoriteHighlights();
    assert.equal(rows[0].recordId, newer.recordId);
    assert.equal(rows[0].sourceUnavailable, undefined);
    source = 'temporarily no highlight markers';
    rows = await service.loadFavoriteHighlights();
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.sourceUnavailable));
    excluded = true;
    assert.equal((await service.loadFavoriteHighlights()).length, 0);
    excluded = false;
    env.app.vault.getAbstractFileByPath = () => null;
    rows = await service.loadFavoriteHighlights();
    assert.equal(rows.length, 2, 'A missing source file does not erase a favorite');
    await env.manager.setFavorite(rows[0], false);
    assert.equal((await service.loadFavoriteHighlights()).length, 1, 'Missing sources can still be unfavorited');
    env.app.vault.getAbstractFileByPath = () => env.file;
    source = '==older== and ==newer==';
    rows = await service.loadFavoriteHighlights();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sourceUnavailable, undefined, 'Restoring the source resolves the same favorite');
    console.log('Favorites scope: latest source, ordering, source movement, unlocated snapshots, exclusions and source recovery passed.');
}
(async () => { await identityAndPersistence(); await failureAndCleanup(); await favoriteScope(); })()
    .catch(error => { console.error(error); process.exitCode = 1; });

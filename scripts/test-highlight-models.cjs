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
    const events = { emitCommentUpdate() {}, emitHighlightUpdate() {}, emitFlashcardChanged() {} };
    const extractor = new HighlightExtractor(app);
    const manager = new HighlightManager(app, repository, events, {
        shouldProcessFile: () => true, extractHighlights: (text, file) => extractor.extractHighlights(text, file)
    });
    return { app, file, files, writes, state, disk, repository, manager, events, extractor };
}
async function modelBoundaries() {
    const env = vault();
    const [scan] = env.extractor.extractHighlights('before ==knowledge== after', env.file);
    assert.ok(scan.scanKey.startsWith('scan-'));
    for (const key of ['id', 'comments', 'createdAt', 'recordId']) assert.ok(!(key in scan));
    const view = scanToHighlightView(scan);
    assert.equal(view.id, scan.scanKey);
    assert.equal(view.recordId, undefined);
    assert.equal(env.writes.length, 0, 'Scanning and projecting must not write');
    assert.equal(getHighlightScan({ ...view, isFromCanvas: true }), getHighlightScan(scan));
    assert.ok(!JSON.stringify(view).includes('HiNote source occurrence'));
    await assert.rejects(env.disk.saveFileHighlights(env.file.path, [scan]), /scan or view/);
    await assert.rejects(env.disk.saveFileHighlights(env.file.path, [view]), /scan or view/);
    await assert.rejects(env.repository.saveFileHighlights(env.file.path, [view]), /scan or view/);
    assert.equal(env.writes.length, 0, 'Invalid input must fail before creating mappings');
    view.isGlobalSearch = true; view.canvasSource = 'board.canvas'; view.fileIcon = 'custom';
    view.comments = [comment('user-comment')];
    const stored = await env.manager.addHighlight(env.file, view);
    assert.ok(stored.id.startsWith('highlight-'));
    assert.notEqual(stored.id, scan.scanKey);
    assert.equal(view.recordId, stored.id);
    assert.equal(view.id, stored.id);
    assert.ok(!(HIGHLIGHT_SOURCE in stored));
    for (const key of ['scanKey', 'recordId', 'fileName', 'fileIcon', 'isGlobalSearch', 'isFromCanvas', 'canvasSource', 'isVirtual', 'originalLength']) {
        assert.ok(!(key in stored), key + ' must not enter a saved record');
        assert.ok(!(key in env.repository.getCachedHighlights(env.file.path)[0]), key + ' must not enter cache');
    }
    view.comments[0].content = 'unsaved edit';
    assert.equal(env.repository.getCachedHighlights(env.file.path)[0].comments[0].content, 'user-comment');
    const reloaded = await new HiNoteDataManager(env.app).getFileHighlights(env.file.path);
    assert.equal(reloaded[0].id, stored.id);
    assert.equal(reloaded[0].kind, 'highlight');
    assert.equal(reloaded[0].comments[0].content, 'user-comment');
    const dataPath = env.writes.find(p => p.startsWith('.hinote/highlights/') && p.endsWith('.json'));
    const json = JSON.parse(env.files.get(dataPath));
    assert.equal(json.version, '2.0');
    assert.deepEqual(Object.keys(json.highlights), [stored.id]);
    assert.ok(!JSON.stringify(json).includes('scan-'));
    const writesBeforeDuplicate = env.writes.length;
    await assert.rejects(env.disk.saveFileHighlights(env.file.path, [stored, stored]), /Duplicate/);
    assert.equal(env.writes.length, writesBeforeDuplicate);
    const anchored = { ...stored, blockId: 'known-block', paragraphOffset: 12 };
    const projected = scanToHighlightView(scan, anchored);
    assert.equal(projected.blockId, 'known-block');
    assert.equal(createHighlightRecord(projected, stored.id, env.file.path, 2, stored).blockId, 'known-block');
    console.log('Models: scan/view/record boundaries, zero browsing writes, detached drafts and v2 round-trip passed.');
}
async function firstSaves() {
    const env = vault();
    const [scan] = env.extractor.extractHighlights('before ==knowledge== after', env.file);
    const first = scanToHighlightView(scan), second = { ...scanToHighlightView(scan), isFromCanvas: true };
    first.comments = [comment('first')]; second.comments = [comment('second')];
    await Promise.all([env.manager.addHighlight(env.file, first), env.manager.addHighlight(env.file, second)]);
    const records = await env.repository.getFileHighlights(env.file.path);
    assert.equal(records.length, 1, 'Two first-saves of the same occurrence must share an ID');
    assert.equal(first.recordId, second.recordId);
    assert.equal(records[0].comments.length, 2);
    const id = records[0].id;
    const createdAt = records[0].createdAt;
    const moved = env.extractor.extractHighlights('prefix'.repeat(1000) + 'before ==knowledge== after', env.file);
    const matcher = new HighlightMatcher(() => env.repository);
    const [view] = matcher.mergeHighlightsWithComments(moved, records, env.file);
    assert.equal(view.recordId, id);
    view.comments[0].content = 'updated';
    await env.manager.addHighlight(env.file, view);
    assert.equal((await env.repository.getFileHighlights(env.file.path))[0].id, id);
    assert.equal((await env.repository.getFileHighlights(env.file.path))[0].createdAt, createdAt);
    await env.manager.handleFileRename('note.md', 'renamed.md');
    env.file.path = 'renamed.md'; env.file.basename = 'renamed';
    const afterRename = await new HiNoteDataManager(env.app).getFileHighlights('renamed.md');
    assert.equal(afterRename[0].id, id);
    const [renamedView] = matcher.mergeHighlightsWithComments(env.extractor.extractHighlights('before ==knowledge== after', env.file), afterRename, env.file);
    assert.equal(renamedView.recordId, id);

    const duplicates = vault();
    const scans = duplicates.extractor.extractHighlights('==same== middle ==same==', duplicates.file);
    const views = scans.map(scan => scanToHighlightView(scan));
    views[0].comments = [comment('a')]; views[1].comments = [comment('b')];
    await Promise.all(views.map(view => duplicates.manager.addHighlight(duplicates.file, view)));
    assert.notEqual(views[0].recordId, views[1].recordId);
    assert.equal((await duplicates.repository.getFileHighlights(duplicates.file.path)).length, 2);
    console.log('Identity: concurrent first-saves, distinct occurrences, edits, reload and rename keep the intended IDs.');
}
async function legacyAndFileComments() {
    const id = 'highlight-12345-20';
    const old = { text: 'legacy', position: 20, created: 3, updated: 4, comments: [{ id: 'old-comment', content: 'preserve', created: 1, updated: 2 }] };
    const env = vault({
        '.hinote/metadata/file-mapping.json': JSON.stringify({ version: '2.0', lastUpdated: 1, mapping: { 'note.md': 'legacy.json' } }),
        '.hinote/highlights/legacy.json': JSON.stringify({ version: '2.0', lastModified: 1, highlights: {
            [id]: old, 'file-comment-legacy': { ...old, isVirtual: true, text: 'File Comment' }
        } })
    });
    const records = await env.repository.getFileHighlights('note.md');
    assert.equal(env.writes.length, 0, 'Reading old records must not migrate or rewrite them');
    assert.equal(records[0].id, id);
    assert.equal(records[1].kind, 'file-comment');
    const draft = recordToHighlightView(records[0]);
    draft.comments[0].content = 'edited';
    await env.manager.addHighlight(env.file, draft);
    assert.equal(draft.recordId, id);
    assert.equal(draft.createdAt, 3);
    const writesBeforeCard = env.writes.length;
    const oldCard = { sourceId: id };
    const oldPlugin = {
        app: env.app, highlightManager: env.manager, eventManager: env.events,
        fsrsManager: {
            findCardsBySourceId: sourceId => sourceId === oldCard.sourceId ? [oldCard] : [],
            addCard: () => { throw Error('Existing legacy card must not be recreated'); }
        }
    };
    assert.equal(await new HighlightFlashcardManager(oldPlugin).createFlashcard(draft, undefined, true), true);
    assert.equal(oldCard.sourceId, id);
    assert.equal(env.writes.length, writesBeforeCard);
    const encoded = encodeHighlightRecord(records[1]);
    assert.equal(encoded.isVirtual, true);
    assert.equal(decodeHighlightRecord('file-comment-legacy', encoded, 'note.md').id, 'file-comment-legacy');
    const newComment = { text: 'File Comment', position: 0, isVirtual: true, kind: 'file-comment', comments: [comment('note-comment')] };
    await env.manager.addHighlight(env.file, newComment);
    const uuid = newComment.recordId;
    assert.ok(uuid && uuid !== 'file-comment-legacy');
    const [sameTextHighlight] = new HighlightMatcher().mergeHighlightsWithComments(
        env.extractor.extractHighlights('==File Comment==', env.file), [await env.repository.findHighlightById(uuid)], env.file
    ).filter(view => !view.isVirtual);
    assert.equal(sameTextHighlight.recordId, undefined, 'File comments never bind to equal source text');
    console.log('Compatibility: legacy IDs/timestamps and file-comment kind survive without migration.');
}
async function flashcardAndFailure() {
    const env = vault();
    const cards = [];
    const plugin = {
        app: env.app, highlightManager: env.manager, eventManager: env.events,
        fsrsManager: {
            findCardsBySourceId: id => cards.filter(card => card.sourceId === id),
            addCard: (text, answer, filePath, sourceId) => { const card = { text, answer, filePath, sourceId }; cards.push(card); return card; }
        }
    };
    const flashcards = new HighlightFlashcardManager(plugin);
    const [scan] = env.extractor.extractHighlights('==learn==', env.file);
    const view = scanToHighlightView(scan);
    env.state.fail = true;
    const originalError = console.error;
    try {
        console.error = () => {};
        assert.equal(await flashcards.createFlashcard(view, undefined, true), false);
    } finally { console.error = originalError; }
    assert.equal(view.recordId, undefined);
    assert.equal(view.id, scan.scanKey);
    assert.equal(cards.length, 0, 'Failed source save must never create a linked flashcard');
    env.state.fail = false;
    await Promise.all([flashcards.createFlashcard(view, undefined, true), flashcards.createFlashcard(scanToHighlightView(scan), undefined, true)]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].sourceId, view.recordId);
    const records = await env.repository.getFileHighlights(env.file.path);
    assert.equal(records[0].id, cards[0].sourceId);
    const writes = env.writes.length;
    await flashcards.createFlashcard(view, undefined, true);
    assert.equal(cards.length, 1);
    assert.equal(env.writes.length, writes, 'Existing card identity must not trigger another source write');
    console.log('Flashcards: save-before-link, failure/retry, concurrent creation and repeated creation passed.');
}
function performanceCheck() {
    const env = vault();
    const source = Array.from({ length: 5000 }, (_, i) => `==highlight ${i}==`).join('\n');
    const scans = env.extractor.extractHighlights(source, env.file);
    const records = scans.map((scan, i) => createHighlightRecord({ ...scanToHighlightView(scan), comments: [comment(String(i))] }, 'saved-' + i, env.file.path, 1));
    const matcher = new HighlightMatcher();
    const times = [];
    for (let i = 0; i < 5; i++) {
        const started = performance.now();
        const views = matcher.mergeHighlightsWithComments(scans, records, env.file);
        times.push(performance.now() - started);
        assert.equal(views.length, 5000);
        assert.equal(views[4999].recordId, 'saved-4999');
    }
    times.sort((a, b) => a - b);
    assert.equal(env.writes.length, 0);
    assert.equal(new Set(Array.from({ length: 1000 }, () => IdGenerator.generateHighlightRecordId())).size, 1000);
    console.log(`Model benchmark: match + project 5,000 annotated highlights, median ${times[2].toFixed(1)} ms (no disk/DOM).`);
}
(async () => {
    await modelBoundaries(); await firstSaves(); await legacyAndFileComments(); await flashcardAndFailure(); performanceCheck();
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
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
    }).outputText, { exports, console, window: { setTimeout, clearTimeout }, require: name => {
        if (name === 'obsidian') return { TFile, moment: { locale: () => 'en' } };
        if (name === '../../../services/highlight') return load('src/services/highlight/HighlightCommentResolver.ts');
        if (!name.startsWith('.')) return require(name);
        const target = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } }, { filename: file });
    return exports;
}
const { matchFileHighlights, findStoredHighlightMatch } = load('src/services/highlight/HighlightMatchStrategies.ts');
const { HighlightMatcher } = load('src/services/highlight/HighlightMatcher.ts');
const { HighlightExtractor } = load('src/services/highlight/HighlightExtractor.ts');
const { HighlightRepository } = load('src/repositories/HighlightRepository.ts');
const { HighlightManager } = load('src/services/HighlightManager.ts');
const { getHighlightAnchor } = load('src/repositories/HighlightAnchorPatch.ts');
const { getHighlightScan } = load('src/services/highlight/HighlightScan.ts');
const { HighlightCommentResolver } = load('src/services/highlight/HighlightCommentResolver.ts');
const { PreviewHighlightResolver } = load('src/views/highlight/preview/PreviewHighlightResolver.ts');
const { HighlightIndexer } = load('src/services/highlight/HighlightIndexer.ts');
const { createHighlightRecord } = load('src/models/HighlightModels.ts');
const clone = value => JSON.parse(JSON.stringify(value));
const file = Object.assign(new TFile(), { path: 'note.md', basename: 'note', extension: 'md', stat: { mtime: 1, size: 1 } });
let settings = { useCustomPattern: false, regexRules: [], excludePatterns: '' };
const app = { metadataCache: { getFileCache: () => null }, vault: { getAbstractFileByPath: p => p === file.path ? file : null } };
const extractor = new HighlightExtractor(app, () => settings);
const extract = content => extractor.extractHighlights(content, file);
const comment = content => ({ id: 'comment', content, createdAt: 10, updatedAt: 20 });
const saved = (h, id) => ({ ...createHighlightRecord(h, id, 'note.md', 10), updatedAt: 20, comments: [comment(id)] });
const h = (text, id, before = '', after = '', position = 0) => ({ text, id, contextBefore: before, contextAfter: after, position, syntax: 'markdown' });

function scenarios() {
    const original = extract('序言 ==可持续发展== 后记');
    const records = [saved(original[0], 'permanent-id')];
    const shifted = extract('新增内容'.repeat(2000) + '序言 ==可持续发展== 后记');
    assert.equal(matchFileHighlights(shifted, records).get(shifted[0]).highlight.id, 'permanent-id');
    const changed = extract('序言 ==可持续的发展== 后记');
    assert.equal(matchFileHighlights(changed, records).get(changed[0]).highlight.id, 'permanent-id');
    const recolored = extract('序言 ==🔵可持续发展== 后记');
    assert.equal(matchFileHighlights(recolored, records).get(recolored[0]).highlight.id, 'permanent-id');
    file.path = 'renamed.md';
    const renamed = extract('序言 ==可持续发展== 后记');
    assert.equal(matchFileHighlights(renamed, records).get(renamed[0]).highlight.id, 'permanent-id');
    file.path = 'note.md';

    // Deliberately preserve misleading source-derived IDs while swapping paragraphs.
    const a = h('重复', 'highlight-1-10', '甲'.repeat(40), '乙'.repeat(40), 10);
    const b = h('重复', 'highlight-2-80', '丙'.repeat(40), '丁'.repeat(40), 80);
    const old = [saved(a, a.id), saved(b, b.id)];
    const swapped = [{ ...b, id: a.id, position: 10 }, { ...a, id: b.id, position: 80 }];
    const pairs = matchFileHighlights(swapped, old);
    assert.equal(pairs.get(swapped[0]).highlight.id, b.id);
    assert.equal(pairs.get(swapped[1]).highlight.id, a.id);
    const reversed = matchFileHighlights([...swapped].reverse(), [...old].reverse());
    for (const target of swapped) assert.equal(reversed.get(target).highlight.id, pairs.get(target).highlight.id);
    const copies = [{ ...a }, { ...a, id: 'copy', position: 5000 }];
    assert.equal(matchFileHighlights(copies, [old[0]]).size, 0, 'Identical copied context must not guess');
    const withoutContext = [h('重复', a.id), h('重复', b.id, '', '', 10)];
    assert.equal(matchFileHighlights(withoutContext, withoutContext.map(x => saved(x, x.id))).size, 0);
    const blocks = [h('重复', 'one'), h('重复', 'two')].map((x, i) => ({ ...x, blockId: 'block' + i }));
    assert.equal(matchFileHighlights(blocks, blocks.map(x => saved(x, x.id))).size, 2);
    assert.equal(matchFileHighlights([h('文件评论', 'x')], [{ ...h('文件评论', 'x'), isVirtual: true }]).size, 0);

    // Certain exact pairs win before fuzzy proposals, regardless of input order.
    const certain = h('knowledge', 'certain', 'prefix', 'suffix');
    const edited = h('knowledge!', 'edited', 'prefix', 'suffix');
    const exactFirst = matchFileHighlights([edited, certain], [saved(certain, 'saved')]);
    assert.equal(exactFirst.size, 1);
    assert.ok(exactFirst.has(certain));

    const source = '==重复== ' + '间隔'.repeat(100) + '==重复==';
    const raw = extract(source);
    const stored = [saved(raw[0], 'first'), saved(raw[1], 'second')];
    const repo = { getCachedHighlights: () => stored };
    const resolved = new HighlightCommentResolver(repo).resolveHighlights(file, raw);
    const preview = new PreviewHighlightResolver(repo).enrichHighlightsWithComments(raw, file, source);
    const merged = new HighlightMatcher().mergeHighlightsWithComments(raw, stored, file);
    assert.equal(resolved[0].id, 'first');
    assert.equal(resolved[1].id, 'second');
    assert.equal(JSON.stringify(resolved.map(x => x.id)), JSON.stringify(preview.map(x => x.id)));
    assert.equal(JSON.stringify(merged.map(x => x.id)), JSON.stringify(preview.map(x => x.id)));
    // Filtering must not turn duplicate occurrences into a unique text claim.
    const copiedRaw = extract('相同前文 ==重复== 相同后文\n相同前文 ==重复== 相同后文');
    for (const x of copiedRaw) { x.contextBefore = 'same-before'; x.contextAfter = 'same-after'; }
    const onlyOld = [saved(copiedRaw[0], 'saved-duplicate')];
    assert.equal(findStoredHighlightMatch(copiedRaw[0], onlyOld), null);
    const unresolved = new HighlightMatcher().mergeHighlightsWithComments([copiedRaw[0]], onlyOld, file);
    assert.equal(unresolved[0].comments.length, 0);
    assert.notEqual(unresolved[0].id, onlyOld[0].id, 'New comment must not overwrite an unresolved old ID');
    console.log('Matching: shifts, edits, colors, rename, swapped duplicates, ambiguity, blocks, views and filtered scans passed.');
}

function repository(initial) {
    const disk = new Map([['note.md', clone(initial)]]);
    let writes = 0;
    const data = {
        initialize: async () => {}, getAllHighlightFiles: async () => [...disk.keys()],
        getFileHighlights: async p => clone(disk.get(p) || []),
        saveFileHighlights: async (p, records) => { writes++; disk.set(p, clone(records)); },
        deleteFileHighlights: async p => disk.delete(p),
        handleFileRename: async (from, to) => { disk.set(to, disk.get(from)); disk.delete(from); }
    };
    return { repo: new HighlightRepository(data), disk, writes: () => writes };
}
async function persistence() {
    const original = saved(h('text', 'saved', 'before', 'after'), 'saved');
    const patch = { id: 'saved', expected: getHighlightAnchor(original), anchor: { ...getHighlightAnchor(original), position: 500 } };
    for (const comments of [[comment('new comment')], []]) {
        const { repo } = repository([original]);
        await repo.initialize();
        const save = repo.saveFileHighlights('note.md', [{ ...original, comments, updatedAt: 99 }]);
        const update = repo.patchHighlightAnchors('note.md', [patch], () => true);
        await Promise.all([save, update]);
        const [actual] = await repo.getFileHighlights('note.md');
        assert.equal(JSON.stringify(actual.comments), JSON.stringify(comments));
        assert.equal(actual.updatedAt, 99);
        assert.equal(actual.position, 500);
    }
    for (const action of ['delete', 'rename', 'dispose', 'stale']) {
        const { repo, disk, writes } = repository([original]);
        await repo.initialize();
        let current = true;
        const update = repo.patchHighlightAnchors('note.md', [patch], () => current);
        let operation;
        if (action === 'delete') operation = repo.deleteFileHighlights('note.md');
        if (action === 'rename') operation = repo.handleFileRename('note.md', 'renamed.md');
        if (action === 'dispose') repo.dispose();
        if (action === 'stale') current = false;
        await Promise.all([update, operation]);
        assert.equal(writes(), 0, action + ' must cancel queued anchors');
        if (action === 'delete' || action === 'rename') assert.ok(!disk.has('note.md'));
    }
    const { repo, writes } = repository([original]);
    await repo.initialize();
    await repo.saveFileHighlights('note.md', [{ ...original, text: 'newer text', position: 77 }]);
    await repo.patchHighlightAnchors('note.md', [patch], () => true);
    assert.equal(writes(), 1, 'Old anchor snapshot must not replace newer anchors');
    await repo.saveFileHighlights('note.md', []);
    await repo.patchHighlightAnchors('note.md', [patch], () => true);
    assert.equal((await repo.getFileHighlights('note.md')).length, 0);

    const first = extract('==text==');
    const state = repository([saved(first[0], 'saved')]);
    await state.repo.initialize();
    const current = extract('inserted ==text==');
    const matcher = new HighlightMatcher(() => state.repo);
    matcher.mergeHighlightsWithComments(current, state.repo.getCachedHighlights('note.md'), file);
    // A queue barrier waits for the fire-and-forget anchor write without timers.
    await state.repo.patchHighlightAnchors('note.md', [], () => true);
    assert.equal((await state.repo.getFileHighlights('note.md'))[0].position, 9);
    assert.equal((await state.repo.getFileHighlights('note.md'))[0].updatedAt, 20);
    // Missing extraction metadata must not erase a known paragraph anchor.
    const anchored = (await state.repo.getFileHighlights('note.md')).map(record => ({ ...record, blockId: 'known-block' }));
    await state.repo.saveFileHighlights('note.md', anchored);
    const count = state.writes();
    matcher.mergeHighlightsWithComments(current, state.repo.getCachedHighlights('note.md'), file);
    await state.repo.patchHighlightAnchors('note.md', [], () => true);
    assert.equal(state.writes(), count, 'Repeated rendering must not write unchanged anchors');
    assert.equal((await state.repo.getFileHighlights('note.md'))[0].blockId, 'known-block');
    console.log('Persistence: concurrent comment saves/deletes, rename, unload, stale scans and idempotence passed.');
}

async function scansAndDiagnostics() {
    const raw = extract('==hello==');
    const scan = getHighlightScan(raw[0]);
    assert.ok(scan.isCurrent());
    file.stat.mtime++;
    assert.ok(!scan.isCurrent());
    const next = extract('==hello==');
    settings.useCustomPattern = true;
    assert.ok(!getHighlightScan(next[0]).isCurrent());
    settings.useCustomPattern = false;
    const old = extract('==hello==');
    extract('==new text==');
    assert.ok(!getHighlightScan(old[0]).isCurrent());

    const source = '前文 ==knowledge== 后文';
    const records = [saved(extract(source)[0], 'source')];
    let content = source.replace('knowledge', 'knowledge!');
    const data = repository(records);
    await data.repo.initialize();
    const manager = new HighlightManager({ vault: { ...app.vault, read: async () => content } }, data.repo, {}, {
        shouldProcessFile: () => true, extractHighlights: source => extract(source)
    });
    assert.equal((await manager.checkOrphanedDataCount()).orphanedHighlights, 0);
    content = '';
    assert.equal((await manager.checkOrphanedDataCount()).orphanedHighlights, 1);
    assert.equal(data.writes(), 0, 'Unlocated records are diagnostic, never destructive');
    assert.equal((await data.repo.getFileHighlights('note.md'))[0].comments[0].content, 'source');
    content = source;
    assert.equal((await manager.checkOrphanedDataCount()).orphanedHighlights, 0, 'Undo restores association');

    // The cached index must keep the full scan even when a search returns a subset.
    const indexer = new HighlightIndexer(app, {
        getAllHighlights: async () => [{ file, highlights: extract('==alpha== ==beta==') }],
        clearContentCache: () => {}
    });
    await indexer.buildFileIndex();
    const cache = indexer.getAllHighlightsFromCache();
    assert.equal(getHighlightScan(cache[0]).highlights.length, 2);
    assert.equal(getHighlightScan(cache[1]).highlights[1], cache[1]);
    console.log('Diagnostics: edited/removed/restored text, rule changes, scan provenance and cached index passed.');
}

function benchmark() {
    for (const [name, count, duplicate, ambiguous] of [
        ['unique', 5000, false, false], ['duplicate text / distinct context', 5000, true, false],
        ['identical text and context', 5000, true, true]
    ]) {
        const targets = Array.from({ length: count }, (_, i) => h(duplicate ? 'repeat' : `text-${i}`, `raw-${i}`,
            ambiguous ? 'identical-before' : `before-${i}`, ambiguous ? 'identical-after' : `after-${i}`, i * 50));
        const records = targets.map((x, i) => saved(x, 'saved-' + i));
        const times = [];
        for (let run = 0; run < 5; run++) {
            const started = performance.now();
            const matches = matchFileHighlights(targets, records);
            times.push(performance.now() - started);
            assert.equal(matches.size, ambiguous ? 0 : count);
        }
        times.sort((a, b) => a - b);
        console.log(`Benchmark ${name}: ${count} highlights, median ${times[2].toFixed(1)} ms, max ${times[4].toFixed(1)} ms (matching only).`);
    }
}
(async () => { scenarios(); await persistence(); await scansAndDiagnostics(); benchmark(); })().catch(error => {
    console.error(error); process.exitCode = 1;
});

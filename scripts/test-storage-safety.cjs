const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;
const ts = require('typescript');

const modules = new Map();
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(code, { exports, console, crypto, Date, window: { setTimeout, clearTimeout },
        require: name => {
            if (name === 'obsidian') return { normalizePath: s => s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''), Notice: class {} };
            if (!name.startsWith('.')) return require(name);
            let target = path.resolve(path.dirname(file), name);
            target = fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts');
            return load(target);
        }
    }, { filename: file });
    return exports;
}
function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}
function memoryVault(initial = {}, notes = []) {
    const files = new Map(Object.entries(initial));
    const writes = [];
    const dirs = new Set();
    const adapter = {
        exists: async p => files.has(p) || dirs.has(p),
        mkdir: async p => { dirs.add(p); },
        read: async p => { if (!files.has(p)) throw Error('Missing: ' + p); return files.get(p); },
        write: async (p, content) => { writes.push(p); files.set(p, content); },
        remove: async p => { files.delete(p); },
        list: async p => ({ files: [...files.keys()].filter(f => f.startsWith(p + '/')), folders: [] })
    };
    return { files, writes, app: { vault: { adapter, getMarkdownFiles: () => notes.map(path => ({ path })) } } };
}
const mappingPath = '.hinote/metadata/file-mapping.json';
const highlightDir = '.hinote/highlights/';
const mapping = value => JSON.stringify({ version: '2.0', mapping: value, lastUpdated: 1 });
const highlight = id => ({ id, text: 'text', position: 0, createdAt: 1, updatedAt: 1, comments: [] });

async function storagePaths() {
    const { HiNoteDataManager } = load('src/storage/HiNoteDataManager.ts');
    const vault = memoryVault();
    const manager = new HiNoteDataManager(vault.app);
    await Promise.all([
        manager.saveFileHighlights('a/b.md', [highlight('one')]),
        manager.saveFileHighlights('a_b.md', [highlight('two')])
    ]);
    assert.equal((await manager.getFileHighlights('a/b.md'))[0].id, 'one');
    assert.equal((await manager.getFileHighlights('a_b.md'))[0].id, 'two');
    const paths = JSON.parse(vault.files.get(mappingPath)).mapping;
    assert.notEqual(paths['a/b.md'], paths['a_b.md']);
    const originalData = vault.files.get(highlightDir + paths['a/b.md']);
    await manager.handleFileRename('a/b.md', 'renamed.md');
    assert.equal(JSON.parse(vault.files.get(mappingPath)).mapping['renamed.md'], paths['a/b.md']);
    assert.equal(vault.files.get(highlightDir + paths['a/b.md']), originalData);
    await assert.rejects(manager.handleFileRename('renamed.md', 'a_b.md'), /already has/);
    const restarted = new HiNoteDataManager(vault.app);
    assert.equal((await restarted.getFileHighlights('renamed.md'))[0].id, 'one');

    const legacy = memoryVault({ [mappingPath]: mapping({ 'a/b.md': 'a_b.md.json' }),
        [highlightDir + 'a_b.md.json']: originalData }, ['a/b.md']);
    const compatible = new HiNoteDataManager(legacy.app);
    assert.equal((await compatible.getFileHighlights('a/b.md'))[0].id, 'one');
    await compatible.saveFileHighlights('a_b.md', [highlight('two')]);
    assert.equal(legacy.files.get(highlightDir + 'a_b.md.json'), originalData);

    const duplicate = memoryVault({ [mappingPath]: mapping({ 'a/b.md': 'shared.json', 'a_b.md': 'shared.json' }),
        [highlightDir + 'shared.json']: originalData });
    const blocked = new HiNoteDataManager(duplicate.app);
    await assert.rejects(blocked.getFileHighlights('a/b.md'), /shared legacy/);
    await assert.rejects(blocked.saveFileHighlights('a/b.md', [highlight('overwrite')]), /shared legacy/);
    assert.equal(duplicate.writes.length, 0);

    const recover = memoryVault({ [highlightDir + 'a_b.md.json']: originalData }, ['a/b.md']);
    const recovered = new HiNoteDataManager(recover.app);
    assert.equal((await recovered.getFileHighlights('a/b.md'))[0].id, 'one');
    const ambiguous = memoryVault({ [highlightDir + 'a_b.md.json']: originalData }, ['a/b.md', 'a_b.md']);
    await assert.rejects(new HiNoteDataManager(ambiguous.app).initialize(), /cannot safely recover/);
    assert.equal(ambiguous.writes.length, 0);
    const corrupt = memoryVault({ [mappingPath]: '{broken' });
    await assert.rejects(new HiNoteDataManager(corrupt.app).saveFileHighlights('a.md', [highlight('one')]));
    assert.equal(corrupt.writes.length, 0);
    const blank = memoryVault({ [mappingPath]: mapping({ 'empty.md': 'empty.md.json' }) });
    const oldEmpty = new HiNoteDataManager(blank.app);
    assert.equal((await oldEmpty.getFileHighlights('empty.md')).length, 0);
    await oldEmpty.saveFileHighlights('empty.md', [highlight('first')]);
    const original = blank.files.get(highlightDir + 'empty.md.json');
    await oldEmpty.saveFileHighlights('empty.md', [highlight('second')]);
    assert.equal(blank.files.get(highlightDir + 'empty.md.json.bak'), original);
    blank.files.set(highlightDir + 'empty.md.json', '{invalid');
    const beforeWrites = blank.writes.length;
    await assert.rejects(oldEmpty.saveFileHighlights('empty.md', [highlight('third')]));
    assert.equal(blank.writes.length, beforeWrites);
    console.log('Storage: collision isolation, legacy compatibility, restart, rename protection and safe recovery passed.');
}

async function repositoryRace() {
    const { HighlightRepository } = load('src/repositories/HighlightRepository.ts');
    const gate = deferred();
    let readCount = 0, disk = [highlight('old')];
    const repo = new HighlightRepository({ initialize: async () => {},
        getAllHighlightFiles: async () => ['a.md'],
        getFileHighlights: async () => { readCount++; await gate.promise; return disk; },
        saveFileHighlights: async (_p, data) => { disk = data; }
    });
    let initialized = false;
    const startup = repo.initialize().then(() => { initialized = true; });
    const reading = repo.getFileHighlights('a.md');
    const saving = repo.saveFileHighlights('a.md', [highlight('new')]);
    await new Promise(r => setImmediate(r));
    assert.equal(initialized, false);
    assert.equal(repo.getCachedHighlights('a.md'), null);
    gate.resolve();
    assert.equal((await reading)[0].id, 'old');
    await Promise.all([startup, saving]);
    assert.equal(readCount, 1);
    assert.equal((await repo.getFileHighlights('a.md'))[0].id, 'new');
    assert.equal(disk[0].id, 'new');
    console.log('Repository: initialization waits, concurrent reads deduplicate, late reads cannot replace saved cache.');
}

async function flashcardFailure() {
    const { FlashcardDataStore } = load('src/storage/FlashcardDataStore.ts');
    const { FlashcardStorageService } = load('src/flashcard/services/FlashcardStorageService.ts');
    const vault = memoryVault({ '.hinote/flashcards/cards.json': '{invalid' });
    const store = new FlashcardDataStore(vault.app, '');
    const service = new FlashcardStorageService({}, {
        getFlashcardData: () => store.load(), saveFlashcardData: data => store.save(data)
    });
    await assert.rejects(service.load());
    await assert.rejects(service.save(service.createDefaultStorage()), /load successfully/);
    assert.equal(vault.writes.length, 0);
    vault.app.vault.adapter.read = async () => { throw Error('I/O unavailable'); };
    await assert.rejects(store.load(), /I\/O/);
    console.log('Flashcards: corrupt data and I/O failures block saving instead of replacing the old library.');
}

async function flashcardLifecycle() {
    const { FSRSManager } = load('src/flashcard/services/FSRSManager.ts');
    const { FlashcardStorageService } = load('src/flashcard/services/FlashcardStorageService.ts');
    const gate = deferred();
    const saved = [];
    let listeners = 0;
    const plugin = { registerEvent: () => { listeners++; }, eventManager: {
        on: () => ({}), emitFlashcardChanged() {}
    } };
    const manager = new FSRSManager(plugin, {
        getFlashcardData: async () => { await gate.promise; return new FlashcardStorageService({}).createDefaultStorage(); },
        saveFlashcardData: async data => { saved.push(data); }
    });
    assert.throws(() => manager.getAllCards(), /not available/);
    const startup = manager.initialize();
    gate.resolve(); await startup;
    assert.equal(listeners, 4);
    manager.addCard('question', 'answer');
    await manager.dispose();
    assert.equal(saved.length, 1, 'Disposal must flush the pending save');
    assert.equal(Object.values(saved[0].cards)[0].answer, 'answer');
    assert.throws(() => manager.getAllCards(), /not available/);
    const neverReady = new FSRSManager(plugin, { getFlashcardData: async () => { throw Error('read failed'); } });
    await assert.rejects(neverReady.initialize(), /read failed/);
    await assert.rejects(neverReady.saveStoragePublic(), /not ready/);
    await neverReady.dispose();
    console.log('Flashcard lifecycle: access waits for loading, unload flushes pending changes, failed loads cannot save.');
}

async function initializationBarrier() {
    const exports = {};
    const source = fs.readFileSync('src/services/InitializationManager.ts', 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports, require: () => ({}) });
    const manager = new exports.InitializationManager({});
    const gate = deferred();
    let factoryCalls = 0, enabled = 0, disposed = 0;
    manager.initialize = () => {
        factoryCalls++;
        return {
            highlightRepository: { initialize: () => gate.promise },
            fsrsManager: { initialize: async () => {}, dispose: async () => { disposed++; } },
            highlightService: { initialize: async () => {}, destroy() {} },
            highlightDecorator: { enable: () => { enabled++; }, disable() {} }
        };
    };
    const first = manager.ensureInitialized();
    const second = manager.ensureInitialized();
    assert.equal(factoryCalls, 1);
    assert.equal(manager.initialized, false);
    assert.equal(enabled, 0);
    gate.resolve();
    assert.equal(await first, await second);
    assert.equal(manager.initialized, true);
    assert.equal(enabled, 1);
    await manager.cleanup();
    assert.equal(disposed, 1);
    await assert.rejects(manager.ensureInitialized(), /unloaded/);
    console.log('Initialization: shared readiness barrier prevents early rendering and blocks reuse after unload.');
}

function modalLifecycle() {
    const modalModule = load('src/flashcard/components/controllers/FlashcardGroupModal.ts');
    const original = modalModule.createFlashcardGroupModal;
    let closed = 0;
    modalModule.createFlashcardGroupModal = () => ({ close: () => { closed++; },
        saveButton: { addEventListener() {} }, cancelButton: { addEventListener() {} }
    });
    try {
        const { FlashcardGroupManager } = load('src/flashcard/components/controllers/FlashcardGroupManager.ts');
        const manager = new FlashcardGroupManager({});
        manager.showCreateGroupModal();
        manager.showCreateGroupModal();
        assert.equal(closed, 1);
        manager.dispose(); manager.dispose();
        assert.equal(closed, 2);
    } finally { modalModule.createFlashcardGroupModal = original; }
    console.log('Modals: opening another group dialog closes the old one; disposal is idempotent.');
}

function emptyRegex() {
    const { HighlightExtractor } = load('src/services/highlight/HighlightExtractor.ts');
    const settings = { useCustomPattern: true, regexRules: [] };
    const extractor = new HighlightExtractor({ metadataCache: { getFileCache: () => null } }, () => settings);
    const context = vm.createContext({ extractor, settings });
    for (const pattern of ['^', '', '(?=a)', 'a*']) {
        settings.regexRules = [{ enabled: true, pattern }];
        const result = vm.runInContext("extractor.extractHighlights('abc', { path: 'a.md' })", context, { timeout: 500 });
        assert.ok(result.every(h => h.text.length > 0));
    }
    settings.useCustomPattern = false;
    assert.equal(extractor.extractHighlights('==normal==', { path: 'a.md' })[0].text, 'normal');
    console.log('Regex: empty matches terminate; ordinary highlighting remains intact.');
}
(async () => { await storagePaths(); await repositoryRace(); await flashcardFailure(); await flashcardLifecycle(); await initializationBarrier(); modalLifecycle(); emptyRegex(); })()
    .catch(error => { console.error(error); process.exitCode = 1; });

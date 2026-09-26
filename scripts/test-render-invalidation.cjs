const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/editor/RenderInvalidationCoordinator.ts', 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

class MarkdownView {
    constructor(path, mode = 'preview') {
        this.file = { path };
        this.mode = mode;
        this.renders = 0;
        this.previewMode = { rerender: full => { assert.equal(full, true); this.renders++; } };
    }
    getMode() { return this.mode; }
}

const timers = new Map();
let nextTimer = 0;
const fakeWindow = {
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
};
const flushTimer = () => {
    assert.equal(timers.size, 1, 'Changes in one task should share one refresh timer');
    const [id, callback] = timers.entries().next().value;
    timers.delete(id);
    callback();
};

const moduleExports = {};
vm.runInNewContext(code, {
    exports: moduleExports,
    require: request => {
        if (request === 'obsidian') return { MarkdownView };
        if (request === '../services/EventManager') return {};
        throw new Error(`Unexpected import: ${request}`);
    },
    window: fakeWindow,
    Set
}, { filename: 'src/editor/RenderInvalidationCoordinator.ts' });

const listeners = new Map();
const readingA = new MarkdownView('a.md');
const readingB = new MarkdownView('b.md');
const editingA = new MarkdownView('a.md', 'source');
const host = {
    app: { workspace: { getLeavesOfType: () => [readingA, readingB, editingA].map(view => ({ view })) } },
    registerEvent() {},
    register() {}
};
const eventManager = {
    on(name, callback) {
        const callbacks = listeners.get(name) || [];
        callbacks.push(callback);
        listeners.set(name, callbacks);
        return {};
    }
};
const editorRefreshes = [];
const coordinator = new moduleExports.RenderInvalidationCoordinator(
    host,
    eventManager,
    filePath => editorRefreshes.push(filePath)
);
coordinator.enable();

for (const callback of listeners.get('comment:update')) callback('a.md', '', '', 'record');
for (const callback of listeners.get('highlight:update')) callback('a.md', '', '', 'record');
flushTimer();
assert.deepEqual(editorRefreshes, ['a.md']);
assert.equal(readingA.renders, 1);
assert.equal(readingB.renders, 0);
assert.equal(editingA.renders, 0);

for (const callback of listeners.get('exclusions:changed')) callback();
flushTimer();
assert.equal(editorRefreshes.length, 2);
assert.equal(editorRefreshes[1], undefined);
assert.equal(readingA.renders, 2);
assert.equal(readingB.renders, 1);

coordinator.invalidate('a.md');
coordinator.destroy();
assert.equal(timers.size, 0, 'Destroy should cancel a pending refresh');
console.log('Render invalidation passed: event coalescing, file targeting, preview filtering and cleanup.');

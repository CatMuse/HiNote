const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/services/EventManager.ts', 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

class Events {
    constructor() { this.listeners = new Map(); this.emitted = []; }
    trigger(name, ...args) {
        this.emitted.push([name, ...args]);
        for (const callback of this.listeners.get(name) || []) callback(...args);
    }
    on(name, callback) {
        const callbacks = this.listeners.get(name) || [];
        callbacks.push(callback);
        this.listeners.set(name, callbacks);
        return {};
    }
    off() {}
}

const moduleExports = {};
vm.runInNewContext(code, {
    exports: moduleExports,
    require: request => {
        if (request === 'obsidian') return { Events };
        throw new Error(`Unexpected import: ${request}`);
    }
}, { filename: 'src/services/EventManager.ts' });

const manager = new moduleExports.EventManager({});
const changes = [];
manager.on('records:changed', change => changes.push({ ...change }));
manager.emitHighlightUpdate('note.md', 'before', 'after', 'highlight-1');
manager.emitCommentDelete('note.md', 'comment', 'highlight-1');

assert.deepEqual(changes, [
    { entity: 'highlight', action: 'update', filePath: 'note.md', sourceId: 'highlight-1' },
    { entity: 'comment', action: 'delete', filePath: 'note.md', sourceId: 'highlight-1' }
]);
assert.deepEqual(manager.events.emitted.map(event => event[0]), [
    'highlight:update', 'records:changed', 'comment:delete', 'records:changed'
]);
console.log('Events passed: legacy detail events and unified record-change notifications stay compatible.');

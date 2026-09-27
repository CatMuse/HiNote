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

const syncSource = fs.readFileSync('src/flashcard/services/FlashcardEventSyncService.ts', 'utf8');
const syncCode = ts.transpileModule(syncSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const syncExports = {};
vm.runInNewContext(syncCode, {
    exports: syncExports,
    console,
    require: request => { throw new Error(`Unexpected import: ${request}`); }
}, { filename: 'src/flashcard/services/FlashcardEventSyncService.ts' });

const cards = [{ id: 'card-1', sourceId: 'source-1', sourceType: 'highlight', text: 'old', answer: 'old answer' }];
let record = { id: 'source-1', comments: [{ content: 'synced answer' }] };
let saves = 0;
let cardChanges = 0;
const sync = new syncExports.FlashcardEventSyncService({
    plugin: {
        eventManager: manager,
        registerEvent() {},
        highlightRepository: { findHighlightById: id => id === record.id ? record : null }
    },
    findCardsBySourceId: id => cards.filter(card => card.sourceId === id),
    updateCardsBySourceId: (id, _type, text, answer) => {
        const found = cards.filter(card => card.sourceId === id);
        for (const card of found) {
            if (text !== undefined) card.text = text;
            if (answer !== undefined) card.answer = answer;
        }
        if (found.length) saves++;
        return found.length;
    },
    deleteCardsBySourceId: id => {
        const index = cards.findIndex(card => card.sourceId === id);
        if (index < 0) return 0;
        cards.splice(index, 1);
        return 1;
    },
    saveDebounced: () => { saves++; },
    emitFlashcardChanged: () => { cardChanges++; }
});
sync.registerEventListeners();

manager.emitCommentUpdate('note.md', '', 'synced answer', 'source-1');
assert.equal(cards[0].answer, 'synced answer', 'Annotation edits rebuild the linked card answer');
record = { ...record, comments: [] };
manager.emitHighlightUpdate('note.md', 'old', 'new question', 'source-1');
assert.equal(cards[0].text, 'new question', 'Highlight edits update the linked card question');
assert.equal(cards[0].answer, '', 'Removing the last annotation clears the linked card answer');
manager.emitHighlightDelete('note.md', 'new question', 'source-1');
assert.equal(cards.length, 0, 'Deleting the source highlight deletes its linked card');
assert.ok(saves >= 3 && cardChanges >= 3, 'Every source mutation persists and notifies open HiCard views');

console.log('Events passed: record notifications and linked HiCard question/annotation synchronization stay compatible.');

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const modules = new Map();
let confirmation = true;
let copied;
class TFile {}
class Component {
    addChild(child) { return child; }
    register() {}
    registerEvent() {}
    registerDomEvent() {}
}
const ownerWindow = { clearTimeout() {}, setTimeout: () => 0 };
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    if (file.endsWith('SelectionColorToolbar.ts')) code += '\nexports.Controller = SelectionColorController;';
    vm.runInNewContext(code, {
        exports, console, window: ownerWindow, activeDocument: { defaultView: ownerWindow },
        require: name => {
            if (name === 'obsidian') return { Component, TFile, Notice: class {}, MarkdownView: class {}, setIcon() {} };
            if (name === '@codemirror/view') return { ViewPlugin: { fromClass: value => value } };
            if (name.endsWith('/i18n')) return { t: value => value };
            if (name.endsWith('/ConfirmModal')) return { showConfirmModal: async () => confirmation };
            if (name.endsWith('/Clipboard')) return { HighlightCardClipboard: { copyHighlightContent: value => { copied = value; } } };
            if (name === '../../services/comment') return load('src/services/comment/CommentService.ts');
            if (name === './InlineAICommentHandler') return { InlineAICommentHandler: class {} };
            if (!name.startsWith('.')) return require(name);
            const target = path.resolve(path.dirname(file), name);
            return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
        }
    }, { filename: file });
    return exports;
}
const { HighlightExtractor } = load('src/services/highlight/HighlightExtractor.ts');
const { HighlightMatcher } = load('src/services/highlight/HighlightMatcher.ts');
const { resolveSourceSelection, resolvePreviewSelection } = load('src/editor/selection/SelectionRangeResolver.ts');
const { SelectionHighlightActions } = load('src/editor/selection/SelectionHighlightActions.ts');
const { Controller } = load('src/editor/selection/SelectionColorToolbar.ts');

function fixture(initial) {
    let document = initial;
    let records = [];
    const file = Object.assign(new TFile(), { path: 'note.md', basename: 'note', extension: 'md' });
    const app = { metadataCache: { getFileCache: () => null }, vault: {
        getAbstractFileByPath: () => file,
        read: async () => document,
        process: async (_file, callback) => { document = callback(document); return document; }
    } };
    const services = {
        highlightDecorator: { refreshDecorations() {} },
        highlightRepository: { getCachedHighlights: () => records },
        highlightService: new HighlightMatcher(),
        highlightManager: { removeHighlight: async () => { records = []; } },
        eventManager: { emitHighlightDelete() {} }, fsrsManager: {}
    };
    const plugin = { app, settings: {}, services, ensureServicesInitialized: async () => services };
    const extractor = new HighlightExtractor(app);
    const actions = new SelectionHighlightActions(plugin, extractor);
    function context(from, to, editing = true) {
        const view = editing ? {
            dom: { isConnected: true },
            state: { doc: { toString: () => document } },
            dispatch: transaction => {
                const { from, to, insert } = transaction.changes;
                document = document.slice(0, from) + insert + document.slice(to);
            }
        } : undefined;
        const plan = resolveSourceSelection(document, from, to, extractor.extractHighlights(document, file));
        assert.ok(plan);
        return { view, markdownView: {}, file, snapshot: document, plan };
    }
    return { plugin, extractor, actions, context, file,
        read: () => document, write: value => { document = value; },
        records: value => { records = value; } };
}

function testRanges() {
    const f = fixture('Prefix ==🔴same== and ==🔵same== suffix');
    const scans = f.extractor.extractHighlights(f.read(), f.file);
    const second = scans[1];
    const plan = resolveSourceSelection(f.read(), second.position + 4, second.position + 8, scans);
    assert.equal(plan.from, second.position);
    assert.equal(plan.to, second.position + second.originalLength);
    assert.equal(resolveSourceSelection(f.read(), scans[0].position + 4, second.position + 5, scans), null);
    for (const unsafe of ['two\nlines', '**`code`**', '<tag>']) {
        assert.equal(resolveSourceSelection(unsafe, 0, unsafe.length, []), null);
    }
    for (const source of ['`code`', '```js\ncode\n```', '~~~\ncode\n~~~']) {
        const start = source.indexOf('code');
        assert.equal(resolveSourceSelection(source, start, start + 4, []), null);
    }
    const preview = 'repeat\n\nrepeat\n';
    const resolved = resolvePreviewSelection(preview, { sourcePath: 'note.md', lineStart: 2, lineEnd: 2 }, 'repeat', []);
    assert.equal(resolved.from, 8);
    assert.equal(resolvePreviewSelection('repeat repeat', { sourcePath: 'note.md', lineStart: 0, lineEnd: 0 }, 'repeat', []), null);
    const whitespace = resolvePreviewSelection('word  spacing', { sourcePath: 'note.md', lineStart: 0, lineEnd: 0 }, 'word spacing', []);
    assert.equal(whitespace.to, 13, 'Collapsed preview whitespace maps back to the full source span');
    const trimmed = resolveSourceSelection('  selected  ', 0, 12, []);
    assert.equal(trimmed.from, 2); assert.equal(trimmed.to, 10);
}

async function testActions() {
    for (const editing of [true, false]) {
        const f = fixture('Before selected after');
        const context = f.context(7, 15, editing);
        await f.actions.writeSelectionChange(context, 'blue');
        assert.equal(f.read(), 'Before ==🔵selected== after');
        await assert.rejects(f.actions.writeSelectionChange(context, 'red'), /selection changed/);
        const prepared = f.context(11, 19, editing);
        await f.actions.writeSelectionChange(prepared, null);
        assert.equal(f.read(), 'Before ==selected== after');
    }
    const f = fixture('one and one');
    await f.actions.writeSelectionChange(f.context(8, 11), 'green');
    assert.equal(f.read(), 'one and ==🟢one==');
    const current = f.context(12, 15);
    f.records([{ ...current.plan.source, id: 'persisted', syntax: undefined, text: '🟢one',
        comments: [{ id: 'comment', content: 'Keep this' }] }]);
    const linked = await f.actions.getExistingHighlight(current);
    assert.equal(linked.id, 'persisted');
    assert.equal(linked.comments[0].content, 'Keep this');
    await f.actions.copyHighlight(current);
    assert.equal(copied.text, 'one');
    confirmation = false;
    assert.equal(await f.actions.deleteHighlight(current), 'cancelled');
    assert.equal(f.read(), 'one and ==🟢one==');
    confirmation = true;
    assert.equal(await f.actions.deleteHighlight(current), 'deleted');
    assert.equal(f.read(), 'one and one');
    await assert.rejects(f.actions.getExistingHighlight(current), /selection changed/);
}

async function testCommentRollback() {
    for (const editing of [true, false]) {
        const f = fixture('select me');
        const original = f.context(0, 9, editing);
        const prepared = await f.actions.ensureHighlighted(original);
        assert.equal(f.read(), '==select me==');
        const controller = new Controller(f.plugin);
        await controller.rollbackAutoHighlight({ context: prepared.context, ...prepared.rollback });
        assert.equal(f.read(), 'select me');

        const again = await f.actions.ensureHighlighted(f.context(0, 9, editing));
        f.write('A later edit ==select me==');
        await controller.rollbackAutoHighlight({ context: again.context, ...again.rollback });
        assert.equal(f.read(), 'A later edit ==select me==', 'Cancel must never overwrite later edits');
    }
    const f = fixture('selection');
    f.plugin.ensureServicesInitialized = async () => { throw Error('load failed'); };
    const controller = new Controller(f.plugin);
    controller.toolbar = { isConnected: true };
    await assert.rejects(controller.openComment(f.context(0, 9)), /load failed/);
    assert.equal(f.read(), 'selection', 'Failed initialization must not insert an automatic highlight');
}

async function testLateCapture() {
    const f = fixture('selection');
    const controller = new Controller(f.plugin);
    let complete;
    let rendered = 0;
    controller.selectionCapture.captureSelection = () => new Promise(resolve => { complete = resolve; });
    controller.render = () => { rendered++; };
    const pending = controller.show();
    controller.onunload();
    complete({ context: f.context(0, 9), anchor: {} });
    await pending;
    assert.equal(rendered, 0, 'A closed plugin cannot recreate its toolbar');
}

(async () => {
    testRanges(); await testActions(); await testCommentRollback(); await testLateCapture();
    const en = load('src/i18n/en.ts').default;
    const zh = load('src/i18n/zh.ts').default;
    for (const key of ['Change highlight color', 'Default', 'Red', 'Orange', 'Green', 'Blue', 'Purple', 'Comment', 'Close', 'Copy', 'Delete highlight', 'The selection changed. Select the text again.']) {
        assert.ok(en[key] && zh[key], `Both locales must translate ${key}`);
        assert.notEqual(zh[key], key);
    }
    console.log('Selection: ranges, code safety, reading/editing writes, stale snapshots, legacy comments, copy/delete, rollback and unload passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

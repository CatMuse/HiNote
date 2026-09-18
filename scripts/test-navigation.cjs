const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EditorState } = require('@codemirror/state');
const timers = new Map(); let timerId = 0;
const clock = { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
class Component {
    constructor() { this.disposers = []; }
    register(fn) { this.disposers.push(fn); }
    unload() { this.disposers.forEach(fn => fn()); }
}
class MarkdownView {}
class TFile {}
const notices = [];
class Notice { constructor(text) { notices.push(text); } }
const observers = [];
class Observer {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
}
const modules = new Map();
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports, console, window: clock, MutationObserver: Observer, require: name => {
        if (name === 'obsidian') return { Component, MarkdownView, TFile, Notice };
        if (/\/i18n$/.test(name)) return { t: text => text };
        if (!name.startsWith('.')) return require(name);
        return load(path.resolve(path.dirname(file), name) + '.ts');
    } }, { filename: file });
    return exports;
}
const { navigationFlashEffect, navigationFlashField } = load('src/editor/NavigationFlash.ts');
const { findHighlightLocation } = load('src/services/location/HighlightLocation.ts');
const { NavigationFeedback } = load('src/services/location/NavigationFeedback.ts');
const { LocationService } = load('src/services/LocationService.ts');
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function editorView(doc) {
    return { dom: { isConnected: true }, state: EditorState.create({ doc, selection: { anchor: 1 }, extensions: [navigationFlashField] }),
        dispatch(spec) { this.state = this.state.update(spec).state; } };
}
function pane(filePath, doc, mode = 'source') {
    const file = Object.assign(new TFile(), { path: filePath });
    const cm = editorView(doc), scrolls = [], ephemeral = [];
    const view = Object.assign(new MarkdownView(), { file, getMode: () => mode, previewMode: {
        containerEl: { isConnected: true, querySelectorAll: () => [] }
    }, editor: {
        cm, getValue: () => doc,
        offsetToPos: offset => { const lines = doc.slice(0, offset).split('\n'); return { line: lines.length - 1, ch: lines.at(-1).length }; },
        scrollIntoView: (range, center) => scrolls.push({ range, center }),
        setSelection() { throw Error('Navigation must not select text'); },
        setCursor() { throw Error('Navigation must not move the cursor'); },
        focus() { throw Error('Navigation must not focus the editor'); }
    } });
    return { file, cm, view, scrolls, ephemeral, leaf: { view, loadIfDeferred: async () => {}, setEphemeralState: state => ephemeral.push(state) } };
}
function environment(panes) {
    const active = [];
    const app = { workspace: { getLeavesOfType: () => panes.map(p => p.leaf),
        setActiveLeaf(leaf, options) { assert.equal(options.focus, false); active.push(leaf); },
        getLeaf() { throw Error('Unexpected new pane'); }
    }, vault: { getAbstractFileByPath: p => panes.find(pane => pane.file.path === p)?.file } };
    const service = new LocationService(app); service.onload();
    return { app, active, service };
}
function rangeTests() {
    assert.equal(findHighlightLocation('text', ''), null);
    assert.equal(findHighlightLocation('text', '   '), null);
    assert.equal(findHighlightLocation('text', 'missing'), null);
    const text = '==🔴相同== other ==相同==';
    assert.equal(findHighlightLocation(text, '相同', text.lastIndexOf('==相同')).from, text.lastIndexOf('相同'));
    assert.equal(findHighlightLocation('a\nb\nc', 'b\nc', 0).to, 5);
    assert.equal(findHighlightLocation('==text==', 'text', NaN).from, 2);
}
async function editorNavigation() {
    const first = pane('A.md', 'start\n==target==\n==other==');
    const env = environment([first]);
    const selection = first.cm.state.selection;
    await env.service.jumpToHighlight({ text: 'target', position: 6 }, 'A.md');
    assert.equal(first.scrolls.length, 1);
    assert.equal(first.scrolls[0].center, true);
    assert.equal(first.cm.state.selection, selection);
    assert.equal(first.cm.state.doc.toString(), 'start\n==target==\n==other==');
    assert.equal(first.cm.state.field(navigationFlashField).size, 1);
    await env.service.jumpToHighlight({ text: 'other', position: 17 }, 'A.md');
    assert.equal(timers.size, 1, 'Only the latest hint retains a timer');
    const cursor = first.cm.state.field(navigationFlashField).iter();
    assert.equal(cursor.from, first.cm.state.doc.toString().indexOf('other'));
    first.cm.dispatch({ selection: { anchor: 0 } });
    assert.equal(first.cm.state.field(navigationFlashField).size, 0, 'Editing dismisses navigation feedback');
    await env.service.jumpToHighlight({ text: 'target' }, 'A.md');
    env.service.unload();
    assert.equal(timers.size, 0);
    assert.equal(first.cm.state.field(navigationFlashField).size, 0);
    const count = first.scrolls.length;
    await env.service.jumpToHighlight({ text: 'target' }, 'A.md');
    assert.equal(first.scrolls.length, count, 'Disposed services cannot navigate');
    console.log('Editor navigation: selection/focus/document preserved; latest target, editing dismissal and unload cleanup passed.');
}
async function races() {
    const a = pane('A.md', '==alpha=='), b = pane('B.md', '==beta==');
    const pending = deferred(); a.leaf.loadIfDeferred = () => pending.promise;
    const env = environment([a, b]);
    const old = env.service.jumpToHighlight({ text: 'alpha' }, 'A.md');
    await env.service.jumpToHighlight({ text: 'beta' }, 'B.md');
    pending.resolve(); await old;
    assert.equal(a.scrolls.length, 0);
    assert.equal(b.scrolls.length, 1);
    assert.equal(env.active.length, 1);
    assert.equal(env.active[0], b.leaf);
    env.service.unload();
    const gate = deferred(); b.leaf.loadIfDeferred = () => gate.promise;
    const closed = environment([b]); const work = closed.service.jumpToHighlight({ text: 'beta' }, 'B.md');
    closed.service.unload(); gate.resolve(); await work;
    assert.equal(closed.active.length, 0, 'Closing a sidebar invalidates deferred activation');
    console.log('Navigation races: deferred older requests and closed-view work cannot steal activation or scroll.');
}
function element(attrs) {
    return { classes: new Set(), scrolls: 0, getAttribute: name => attrs[name] ?? null,
        addClass(name) { this.classes.add(name); }, removeClass(name) { this.classes.delete(name); },
        scrollIntoView(options) { assert.equal(options.block, 'center'); this.scrolls++; } };
}
async function previewNavigation() {
    const p = pane('A.md', 'intro\n==target==', 'preview');
    const env = environment([p]);
    await env.service.jumpToHighlight({ text: 'target' }, 'A.md');
    assert.deepEqual(Object.keys(p.ephemeral[0]), ['scroll']);
    assert.equal(p.ephemeral[0].scroll, 1);
    assert.equal(p.scrolls.length, 0, 'Reading mode must not use editor scrolling');
    env.service.unload();
    const feedback = new NavigationFeedback();
    const target = element({ 'data-hinote-source-path': 'A.md', 'data-hinote-source-from': '6', 'data-hinote-source-to': '16' });
    const wrongEmbed = element({ 'data-hinote-source-path': 'B.md', 'data-hinote-source-from': '6', 'data-hinote-source-to': '16' });
    let visible = [];
    p.view.previewMode.containerEl.querySelectorAll = selector => selector.includes('source-from') ? visible : [];
    feedback.showPreview(p.view, 'A.md', 1, { from: 8, to: 14 });
    const observer = observers.at(-1);
    visible = [wrongEmbed, target]; observer.callback();
    assert.equal(target.scrolls, 1);
    assert.equal(wrongEmbed.scrolls, 0);
    assert.equal(target.classes.has('hinote-navigation-flash'), true);
    feedback.clear();
    assert.equal(target.classes.size, 0); assert.equal(observer.connected, false); assert.equal(timers.size, 0);
    visible = [];
    const section = element({ 'data-hinote-source-path': 'A.md', 'data-hinote-line-start': '0', 'data-hinote-line-end': '4' });
    p.view.previewMode.containerEl.querySelectorAll = selector => selector.includes('line-start') ? [section] : [];
    feedback.showPreview(p.view, 'A.md', 1, { from: 8, to: 14 });
    assert.equal(section.scrolls, 1, 'Custom/format-rich text can reveal its rendered source section');
    feedback.clear();
    console.log('Reading navigation: scroll-only state, lazy render, embed isolation, source-section fallback and observer cleanup passed.');
}
function decorationLifetime() {
    const view = editorView('hello'); const feedback = new NavigationFeedback();
    const selection = view.state.selection;
    feedback.showEditor(view, { from: 0, to: 5 });
    assert.equal(view.state.selection, selection);
    const expire = [...timers.values()][0]; expire();
    assert.equal(view.state.field(navigationFlashField).size, 0); assert.equal(timers.size, 0);
    view.dispatch({ effects: navigationFlashEffect.of({ from: 0, to: 99 }) });
    assert.equal(view.state.field(navigationFlashField).size, 0);
    feedback.showEditor(view, { from: 0, to: 5 });
    view.dispatch({ changes: { from: 0, insert: 'new ' } });
    assert.equal(view.state.field(navigationFlashField).size, 0);
    feedback.clear();
}
(async () => { rangeTests(); await editorNavigation(); await races(); await previewNavigation(); decorationLifetime(); })()
    .catch(error => { console.error(error); process.exitCode = 1; });

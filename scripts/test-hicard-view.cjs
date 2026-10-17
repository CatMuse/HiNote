const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports, console: { error() {} }, require: name => {
        if (!(name in imports)) throw Error(`Unexpected import ${name}`);
        return imports[name];
    }});
    return exports;
}
function deferred() {
    let resolve, reject;
    const promise = new Promise((r, j) => { resolve = r; reject = j; });
    return { promise, resolve, reject };
}
class Element {
    constructor() { this.children = []; this.classes = new Set(); }
    addClass(name) { this.classes.add(name); }
    empty() { this.children = []; }
    createDiv(options) { const child = new Element(); child.options = options; this.children.push(child); return child; }
    createEl(tag, options) { const child = this.createDiv(options); child.tag = tag; return child; }
}
class ItemView {
    constructor(leaf) { this.leaf = leaf; this.contentEl = new Element(); this.children = new Set(); this.events = []; }
    addChild(child) { this.children.add(child); child.load(); }
    removeChild(child) { this.children.delete(child); child.unload(); }
    registerDomEvent(element, type, callback) { this.events.push({ element, type, callback }); }
}
const components = [];
class HiCardWorkspace {
    constructor(container, plugin) { this.container = container; this.plugin = plugin; this.unloads = 0; this.deactivations = 0; components.push(this); }
    load() { this.loaded = true; }
    unload() { this.unloads++; }
    async open(current) {
        assert.ok(this.loaded, 'Workspace lifecycle must be configured before opening');
        await this.plugin.activation;
        if (current()) this.container.createDiv({ text: 'study' });
    }
    close() { this.deactivations++; this.container.empty(); }
}
const { HiCardView, VIEW_TYPE_HICARD } = load('src/views/hicard/HiCardView.ts', {
    obsidian: { ItemView },
    '../../i18n': { t: s => s },
    './HiCardWorkspace': { HiCardWorkspace }
});
const { WindowManager } = load('src/plugin/WindowManager.ts', {
    obsidian: {},
    '../views/hinote/HiNoteView': { HiNoteView: class {}, VIEW_TYPE_HINOTE: 'hinote-view' },
    '../views/hicard/HiCardView': { VIEW_TYPE_HICARD }
});
async function lifecycle() {
    // Restored workspace leaves must wait for services before constructing study components.
    const init = deferred();
    const view = new HiCardView({}, { ensureServicesInitialized: () => init.promise });
    const opening = view.onOpen();
    assert.equal(components.length, 0);
    await view.onClose(); init.resolve(); await opening;
    assert.equal(components.length, 0, 'Closing during initialization must not create a detached study view');

    const activation = deferred();
    const active = new HiCardView({}, { ensureServicesInitialized: async () => {}, activation: activation.promise });
    const activating = active.onOpen(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(components.length, 1);
    const component = components[0];
    await active.onClose(); activation.resolve(); await activating; active.onunload();
    assert.equal(component.deactivations, 1); assert.equal(component.unloads, 1);
    assert.equal(component.container.children.length, 0, 'Late license response must not render into a closed view');
    assert.equal(active.children.size, 0);

    let fail = true;
    const retry = new HiCardView({}, { ensureServicesInitialized: async () => { if (fail) throw Error('storage unavailable'); } });
    await retry.onOpen(); assert.equal(retry.events.length, 1, 'Initialization error offers retry');
    fail = false; await retry.onOpen();
    assert.equal(retry.children.size, 1); assert.equal(retry.getDisplayText(), 'HiCard');
    assert.equal(retry.getViewType(), 'hicard-view');
    await retry.onClose(); assert.equal(retry.children.size, 0);

    const failedActivation = new HiCardView({}, { ensureServicesInitialized: async () => {}, activation: Promise.reject(Error('license error')) });
    await failedActivation.onOpen(); assert.equal(failedActivation.children.size, 0, 'Activation errors must unload component listeners');
    assert.equal(failedActivation.events.length, 1);
}
async function independentOpening() {
    const gate = deferred(); const highlight = { detach() { throw Error('Must not detach highlights'); } };
    const leaves = [highlight]; let created = 0; let revealed;
    const workspace = {
        getLeavesOfType: type => type === VIEW_TYPE_HICARD ? leaves.filter(leaf => leaf.type === type) : [highlight],
        getLeaf(mode) {
            assert.equal(mode, 'tab'); created++;
            const leaf = { async setViewState(state) { await gate.promise; this.type = state.type; }, detach() { throw Error('Must reuse study leaf'); } };
            leaves.push(leaf); return leaf;
        },
        async revealLeaf(leaf) { revealed = leaf; }
    };
    const manager = new WindowManager({ workspace });
    const first = manager.openHiCard(); const second = manager.openHiCard();
    assert.equal(first, second, 'Rapid command invocations must share the pending open');
    assert.equal(created, 1); gate.resolve(); await first;
    await manager.openHiCard(); assert.equal(created, 1); assert.equal(revealed.type, VIEW_TYPE_HICARD);
    assert.equal(leaves[0], highlight, 'Highlight leaf is preserved');
    let fail = true;
    const recovery = new WindowManager({ workspace: {
        getLeavesOfType: () => [],
        getLeaf: () => ({ async setViewState() { if (fail) throw Error('workspace failure'); } }),
        async revealLeaf() {}
    }});
    await assert.rejects(recovery.openHiCard()); fail = false; await recovery.openHiCard();
}
function frontEditing() {
    class Field {
        constructor(options = {}) { this.options = options; this.children = []; this.events = {}; this.attrs = {}; }
        createDiv(options) { const field = new Field(options); this.children.push(field); return field; }
        createEl(tag, options) { const field = this.createDiv(options); field.tag = tag; return field; }
        setText(text) { this.text = text; }
        setAttribute(key, value) { this.attrs[key] = value; }
        addEventListener(name, handler) { this.events[name] = handler; }
        focus() { this.focused = true; }
        fire(name, event = {}) { this.events[name]?.(event); }
        all() { return [this, ...this.children.flatMap(child => child.all())]; }
    }
    const { HiCardFrontEditor } = load('src/views/hicard/modals/HiCardFrontEditor.ts', {
        '../../../i18n': { t: value => value }
    });
    const host = new Field(), card = { text: 'Original source' };
    let navigations = 0;
    const editor = new HiCardFrontEditor(host, card, 'Original source', () => navigations++);
    const input = host.all().find(field => field.tag === 'textarea');
    const tabs = host.all().filter(field => field.options.attr?.role === 'tab');
    const panels = host.all().filter(field => field.options.attr?.role === 'tabpanel');
    assert.equal(editor.getChange(), undefined, 'Opening and saving untouched content keeps source following');
    input.value = 'Custom {{answer}}'; input.fire('input');
    assert.equal(editor.getChange(), 'Custom {{answer}}');
    tabs[1].fire('click');
    assert.equal(panels[0].hidden, true);
    assert.equal(panels[1].hidden, false);
    assert.equal(host.all().filter(field => field.tag === 'textarea').length, 1, 'Source is readable text, not a disabled textarea');
    tabs[0].fire('click'); assert.equal(input.value, 'Custom {{answer}}', 'Tab switches preserve draft');
    assert.equal(card.text, 'Original source', 'Editing and tab changes do not mutate the stored card');
    input.value = '   '; input.fire('input');
    assert.throws(() => editor.getChange(), /cannot be empty/);
    host.all().find(field => field.options.text === 'Restore source text').fire('click');
    assert.equal(editor.getChange(), null, 'Restore is a pending change until Save');
    assert.equal(input.value, 'Original source');
    host.all().find(field => field.options.text === 'Open source').fire('click');
    assert.equal(navigations, 1);
    const customHost = new Field();
    const custom = new HiCardFrontEditor(customHost, { text: 'Kept rewrite', frontCustomized: true }, 'New source', () => {});
    assert.equal(custom.getChange(), undefined, 'Opening a customized card does not clear its mode');
    customHost.all().find(field => field.options.text === 'Restore source text').fire('click');
    assert.equal(custom.getChange(), null);
    assert.equal(customHost.all().find(field => field.tag === 'textarea').value, 'New source');
}

(async () => {
    frontEditing();
    await lifecycle(); await independentOpening();
    console.log('HiCard view: independent tabs, concurrent open, workspace initialization, close races, license cleanup and retry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

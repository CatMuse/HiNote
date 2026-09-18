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
class FlashcardComponent {
    constructor(container, plugin) { this.container = container; this.plugin = plugin; this.unloads = 0; this.deactivations = 0; components.push(this); }
    load() { this.loaded = true; }
    unload() { this.unloads++; }
    setLicenseManager(manager) { this.license = manager; }
    async activate(current) {
        assert.ok(this.loaded && this.license, 'Lifecycle and licensing must be configured before activation');
        await this.plugin.activation;
        if (current()) this.container.createDiv({ text: 'study' });
    }
    deactivate() { this.deactivations++; this.container.empty(); }
}
const { HiCardView, VIEW_TYPE_HICARD } = load('src/views/hicard/HiCardView.ts', {
    obsidian: { ItemView },
    '../../flashcard/components/FlashcardComponent': { FlashcardComponent },
    '../../services/LicenseManager': { LicenseManager: class {} },
    '../../i18n': { t: s => s }
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
(async () => {
    await lifecycle(); await independentOpening();
    console.log('HiCard view: independent tabs, concurrent open, workspace initialization, close races, license cleanup and retry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

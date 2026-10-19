const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports, window: {}, console: { error() {} }, require: name => {
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
    constructor() { this.children = []; this.classes = new Set(); this.events = {}; this.connected = true; this.value = ''; }
    addClass(name) { this.classes.add(name); }
    removeClass(name) { this.classes.delete(name); }
    get isConnected() { return this.parent ? this.parent.isConnected : this.connected; }
    detach() { this.connected = false; this.parent = null; this.children.forEach(child => child.detach()); }
    empty() { this.children.forEach(child => child.detach()); this.children = []; }
    createDiv(options) { const child = new Element(); child.parent = this; child.options = options; this.children.push(child); return child; }
    createEl(tag, options) { const child = this.createDiv(options); child.tag = tag; return child; }
    createSpan(options) { return this.createEl('span', options); }
    setAttr() {}
    addEventListener(type, callback) { this.events[type] = callback; }
    all() { return [this, ...this.children.flatMap(child => child.all())]; }

}
class Scope {
    constructor(parent) { this.parent = parent; this.handlers = []; }
    register(modifiers, key, callback) { this.handlers.push({ modifiers, key, callback }); }
    dispatch(modifiers, key, event) {
        const handler = this.handlers.find(item => item.key === key && item.modifiers.join() === modifiers.join());
        if (handler) return handler.callback(event);
        return this.parent?.dispatch(modifiers, key, event);
    }
}
class ItemView {
    constructor(leaf) { this.app = { scope: new Scope() }; this.leaf = leaf; this.contentEl = new Element(); this.children = new Set(); this.events = []; }
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
const notices = [];
class LicenseManager {
    constructor(plugin) { this.plugin = plugin; }
    async isActivated() { return this.plugin.licenseCheck ? this.plugin.licenseCheck() : this.plugin.licensed !== false; }
    async isFeatureEnabled(feature) { return this.plugin.featureCheck ? this.plugin.featureCheck() : (this.plugin.features ?? ['flashcard']).includes(feature); }
    async activateLicense(key) {
        if (this.plugin.activateKey) return this.plugin.activateKey(key);
        this.plugin.licensed = true;
        return true;
    }
}
const { FlashcardActivationRenderer } = load('src/flashcard/components/renderers/FlashcardActivationRenderer.ts', {
    obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
    '../../../i18n': { t: value => value }
});
const { HiCardView, VIEW_TYPE_HICARD } = load('src/views/hicard/HiCardView.ts', {
    obsidian: { ItemView, Scope },
    '../../i18n': { t: s => s },
    './HiCardWorkspace': { HiCardWorkspace },
    '../../services/LicenseManager': { LicenseManager },
    '../../flashcard/components/renderers/FlashcardActivationRenderer': { FlashcardActivationRenderer }
});
const { WindowManager } = load('src/plugin/WindowManager.ts', {
    obsidian: {},
    '../views/hinote/HiNoteView': { HiNoteView: class {}, VIEW_TYPE_HINOTE: 'hinote-view' },
    '../views/hicard/HiCardView': { VIEW_TYPE_HICARD }
});
function escapeScope() {
    const view = new HiCardView({}, {});
    assert.equal(view.scope.parent, view.app.scope, 'View keeps inherited application hotkeys');
    assert.equal(view.app.scope.handlers.length, 0, 'Escape protection is not installed globally');
    assert.equal(view.scope.handlers.length, 1);
    assert.equal(view.scope.handlers[0].key, 'Escape');
    assert.equal(view.scope.handlers[0].modifiers.length, 0, 'Only unmodified Escape is intercepted');
    let navigations = 0;
    view.app.scope.register([], 'Escape', () => navigations++);
    view.app.scope.register(['Mod'], 'Escape', () => navigations++);
    for (const target of [{ tagName: 'DIV' }, { tagName: 'TEXTAREA', value: 'Unsaved answer' }]) {
        let prevented = 0, stopped = 0;
        const result = view.scope.dispatch([], 'Escape', {
            target, isComposing: false, preventDefault: () => prevented++, stopPropagation: () => stopped++
        });
        assert.equal(result, false, 'Escape is consumed by the view scope');
        assert.equal(navigations, 0, 'Escape must not focus another leaf');
        assert.equal(prevented, 1);
        assert.equal(stopped, 0, 'Document listeners for custom dialogs must still receive Escape');
        if (target.tagName === 'TEXTAREA') assert.equal(target.value, 'Unsaved answer', 'Draft is preserved');
    }
    let preventedIME = false;
    view.scope.dispatch([], 'Escape', { isComposing: true, preventDefault: () => preventedIME = true });
    assert.equal(preventedIME, false, 'IME cancellation is not prevented');
    view.scope.dispatch(['Mod'], 'Escape', {});
    assert.equal(navigations, 1, 'Modified keybindings still belong to the application');
    let closed = 0;
    const modalScope = new Scope(view.app.scope);
    modalScope.register([], 'Escape', () => closed++);
    modalScope.dispatch([], 'Escape', {});
    assert.equal(closed, 1, 'A modal using its own scope can still close');
    assert.equal(navigations, 1);
}

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
async function authorizationGate() {
    const settle = () => new Promise(resolve => setImmediate(resolve));
    const before = components.length;
    const plugin = { ensureServicesInitialized: async () => {}, licensed: false };
    const view = new HiCardView({}, plugin);
    await view.onOpen();
    assert.equal(components.length, before, 'Unlicensed view must not construct any management workspace');
    assert.equal(view.children.size, 0, 'No page listeners are installed before activation');
    assert.equal(view.contentEl.all().some(el => el.options?.text === 'Activate HiCard'), true);
    assert.equal(view.contentEl.all().some(el => el.options?.text === 'study'), false);
    const input = view.contentEl.all().find(el => el.tag === 'input');
    const button = view.contentEl.all().find(el => el.tag === 'button');
    input.value = 'synthetic-license';
    button.events.click(); await settle();
    assert.equal(components.length, before + 1, 'Successful activation opens the full workspace without reopening the tab');
    assert.equal(view.contentEl.classes.has('flashcard-mode'), false, 'Activation layout is cleared before showing workspace');
    await view.onClose();

    const missingFeature = new HiCardView({}, { ensureServicesInitialized: async () => {}, licensed: true, features: [] });
    await missingFeature.onOpen();
    assert.equal(components.length, before + 1, 'A valid license without flashcard entitlement cannot open HiCard');
    await missingFeature.onClose();

    const pendingLicense = deferred();
    const closed = new HiCardView({}, { ensureServicesInitialized: async () => {}, licenseCheck: () => pendingLicense.promise });
    const opening = closed.onOpen(); await settle(); await closed.onClose();
    pendingLicense.resolve(true); await opening;
    assert.equal(components.length, before + 1, 'Closing during license verification cannot create the workspace');
    assert.equal(closed.contentEl.children.length, 0);

    const pendingFeature = deferred();
    const closedFeature = new HiCardView({}, { ensureServicesInitialized: async () => {}, featureCheck: () => pendingFeature.promise });
    const openingFeature = closedFeature.onOpen(); await settle(); await closedFeature.onClose();
    pendingFeature.resolve(true); await openingFeature;
    assert.equal(components.length, before + 1, 'Closing during feature verification cannot create the workspace');

    const pendingActivation = deferred();
    const late = new HiCardView({}, { ensureServicesInitialized: async () => {}, licensed: false, activateKey: () => pendingActivation.promise });
    await late.onOpen();
    late.contentEl.all().find(el => el.tag === 'input').value = 'synthetic-license';
    late.contentEl.all().find(el => el.tag === 'button').events.click();
    await late.onClose(); pendingActivation.resolve(true); await settle();
    assert.equal(components.length, before + 1, 'Late activation cannot reopen a closed tab');

    const failed = new HiCardView({}, { ensureServicesInitialized: async () => {}, licensed: false, activateKey: async () => false });
    await failed.onOpen();
    failed.contentEl.all().find(el => el.tag === 'input').value = 'invalid-license';
    failed.contentEl.all().find(el => el.tag === 'button').events.click(); await settle();
    assert.equal(components.length, before + 1, 'Failed activation keeps all pages gated');
    assert.equal(notices.at(-1), 'Invalid license key');
    await failed.onClose();

    const reloadPlugin = { ensureServicesInitialized: async () => {}, licensed: true };
    const reloaded = new HiCardView({}, reloadPlugin);
    await reloaded.onOpen();
    const old = components.at(-1);
    reloadPlugin.licensed = false; await reloaded.onOpen();
    assert.equal(old.unloads, 1, 'Reopening must release the former authorized workspace before gating');
    assert.equal(reloaded.children.size, 0);
    await reloaded.onClose();
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
    escapeScope();
    frontEditing();
    await lifecycle(); await authorizationGate(); await independentOpening();
    console.log('HiCard view: independent tabs, concurrent open, workspace initialization, close races, license cleanup, whole-workspace authorization, activation and retry passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

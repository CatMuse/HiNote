const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports, globals = {}) {
    const source = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    const exports = {};
    vm.runInNewContext(code, { exports, require: name => {
        assert.ok(name in imports, `Unexpected import: ${name}`);
        return imports[name];
    }, ...globals }, { filename: file });
    return exports;
}

function testReviewDomRules() {
    let files = 0;
    function scan(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = `${directory}/${entry.name}`;
            if (entry.isDirectory()) { scan(file); continue; }
            if (!file.endsWith('.ts')) continue;
            files++;
            const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            function visit(node) {
                if (ts.isCallExpression(node)) {
                    const callee = node.expression;
                    const name = ts.isPropertyAccessExpression(callee) ? callee.name.text
                        : ts.isIdentifier(callee) ? callee.text : '';
                    const tag = node.arguments[0];
                    const location = source.getLineAndCharacterOfPosition(node.getStart(source));
                    const at = `${file}:${location.line + 1}`;
                    assert.ok(!(name === 'createEl' && tag && ts.isStringLiteral(tag)
                        && ['div', 'span'].includes(tag.text)), `Use createDiv/createSpan at ${at}`);
                    assert.ok(!['createElement', 'createElementNS', 'createDocumentFragment',
                        'setDynamicTooltip'].includes(name), `Review-disallowed call ${name} at ${at}`);
                }
                ts.forEachChild(node, visit);
            }
            visit(source);
        }
    }
    scan('src');
    console.log(`Review DOM rules passed for ${files} TypeScript files.`);
}

async function testKeyboard() {
    const platform = { isMobile: false };
    let now = 1000;
    const { setupCommentInputKeyboard } = load('src/components/comment/CommentInputKeyboard.ts', {
        obsidian: { Platform: platform }
    }, { Date: { now: () => now } });
    const listeners = {};
    const textarea = { addEventListener: (name, handler) => { listeners[name] = handler; } };
    let saves = 0, ai = 0;
    setupCommentInputKeyboard(textarea, {
        onSave: async () => { saves++; }, onInlineAI: async () => { ai++; }
    });
    const key = async (key, options = {}) => {
        let prevented = false;
        await textarea.onkeydown({ key, preventDefault: () => { prevented = true; }, ...options });
        return prevented;
    };
    assert.equal(await key('Enter'), true);
    assert.equal(saves, 1);
    listeners.compositionstart();
    await key('Enter'); await key('Tab');
    assert.equal(saves, 1); assert.equal(ai, 0);
    listeners.compositionend();
    assert.equal(await key('Enter'), false);
    now += 99; await key('Enter'); assert.equal(saves, 1);
    now += 1; await key('Enter'); assert.equal(saves, 2);
    await key('Enter', { isComposing: true });
    await key('Enter', { shiftKey: true });
    platform.isMobile = true; await key('Enter');
    assert.equal(saves, 2);
    platform.isMobile = false; await key('Tab'); assert.equal(ai, 1);
}

function testSettingsNavigation() {
    const observers = [];
    const { SettingsTabNavigation } = load('src/settings/SettingsTabNavigation.ts', {}, {
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(element) { this.element = element; }
            disconnect() { this.disconnected = true; }
        }
    });
    const node = () => ({
        children: [], attributes: {}, hidden: false,
        classList: { contains: () => false }, scrollIntoView() {},
        empty() { this.children = []; }, addClass() {},
        setAttribute(name, value) { this.attributes[name] = value; },
        createDiv() { const child = node(); this.children.push(child); return child; },
        createEl() { const child = node(); this.children.push(child); return child; },
        addEventListener() {}, removeEventListener() {},
        focus() { this.focused = true; }
    });
    const navigation = new SettingsTabNavigation();
    const group = { listEl: node() };
    const root = node();
    const cleanup = navigation.render({ settingEl: root }, group, [
        { id: 'general', name: 'General' }, { id: 'ai', name: 'AI' }, { id: 'hicard', name: 'HiCard' }
    ]);
    const general = node(), ai = node(), hicard = node();
    let shown = [];
    navigation.attach(group, 'general', general, () => shown.push('general'));
    navigation.attach(group, 'ai', ai, () => shown.push('ai'));
    navigation.attach(group, 'hicard', hicard, () => shown.push('hicard'));
    assert.equal(general.hidden, false);
    assert.equal(ai.hidden, true);
    assert.ok(!shown.includes('hicard'), 'Inactive HiCard must not start license requests');
    const buttons = root.children[0].children;
    buttons[1].onclick();
    assert.equal(general.hidden, true);
    assert.equal(ai.hidden, false);
    assert.equal(buttons[1].attributes['aria-selected'], 'true');
    buttons[1].onkeydown({ key: 'ArrowRight', preventDefault() {} });
    assert.equal(hicard.hidden, false);
    assert.equal(buttons[2].focused, true);
    const searchPanel = node();
    let searchRendered = false;
    navigation.attach({ listEl: node() }, 'ai', searchPanel, () => { searchRendered = true; });
    assert.equal(searchPanel.hidden, false);
    assert.equal(searchRendered, true, 'Search must ignore selected normal tab');
    general.classList.contains = name => name === 'is-flashing';
    observers.find(observer => observer.element === general).callback();
    assert.equal(general.hidden, false, 'Search flash must select the matching tab');
    assert.equal(hicard.hidden, true);
    cleanup();
    assert.equal(hicard.hidden, false);
}

async function testSettings() {
    let renders = 0, initialized = 0;
    const renderer = class { display() { renders++; } };
    const { AISettingTab } = load('src/settings/SettingsTab.ts', {
        obsidian: { PluginSettingTab: class {} },
        './SettingsTabNavigation': load('src/settings/SettingsTabNavigation.ts', {}, { MutationObserver: class { observe() {} disconnect() {} } }),
        './tabs/GeneralSettingsTab': { GeneralSettingsTab: renderer },
        './tabs/AIServiceTab': { AIServiceTab: renderer },
        '../flashcard': { FlashcardSettingsTab: renderer },
        '../i18n': { t: text => text },
        '../services/LicenseManager': { LicenseManager: class {} },
        '../utils/ObsidianInternals': { ObsidianInternals: {} }
    });
    let resolveInitialization;
    const tab = new AISettingTab({}, { ensureServicesInitialized: () => {
        initialized++;
        return new Promise(resolve => { resolveInitialization = resolve; });
    } });
    const definitions = tab.getSettingDefinitions();
    assert.equal(initialized, 0, 'Search indexing must not initialize vault services');
    assert.equal(definitions.length, 4);
    assert.equal(definitions[0].searchable, false);
    assert.ok(definitions.every(item => item.type !== 'page'), 'No secondary settings pages');
    for (const term of ['Export Path', 'API key', 'Target retention']) {
        assert.ok(definitions.some(item => item.aliases?.includes(term)));
    }
    const setting = { settingEl: { empty() {}, addClass() {}, createEl() {}, setAttribute() {} } };
    const searchGroup = { listEl: {} };
    const cleanup = definitions[1].render(setting, searchGroup);
    cleanup(); resolveInitialization();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(renders, 0, 'Closed settings must not render after initialization');
    definitions[1].render(setting, searchGroup); resolveInitialization();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(renders, 1);
}

(async () => {
    testReviewDomRules();
    await testKeyboard();
    testSettingsNavigation();
    await testSettings();
    const manifest = JSON.parse(fs.readFileSync('manifest.json'));
    const versions = JSON.parse(fs.readFileSync('versions.json'));
    assert.equal(manifest.minAppVersion, '1.13.0');
    assert.equal(versions['0.5.8'], '1.8.0');
    assert.equal(versions[manifest.version], manifest.minAppVersion);
    console.log('Review regressions passed: IME, keyboard shortcuts, settings search definitions and lifecycle, versions.');
})().catch(error => { console.error(error); process.exitCode = 1; });

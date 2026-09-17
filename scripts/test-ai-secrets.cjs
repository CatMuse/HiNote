const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const modules = new Map();
const notices = [];
const overrides = new Map();
function load(file) {
    file = path.resolve(file);
    if (overrides.has(file)) return overrides.get(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(code, { exports, console, window: { setTimeout, clearTimeout },
        require: name => {
            if (name === 'obsidian') return {
                Plugin: class { addSettingTab() {} },
                Notice: class { constructor(message) { notices.push(message); } },
                requestUrl: () => { throw Error('Network is not allowed in credential tests'); }
            };
            if (name.endsWith('/i18n')) return { t: value => value };
            if (!name.startsWith('.')) return require(name);
            let target = path.resolve(path.dirname(file), name);
            target = fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts');
            return load(target);
        }
    }, { filename: file });
    return exports;
}
const providers = ['openai', 'anthropic', 'gemini', 'deepseek', 'siliconflow', 'custom'];

(async () => {
    const { normalizeSettings, hasLegacyApiKeys } = load('src/settings/SettingsMigration.ts');
    const raw = { ai: { provider: 'openai', prompts: { test: 'keep me' } }, 'flashcard-license': { key: 'license', token: 'token', features: [] } };
    for (const provider of providers) raw.ai[provider] = {
        apiKey: 'legacy-do-not-use', apiKeySecretId: 'test-' + provider,
        model: 'test-model', baseUrl: 'https://example.invalid'
    };
    const settings = normalizeSettings(raw);
    assert.ok(hasLegacyApiKeys(raw.ai));
    assert.ok(!hasLegacyApiKeys(settings.ai));
    assert.ok(!JSON.stringify(settings).includes('legacy-do-not-use'));
    assert.ok(!JSON.stringify(normalizeSettings(settings, raw)).includes('legacy-do-not-use'));
    assert.equal(raw.ai.openai.apiKey, 'legacy-do-not-use', 'Normalization must not mutate the input');
    assert.equal(settings.ai.prompts.test, 'keep me');
    assert.equal(settings['flashcard-license'].key, 'license');
    const values = new Map(providers.map(provider => ['test-' + provider, 'dummy-' + provider]));
    const secrets = { getSecret: id => values.get(id) ?? null };
    const { AIServiceManager } = load('src/services/ai/AIServiceManager.ts');
    for (const provider of providers) {
        const config = { ...settings.ai, provider };
        const before = JSON.stringify(config);
        const manager = new AIServiceManager(config, secrets);
        assert.equal(manager.getCurrentService().apiKey, 'dummy-' + provider);
        values.set('test-' + provider, 'rotated-' + provider);
        assert.equal(manager.getCurrentService().apiKey, 'rotated-' + provider, 'Keychain edits must invalidate cached credentials');
        values.delete('test-' + provider);
        assert.throws(() => manager.getCurrentService(), /Keychain/);
        assert.equal(JSON.stringify(config), before, 'Resolved secrets must never enter settings');
        const legacyOnly = { ...config, [provider]: { ...config[provider], apiKeySecretId: '', apiKey: 'legacy-do-not-use' } };
        assert.throws(() => new AIServiceManager(legacyOnly, secrets).getCurrentService(), /Keychain/);
    }
    assert.ok(new AIServiceManager({ ...settings.ai, provider: 'ollama', ollama: { host: 'http://localhost:11434', model: 'test-model' } }, secrets).getCurrentService().isConfigured());

    // Exercise actual plugin load/save boundaries with in-memory data only.
    overrides.set(path.resolve('src/settings/SettingsTab.ts'), { AISettingTab: class {} });
    overrides.set(path.resolve('src/services/InitializationManager.ts'), { InitializationManager: class {} });
    overrides.set(path.resolve('src/plugin/WindowManager.ts'), {});
    overrides.set(path.resolve('src/plugin/PluginBootstrap.ts'), Object.fromEntries([
        'createPluginWindowManager', 'registerPluginCommands', 'registerPluginRibbon', 'registerPluginVaultEvents', 'registerPluginViews'
    ].map(name => [name, () => {}])));
    const Plugin = load('main.ts').default;
    const plugin = new Plugin();
    let persisted = JSON.parse(JSON.stringify(raw)), writes = 0;
    plugin.loadData = async () => persisted;
    plugin.saveData = async value => { persisted = JSON.parse(JSON.stringify(value)); writes++; };
    await plugin.onload();
    assert.equal(writes, 1);
    assert.ok(!hasLegacyApiKeys(persisted.ai));
    assert.equal(notices.length, 1);
    await plugin.onload();
    assert.equal(writes, 1, 'Already-clean settings must not be rewritten on load');
    assert.equal(notices.length, 1);
    plugin.settings.ai.openai.apiKey = 'accidental-runtime-key';
    await plugin.saveSettings();
    assert.ok(!JSON.stringify(persisted).includes('accidental-runtime-key'));
    console.log('Keychain: six providers, rotation/deletion, no plaintext fallback, clean load/save, preserved settings and Ollama passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

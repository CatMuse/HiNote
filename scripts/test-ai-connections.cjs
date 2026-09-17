const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modules = new Map();
let requests = [], respond = async () => ({ status: 200, json: {} });
const settings = [], pickers = [];
const element = () => ({ isConnected: true, text: '', children: [],
    createDiv(options = {}) { const child = element(); child.text = options.text || ''; this.children.push(child); return child; },
    setText(text) { this.text = text; }, addEventListener() {} });
class Setting {
    constructor() { this.descEl = element(); this.buttons = []; settings.push(this); }
    setName(name) { this.name = name; return this; }
    setDesc(desc) { this.desc = desc; return this; }
    addText(cb) { this.input = { setPlaceholder() { return this; }, setValue(v) { this.value = v; return this; }, onChange(fn) { this.change = fn; return this; } }; cb(this.input); return this; }
    addButton(cb) { const b = { setButtonText(text) { this.text = text; return this; }, setDisabled(v) { this.disabled = v; return this; }, onClick(fn) { this.click = fn; return this; } }; this.buttons.push(b); cb(b); return this; }
}
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, { exports, console, URL, Date, Error, TypeError, window: { setTimeout, clearTimeout }, require: name => {
        if (name === 'obsidian') return { Setting, FuzzySuggestModal: class { setPlaceholder() {} open() { pickers.push(this); } }, Notice: class {}, requestUrl: params => { requests.push(params); return respond(params); } };
        if (name.endsWith('/i18n')) return { t: text => text };
        if (!name.startsWith('.')) return require(name);
        let target = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } }, { filename: file });
    return exports;
}
const ok = json => ({ status: 200, json });
(async () => {
    const { apiRoot, discoverModels } = load('src/services/ai/ModelDiscovery.ts');
    assert.equal(apiRoot('https://example.invalid/v1/messages/', 'anthropic'), 'https://example.invalid/v1');
    assert.equal(apiRoot('https://example.invalid', 'gemini'), 'https://example.invalid/v1beta');
    assert.throws(() => apiRoot('https://example.invalid?key=private', 'openai'), /base URL/);
    respond = async params => ok(params.url.includes('after_id=') ? { data: [{ id: 'second' }], has_more: false } : { data: [{ id: 'first' }], has_more: true, last_id: 'first' });
    assert.equal((await discoverModels('https://example.invalid', 'anthropic', {})).length, 2);
    respond = async params => ok(params.url.includes('pageToken=') ? { models: [{ name: 'models/second', supportedGenerationMethods: ['generateContent'] }] } : { models: [{ name: 'models/embed', supportedGenerationMethods: ['embedContent'] }, { name: 'models/first', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'next' });
    assert.equal((await discoverModels('https://example.invalid', 'gemini', {})).map(m => m.id).join(','), 'first,second');
    respond = async () => ok({ data: [], has_more: true, last_id: 'same' });
    await assert.rejects(discoverModels('https://example.invalid', 'anthropic', {}), /Repeated/);
    const { BaseHTTPClient } = load('src/services/ai/BaseHTTPClient.ts');
    let finish;
    respond = () => new Promise(resolve => { finish = resolve; });
    await assert.rejects(new BaseHTTPClient().request({ url: 'https://example.invalid', method: 'GET', timeout: 5 }), /timeout/);
    finish(ok({ late: true }));
    respond = async () => ({ status: 401, json: { error: { message: 'bad key' } } });
    await assert.rejects(new BaseHTTPClient().request({ url: 'https://example.invalid', method: 'GET' }), /HTTP 401/);
    const { CustomAIService } = load('src/services/ai/CustomAIService.ts');
    requests = [];
    await assert.rejects(new CustomAIService('dummy', 'https://example.invalid/v1', 'selected', {}, 'anthropic').chat([{ role: 'user', content: 'test' }]), /401/);
    assert.equal(requests.length, 1, 'Failure must never trigger protocol probing');
    assert.ok(requests[0].url.endsWith('/v1/messages'));
    respond = async () => ok({ choices: [{ message: { content: 'OK' } }] });
    const { OpenAIService } = load('src/services/ai/OpenAIService.ts');
    requests = [];
    assert.ok(await new OpenAIService('dummy', 'chosen-model', 'https://example.invalid/v1/').testConnection());
    const body = JSON.parse(requests[0].body);
    assert.equal(body.model, 'chosen-model');
    assert.equal(body.temperature, undefined);
    assert.ok(!requests[0].url.includes('//chat'));
    respond = async () => ok({});
    await assert.rejects(new OpenAIService('dummy', 'chosen-model').testConnection(), /response format/);
    respond = async () => ok({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] });
    const { GeminiService } = load('src/services/ai/GeminiService.ts');
    requests = [];
    await new GeminiService('dummy-secret', 'models/example', 'https://example.invalid/v1beta').testConnection();
    assert.equal(requests[0].headers['x-goog-api-key'], 'dummy-secret');
    assert.ok(requests[0].url.endsWith('/v1beta/models/example:generateContent'));
    assert.ok(!requests[0].url.includes('dummy-secret'));
    const { OllamaService } = load('src/services/ai/OllamaService.ts');
    requests = []; respond = async () => ({ status: 500, json: {} });
    await assert.rejects(new OllamaService().chat('chosen', [{ role: 'user', content: 'test' }]));
    assert.equal(requests.length, 1, 'Generation must not be retried');

    const { renderAIConnectionControls } = load('src/settings/ai/AIConnectionControls.ts');
    let model = 'saved-unlisted', endpoint = 'one', discoveryCalls = 0, deferred;
    let list = async () => [{ id: 'fresh', name: 'Fresh' }];
    let chat = async () => 'OK';
    const container = element();
    renderAIConnectionControls(container, { app: {}, getModel: () => model, setModel: async id => { model = id; }, fingerprint: () => endpoint,
        create: () => ({ listModels: () => { discoveryCalls++; return list(); }, chat: () => chat() }) });
    assert.equal(discoveryCalls, 0, 'Opening settings must not send requests');
    const [modelRow, testRow] = settings;
    await modelRow.buttons[1].click();
    assert.equal(model, 'saved-unlisted', 'Refresh must preserve current model');
    await modelRow.buttons[0].click();
    pickers[0].onChooseItem({ id: 'fresh' });
    assert.equal(model, 'fresh');
    list = async () => { throw new Error('No models endpoint'); };
    await modelRow.buttons[1].click();
    await modelRow.input.change('manual-model');
    assert.equal(model, 'manual-model');
    chat = () => new Promise(resolve => { deferred = resolve; });
    const testing = testRow.buttons[0].click();
    endpoint = 'changed'; deferred('OK'); await testing;
    assert.equal(testRow.descEl.children[0].text, 'Not tested', 'Stale test results must not mark edited settings as connected');
    assert.equal(testRow.buttons[0].disabled, false);
    list = () => new Promise(resolve => { deferred = resolve; });
    const refreshing = modelRow.buttons[1].click();
    endpoint = 'changed-again'; deferred([{ id: 'stale' }]); await refreshing;
    assert.equal(model, 'manual-model');
    await modelRow.buttons[0].click();
    assert.equal(pickers.length, 1, 'Stale lists must not be offered');
    console.log('AI connections: pagination, protocol isolation, timeouts, HTTP errors, real model tests, no retries, manual selection and stale UI results passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

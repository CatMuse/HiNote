const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modules = new Map();
class TFile {}
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(code, { exports, console, window: { setTimeout: () => 0 }, require: name => {
        if (name === 'obsidian') return { TFile, moment: { locale: () => 'en' } };
        if (name.endsWith('/card/Clipboard')) return { HighlightCardClipboard: {} };
        if (name.endsWith('/actions/HighlightDeletionManager')) return { HighlightDeletionManager: class {} };
        if (name === '../../../services/highlight') return load('src/services/highlight/HighlightCommentResolver.ts');
        if (!name.startsWith('.')) return require(name);
        const target = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } }, { filename: file });
    return exports;
}
const { HighlightExtractor } = load('src/services/highlight/HighlightExtractor.ts');
const { highlightColorStyle, DEFAULT_HIGHLIGHT_COLOR, isDefaultHighlightColor } = load('src/services/highlight/HighlightColor.ts');
const { HighlightMatcher } = load('src/services/highlight/HighlightMatcher.ts');
const { HighlightBatchOps } = load('src/services/highlight/HighlightBatchOps.ts');
const { HighlightRegexUtils } = load('src/utils/HighlightRegexUtils.ts');
const { findStoredHighlightMatch } = load('src/services/highlight/HighlightMatchStrategies.ts');
const { createHighlightRecord } = load('src/models/HighlightModels.ts');
const { encodeHighlightRecord, decodeHighlightRecord } = load('src/storage/HighlightDataFormat.ts');
const file = Object.assign(new TFile(), { path: 'example.md', extension: 'md', basename: 'example' });
const app = { metadataCache: { getFileCache: () => null } };
const extractor = new HighlightExtractor(app);
const extract = source => extractor.extractHighlights(source, file);
const batch = new HighlightBatchOps(app, extractor);
const pairs = [['🔴🟥','red'], ['🟠🟧','orange'], ['🟡🟨','yellow'], ['🟢🟩','green'], ['🔵🟦','blue'], ['🟣🟪','purple']];
for (const [markers, color] of pairs) for (const marker of markers) {
    const source = `before ==${marker}正文== after`;
    const [h] = extract(source);
    assert.equal(h.text, '正文');
    assert.equal(h.backgroundColor, highlightColorStyle(color));
    assert.equal(h.position, 7);
    assert.equal(h.originalLength, `==${marker}正文==`.length);
    assert.equal(batch.removeHighlightMarkFromContent(source, h), 'before 正文 after');
    const roundTrip = decodeHighlightRecord('saved-id', encodeHighlightRecord(createHighlightRecord(h, 'saved-id', file.path, 1)), file.path);
    assert.equal(roundTrip.syntax, 'markdown');
    assert.equal(roundTrip.backgroundColor, h.backgroundColor);
}
assert.equal(extract('==字==')[0].text, '字');
assert.equal(extract('==🔴字====🔵字==').length, 0); // Extra equals are deliberately excluded.
assert.equal(extract('==🔴字== ==🔵字==').length, 2);
assert.equal(extract('==🔴==').length, 0);
assert.equal(extract('==🔴🔵正文==')[0].text, '🔵正文');
for (const text of [' 🔴正文', '正文🔴', '🔶正文']) {
    assert.equal(extract(`==${text}==`)[0].text, text);
    assert.equal(extract(`==${text}==`)[0].backgroundColor, DEFAULT_HIGHLIGHT_COLOR);
}
const html = extract('<mark style="background-color: #abc">🔴正文</mark>')[0];
assert.equal(html.text, '🔴正文');
assert.equal(html.backgroundColor, '#abc');
assert.equal(html.syntax, 'html');
const custom = new HighlightExtractor(app, () => ({ useCustomPattern: true, regexRules: [
    { enabled: true, pattern: '==(.+?)==', color: '#123456' }
] }));
assert.equal(custom.extractHighlights('==普通==', file)[0].backgroundColor, '#123456');
assert.equal(custom.extractHighlights('==🟢正文==', file)[0].backgroundColor, highlightColorStyle('green'));
const codeExtractor = new HighlightExtractor({ metadataCache: { getFileCache: () => ({ sections: [
    { type: 'code', position: { start: { offset: 0 }, end: { offset: 20 } } }
] }) } });
assert.equal(codeExtractor.extractHighlights('==🔴代码==', file).length, 0);

const [red] = extract('==🔴相同正文==');
const old = { ...red, id: 'saved-comment', text: '🔴相同正文', syntax: undefined,
    comments: [{ id: 'comment', content: 'Keep me' }] };
const matcher = new HighlightMatcher();
for (const source of ['==🔵相同正文==', '==相同正文==']) {
    const current = extract(source)[0];
    const [merged] = matcher.mergeHighlightsWithComments([current], [old], file);
    assert.equal(merged.id, 'saved-comment');
    assert.equal(merged.comments[0].content, 'Keep me');
    assert.equal(merged.text, '相同正文');
    assert.equal(merged.backgroundColor, current.backgroundColor);
}
const double = extract('==🔴🔵正文==')[0];
assert.equal(findStoredHighlightMatch(double, [{ ...double, id: 'normalized' }]).highlight.id, 'normalized');
assert.equal(findStoredHighlightMatch(extract('==正文==')[0], [{ ...html, id: 'html' }]), null);
assert.equal(findStoredHighlightMatch(extract('==正文==')[0], [{ ...html, syntax: undefined, kind: 'file-comment' }]), null);
const source = '==🔴重复== and ==🔵重复==';
const current = extract(source);
const legacy = current.map((h, i) => ({ ...h, syntax: undefined, text: ['🔴重复','🔵重复'][i], id: `old-${i}` }));
const merged = matcher.mergeHighlightsWithComments(current, legacy, file);
assert.equal(merged[0].id, 'old-0');
assert.equal(merged[1].id, 'old-1');
assert.equal(batch.removeHighlightMarkFromContent(source, current[1]), '==🔴重复== and 重复');
assert.equal(
    HighlightRegexUtils.removeHighlightFormatInRange(
        source, current[1].text, current[1].position, current[1].position + current[1].originalLength
    ),
    '==🔴重复== and 重复'
);
assert.equal(batch.removeHighlightMarkFromContent(source, { text: '重复' }), source);
assert.equal(batch.removeHighlightMarkFromContent('==🔴正文==', { text: '🔴正文', position: 0 }), '正文');

const { recolorHighlightSource, extractHtmlHighlightColor, HIGHLIGHT_COLOR_CHOICES } = load('src/services/highlight/HighlightColorEdit.ts');
assert.deepEqual(Array.from(HIGHLIGHT_COLOR_CHOICES, choice => choice.color), [null, 'red', 'orange', 'yellow', 'green', 'blue', 'purple']);
assert.equal(HIGHLIGHT_COLOR_CHOICES[0].marker, '');
assert.equal(recolorHighlightSource('==正文==', 'yellow'), '==🟡正文==');
assert.equal(recolorHighlightSource('==🟡正文==', null), '==正文==');
assert.equal(extract('==正文==')[0].backgroundColor, DEFAULT_HIGHLIGHT_COLOR);
assert.equal(extract('==🟡正文==')[0].backgroundColor, highlightColorStyle('yellow'));
assert.notEqual(DEFAULT_HIGHLIGHT_COLOR, highlightColorStyle('yellow'));
assert.equal(isDefaultHighlightColor(highlightColorStyle('yellow')), false);
assert.equal(isDefaultHighlightColor(DEFAULT_HIGHLIGHT_COLOR), true);
assert.equal(isDefaultHighlightColor('#ffeb3b'), true, 'Legacy default remains recognizable');
const plainWithComments = { ...extract('==正文==')[0], id: 'default-with-comment', backgroundColor: '#ffeb3b', comments: [{ id: 'kept', content: 'Keep this comment' }] };
for (const value of ['==正文==', '==🟡正文==']) {
    const scanned = extract(value)[0];
    const [updated] = matcher.mergeHighlightsWithComments([scanned], [plainWithComments], file);
    assert.equal(updated.id, 'default-with-comment');
    assert.equal(updated.comments[0].id, 'kept');
    assert.equal(updated.backgroundColor, scanned.backgroundColor);
}

for (const color of ['red', 'orange', 'yellow', 'green', 'blue', 'purple']) {
    const recolored = recolorHighlightSource('==🟦正文==', color);
    assert.equal(extract(recolored)[0].backgroundColor, highlightColorStyle(color));
    assert.equal(extract(recolored)[0].text, '正文');
    assert.equal(recolorHighlightSource(recolored, null), '==正文==');
}
assert.equal(recolorHighlightSource('==🔴🔵正文==', 'green'), '==🟢🔵正文==');
for (const tag of ['mark', 'span']) {
    const original = `<${tag} class="keep" data-id="42" style='color: red; background: #abc !important; font-weight: bold'>🔴正文</${tag}>`;
    const blue = recolorHighlightSource(original, 'blue');
    assert.ok(blue.includes('class="keep" data-id="42"'));
    assert.ok(blue.includes('color: red; background: #abc !important; font-weight: bold'));
    assert.ok(blue.endsWith(`>🔴正文</${tag}>`));
    assert.equal(extract(blue)[0].backgroundColor, highlightColorStyle('blue'));
    assert.equal(extract(blue)[0].text, '🔴正文');
    const green = recolorHighlightSource(blue, 'green');
    assert.equal((green.match(/background-color:/g) || []).length, 1);
    assert.equal(extractHtmlHighlightColor(green), highlightColorStyle('green'));
    const reset = recolorHighlightSource(green, null);
    assert.equal(extractHtmlHighlightColor(reset), 'var(--text-highlight-bg, #ffeb3b)');
    assert.equal(extract(recolorHighlightSource(`<${tag}>正文</${tag}>`, 'red'))[0].text, '正文');
}
assert.equal(extractHtmlHighlightColor('<mark style="background-color: red !important; background-color: blue">text</mark>'), 'red');
assert.ok(recolorHighlightSource('<mark style="background-image: url(data:image/png;base64,abc); color: red">text</mark>', 'blue')
    .includes('background-image: url(data:image/png;base64,abc); color: red'));
assert.throws(() => recolorHighlightSource('**custom**', 'red'));

const { PreviewHighlightResolver } = load('src/views/highlight/preview/PreviewHighlightResolver.ts');
const preview = new PreviewHighlightResolver({ getCachedHighlights: () => [old] });
const blueSource = '==🔵相同正文==';
const enriched = preview.enrichHighlightsWithComments(extract(blueSource), file, blueSource);
assert.equal(enriched.length, 1);
const root = { tagName: 'P' };
const mark = { parentElement: root, getAttribute: () => 'blue' };
assert.equal(preview.findMatchingHighlight('相同正文', mark, root,
    { getSectionInfo: () => ({ lineStart: 0, lineEnd: 0 }) }, enriched).id, 'saved-comment');
const coloredDuplicates = current.map((h, i) => ({ ...h, id: `duplicate-${i}`, line: 0 }));
assert.equal(preview.findMatchingHighlight('重复', mark, root,
    { getSectionInfo: () => ({ lineStart: 0, lineEnd: 0 }) }, coloredDuplicates).id, 'duplicate-1');
const { DataValidator } = load('src/storage/DataValidator.ts');
assert.equal(DataValidator.sanitizeHighlight(red).syntax, 'markdown');
assert.equal(DataValidator.sanitizeHighlight({ syntax: 'invalid' }).syntax, undefined);
const { ExportContentRenderer } = load('src/services/export/ExportContentRenderer.ts');
(async () => {
    const { SelectionHighlightActions } = load('src/editor/selection/SelectionHighlightActions.ts');
    // Use the real controller methods with UI dependencies stubbed: this covers
    // the comment-open path, which deliberately keeps the toolbar alive.
    const toolbarFile = path.resolve('src/editor/selection/SelectionColorToolbar.ts');
    const toolbarExports = {};
    const toolbarCode = ts.transpileModule(fs.readFileSync(toolbarFile, 'utf8') +
        '\nexport { SelectionColorController };', {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(toolbarCode, { exports: toolbarExports, console, require: name => {
        if (name === 'obsidian') return { Component: class {}, Notice: class { constructor(message) { throw Error(message); } }, setIcon: (el, name) => { el.icon = name; } };
        if (name.includes('SelectionCapture')) return { SelectionCapture: class {} };
        if (name === '@codemirror/view' || name.includes('/comment') || name.includes('SelectionToolbarDocuments')) return {};
        const target = path.resolve(path.dirname(toolbarFile), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } });
    const { SelectionColorController } = toolbarExports;
    class ColorElement {
        constructor(doc, options = {}) {
            this.ownerDocument = doc; this.options = options; this.children = []; this.events = {};
            this.attributes = { ...options.attr }; this.isConnected = true;
            this.properties = {};
            this.style = { setProperty: (key, value) => { this.properties[key] = value; } };
        }
        createDiv(options) { const child = new ColorElement(this.ownerDocument, options); this.children.push(child); return child; }
        createEl(tag, options) { const child = this.createDiv(options); child.tag = tag; return child; }
        getAttribute(key) { return this.attributes[key] ?? null; }
        setAttribute(key, value) { this.attributes[key] = value; }
        addEventListener(name, callback) { this.events[name] = callback; }
        getBoundingClientRect() { return { left: 20, right: 42, top: 100, bottom: 122, width: 220, height: 36 }; }
        focus() { this.ownerDocument.activeElement = this; }
        contains(target) { return this === target || this.children.some(child => child.contains(target)); }
        remove() { this.isConnected = false; }
        replaceChildren() { this.children = []; this.icon = undefined; }
        all() { return [this, ...this.children.flatMap(child => child.all())]; }
    }
    function colorDocument() {
        const doc = { addEventListener() {}, defaultView: { innerWidth: 1000, innerHeight: 800, addEventListener() {} } };
        doc.body = new ColorElement(doc);
        return doc;
    }
    // Render and click the real palette: Default and Yellow must never share a selection.
    const paletteExports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/highlight/card/ColorPalette.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports: paletteExports, require: name => {
        if (name === 'obsidian') return { Component: class { registerDomEvent(el, name, callback) { el.addEventListener(name, callback); } } };
        const target = path.resolve('src/components/highlight/card', name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } });
    for (const [current, selected] of [[DEFAULT_HIGHLIGHT_COLOR, 'Default'], [highlightColorStyle('yellow'), 'Yellow'], ['#ffeb3b', 'Default']]) {
        const doc = colorDocument(), trigger = new ColorElement(doc);
        let chosen = 'unset';
        const palette = new paletteExports.HighlightColorPalette(trigger, current, color => { chosen = color; }, () => palette.onunload());
        palette.onload();
        const buttons = doc.body.all().filter(el => el.attributes.role === 'menuitemradio');
        assert.equal(buttons.length, 7);
        assert.deepEqual(buttons.filter(el => el.attributes['aria-checked'] === 'true').map(el => el.attributes['aria-label']), [selected]);
        assert.match(buttons[0].options.cls, /is-default/);
        assert.equal(buttons[0].properties['--swatch-color'], DEFAULT_HIGHLIGHT_COLOR);
        buttons[0].events.click({ preventDefault() {}, stopPropagation() {} });
        assert.equal(chosen, null);
    }
    let yellowDocument = '==🟡正文==';
    const uiPlugin = { settings: {}, app: { ...app, vault: { getAbstractFileByPath: () => file, process: async (_file, action) => { yellowDocument = action(yellowDocument); } } } };
    const ui = new SelectionColorController(uiPlugin), doc = colorDocument();
    const yellowSource = extract(yellowDocument)[0];
    const context = { file, snapshot: yellowDocument, plan: { from: 0, to: yellowSource.originalLength, source: yellowSource }, markdownView: { containerEl: { ownerDocument: doc } } };
    ui.hide = () => {};
    ui.registerToolbarEvents = () => {};
    ui.deleteHighlight = () => { throw Error('Switching from Yellow to Default must not delete the highlight'); };
    ui.render({ context, anchor: { top: 100, bottom: 120, left: 20, right: 160 } });
    const swatches = ui.colorButtons;
    assert.equal(swatches.length, 7);
    assert.equal(swatches[0].button.properties['--swatch-color'], DEFAULT_HIGHLIGHT_COLOR);
    assert.deepEqual(Array.from(swatches.filter(item => item.button.attributes['aria-pressed'] === 'true'), item => item.color), ['yellow']);
    swatches[0].button.events.click({ preventDefault() {}, stopPropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(yellowDocument, '==正文==', 'Default removes only the explicit color marker');
    ui.updateColorSelection(context);
    assert.deepEqual(Array.from(swatches.filter(item => item.button.attributes['aria-pressed'] === 'true'), item => item.color), [null]);
    swatches.find(item => item.color === 'yellow').button.events.click({ preventDefault() {}, stopPropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(yellowDocument, '==🟡正文==');

    // Disabling the toolbar blocks both entry points and captures already in flight.
    const gatedPlugin = { ...uiPlugin, settings: { showSelectionToolbar: false } };
    const gated = new SelectionColorController(gatedPlugin);
    let captures = 0, renders = 0;
    gated.selectionCapture = {
        captureSelection: async () => { captures++; return { context, anchor: {} }; },
        captureHighlightClick: async () => { captures++; return { context, anchor: {} }; }
    };
    gated.render = () => { renders++; };
    await gated.show();
    await gated.showForHighlightClick({});
    assert.equal(captures, 0, 'Disabled toolbar must not capture text or highlight clicks');
    gatedPlugin.settings.showSelectionToolbar = true;
    gated.hide = () => {};
    await gated.show();
    await gated.showForHighlightClick({});
    assert.equal(renders, 2, 'Re-enabling works without reloading');
    const inFlight = new SelectionColorController(gatedPlugin);
    let resolveCapture;
    inFlight.selectionCapture = { captureSelection: () => new Promise(resolve => { resolveCapture = resolve; }) };
    inFlight.hide = () => {};
    const pendingShow = inFlight.show();
    gatedPlugin.settings.showSelectionToolbar = false;
    const before = doc.body.children.length;
    resolveCapture({ context, anchor: {} });
    await pendingShow;
    assert.equal(doc.body.children.length, before, 'Disabling during capture prevents a late popup');

    const { normalizeSettings } = load('src/settings/SettingsMigration.ts');
    assert.equal(normalizeSettings({}).showSelectionToolbar, true);
    assert.equal(normalizeSettings({ showSelectionToolbar: false }).showSelectionToolbar, false);

    for (const mode of ['editor', 'reading']) {
        let document = '前 正文 后 ==正文==';
        const plugin = { app: { ...app, vault: {
            getAbstractFileByPath: () => file,
            read: async () => document,
            process: async (_file, callback) => { document = callback(document); }
        } } };
        const actions = new SelectionHighlightActions(plugin, extractor);
        const context = { file, snapshot: document, plan: { from: 2, to: 4 } };
        if (mode === 'editor') context.view = {
            dom: { isConnected: true },
            state: { doc: { toString: () => document } },
            dispatch: ({ changes }) => {
                document = document.slice(0, changes.from) + changes.insert + document.slice(changes.to);
            }
        };
        const prepared = await actions.ensureHighlighted(context);
        assert.equal(prepared.rollback.originalSnapshot, '前 正文 后 ==正文==');
        assert.equal(prepared.rollback.originalPlan.to, 4);
        assert.equal(document, '前 ==正文== 后 ==正文==');
        const controller = new SelectionColorController(plugin);
        controller.actions = actions;
        controller.commentInputActive = true;
        controller.pendingAutoHighlight = { context, ...prepared.rollback };
        controller.updateColorSelection = current => {
            assert.equal(current.snapshot, document);
            assert.equal(current.plan.to, 2 + current.plan.source.originalLength);
        };
        controller.hide = () => { throw new Error('An open comment must survive recoloring'); };
        for (const color of ['blue', 'red', null, 'purple']) {
            await controller.apply(context, color);
            const marker = color ? { blue: '🔵', red: '🔴', purple: '🟣' }[color] : '';
            assert.equal(document, `前 ==${marker}正文== 后 ==正文==`, `${mode}: only the selected occurrence changes`);
            assert.equal(context.snapshot, document);
            assert.equal(context.plan.source.backgroundColor, highlightColorStyle(color));
        }
        assert.equal(controller.pendingAutoHighlight, undefined, 'Explicit color selection must survive cancelling an empty comment');
        controller.closeComment = () => {};
        await controller.cancelComment(false);
        assert.equal(document, '前 ==🟣正文== 后 ==正文==');
        const snapshot = context.snapshot;
        document = 'external edit ' + document;
        await assert.rejects(() => controller.apply(context, 'green'), /selection changed/);
        assert.equal(document, 'external edit ' + snapshot, 'External edits still reject stale source ranges');
        assert.equal(context.snapshot, snapshot, 'A failed write must not advance the captured context');
    }
    const { HighlightService } = load('src/services/HighlightService.ts');
    const { scanToHighlightView } = load('src/models/HighlightModels.ts');
    let document = '==重复== and ==重复==';
    const editApp = { ...app, vault: {
        getAbstractFileByPath: () => file,
        process: async (_file, callback) => { document = callback(document); return document; }
    } };
    const service = new HighlightService(editApp);
    const originalScans = service.extractHighlights(document, file);
    const target = scanToHighlightView(originalScans[1]);
    const edited = await service.changeHighlightColor(target, 'blue');
    assert.equal(document, '==重复== and ==🔵重复==');
    assert.equal(edited.text, '重复');
    assert.equal(edited.originalLength, '==🔵重复=='.length);
    await assert.rejects(() => service.changeHighlightColor(target, 'green'), /source has changed/);
    assert.equal(document, '==重复== and ==🔵重复==');
    await service.changeHighlightColor(scanToHighlightView(edited), null);
    assert.equal(document, '==重复== and ==重复==');
    const beforeExternalEdit = scanToHighlightView(service.extractHighlights(document, file)[1]);
    document = 'inserted text ' + document;
    await assert.rejects(() => service.changeHighlightColor(beforeExternalEdit, 'red'), /source has changed/);
    assert.equal(document, 'inserted text ==重复== and ==重复==');
    await assert.rejects(() => service.changeHighlightColor({ ...target, kind: 'file-comment' }, 'red'));
    await assert.rejects(() => service.changeHighlightColor(JSON.parse(JSON.stringify(target)), 'red'));
    document = '<span style="background-color: #abc; color: red">正文</span>';
    const htmlTarget = scanToHighlightView(service.extractHighlights(document, file)[0]);
    const htmlUpdated = await service.changeHighlightColor(htmlTarget, 'purple');
    assert.equal(htmlUpdated.backgroundColor, highlightColorStyle('purple'));
    assert.ok(document.includes('color: red'));

    const secondFile = Object.assign(new TFile(), { path: 'second.md', extension: 'md', basename: 'second' });
    const filesByPath = new Map([[file.path,file],[secondFile.path,secondFile]]);
    const documents = new Map([[file.path,'==重复== / ==重复== / <mark style="color: red">HTML</mark>'],
        [secondFile.path,'==另一文件==']]);
    let writes = 0;
    const batchService = new HighlightService({ ...app, vault: {
        getAbstractFileByPath:path=>filesByPath.get(path),
        process:async (target,callback)=>{const next=callback(documents.get(target.path)); writes++;documents.set(target.path,next);return next;}
    } });
    const batchRows = batchService.extractHighlights(documents.get(file.path),file).map(scanToHighlightView);
    batchRows[0].comments=[{id:'comment-kept',content:'Keep this comment'}];
    const otherRow=scanToHighlightView(batchService.extractHighlights(documents.get(secondFile.path),secondFile)[0]);
    const recolored=await batchService.batchChangeHighlightColors([...batchRows,otherRow,{...otherRow,kind:'file-comment'}], 'green');
    assert.equal(writes,2,'One atomic write per file');
    assert.equal(recolored.updated.size,4);
    assert.equal(recolored.skipped,1);
    assert.equal(recolored.failed,0);
    assert.ok(documents.get(file.path).startsWith('==🟢重复== / ==🟢重复== / <mark'));
    assert.ok(documents.get(file.path).includes('color: red'));
    const secondChanged=recolored.updated.get(batchRows[1]);
    assert.equal(secondChanged.position,'==🟢重复== / '.length);
    assert.equal(batchRows[0].comments[0].id,'comment-kept');
    const reset=await batchService.batchChangeHighlightColors([...recolored.updated.values()].map(scanToHighlightView),null);
    assert.equal(reset.updated.size,4);
    assert.ok(documents.get(file.path).startsWith('==重复== / ==重复== / <mark'));
    const fresh=batchService.extractHighlights(documents.get(file.path),file).map(scanToHighlightView);
    const otherFresh=scanToHighlightView(batchService.extractHighlights(documents.get(secondFile.path),secondFile)[0]);
    const unchanged=documents.get(file.path);
    documents.set(file.path,'external edit '+unchanged);
    const partial=await batchService.batchChangeHighlightColors([...fresh,otherFresh],'blue');
    assert.equal(partial.failed,3);
    assert.equal(partial.updated.size,1,'A stale file does not prevent updating a separate file');
    assert.equal(documents.get(file.path),'external edit '+unchanged,'A stale group writes nothing');
    assert.equal(documents.get(secondFile.path),'==🔵另一文件==');
    const now=batchService.extractHighlights(documents.get(secondFile.path),secondFile).map(scanToHighlightView);
    const overlap=await batchService.batchChangeHighlightColors([now[0],{...now[0]}],'purple');
    assert.equal(overlap.failed,2);
    assert.equal(documents.get(secondFile.path),'==🔵另一文件==','Overlapping selections cannot partially write a file');

    let anchor;
    const renderer = new ExportContentRenderer({ createBlockIdForHighlight: async (...args) => {
        anchor = args;
        return 'example#^test';
    } });
    const result = await renderer.generateExportContent(file, [red]);
    assert.ok(result.includes('相同正文'));
    assert.ok(!result.includes('🔴'));
    const fileCommentResult = await renderer.generateExportContent(file, [{
        kind: 'file-comment', text: 'File Comment', position: 0,
        comments: [{ id: 'file-note', content: 'Whole-note observation', createdAt: 1, updatedAt: 1 }]
    }]);
    assert.ok(fileCommentResult.includes('[!note] File comment'));
    assert.ok(fileCommentResult.includes('[[example.md|example]]'));
    assert.ok(fileCommentResult.includes('Whole-note observation'));
    await renderer.generateExportContent(file, [red], '{{highlightText}} {{highlightBlockRef}}');
    assert.equal(anchor[1], red.position);
    assert.equal(anchor[2], '==🔴相同正文=='.length);
    let content = source;
    const operations = new HighlightBatchOps({ vault: {
        getAbstractFileByPath: () => file,
        process: async (file, callback) => { content = callback(content); }
    } }, extractor);
    const removed = await operations.batchRemoveHighlightMarks(current);
    assert.equal(removed.success, 2);
    assert.equal(content, '重复 and 重复');
    content = source;
    const ambiguous = await operations.batchRemoveHighlightMarks([{ text: '重复', filePath: file.path }]);
    assert.equal(ambiguous.failed, 1);
    assert.equal(content, source);
    console.log('Highlight colors passed: 12 markers, source spans, legacy comments, recoloring, duplicates, storage, preview, export and removal.');
})().catch(error => { console.error(error); process.exitCode = 1; });

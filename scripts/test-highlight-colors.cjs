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
        if (name === '../../../services/highlight') return load('src/services/highlight/HighlightCommentResolver.ts');
        if (!name.startsWith('.')) return require(name);
        const target = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } }, { filename: file });
    return exports;
}
const { HighlightExtractor } = load('src/services/highlight/HighlightExtractor.ts');
const { highlightColorStyle } = load('src/services/highlight/HighlightColor.ts');
const { HighlightMatcher } = load('src/services/highlight/HighlightMatcher.ts');
const { HighlightBatchOps } = load('src/services/highlight/HighlightBatchOps.ts');
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
    assert.equal(extract(`==${text}==`)[0].backgroundColor, '#ffeb3b');
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
assert.equal(findStoredHighlightMatch(extract('==正文==')[0], [{ ...html, syntax: undefined, isVirtual: true }]), null);
const source = '==🔴重复== and ==🔵重复==';
const current = extract(source);
const legacy = current.map((h, i) => ({ ...h, syntax: undefined, text: ['🔴重复','🔵重复'][i], id: `old-${i}` }));
const merged = matcher.mergeHighlightsWithComments(current, legacy, file);
assert.equal(merged[0].id, 'old-0');
assert.equal(merged[1].id, 'old-1');
assert.equal(batch.removeHighlightMarkFromContent(source, current[1]), '==🔴重复== and 重复');
assert.equal(batch.removeHighlightMarkFromContent(source, { text: '重复' }), source);
assert.equal(batch.removeHighlightMarkFromContent('==🔴正文==', { text: '🔴正文', position: 0 }), '正文');

const { recolorHighlightSource, extractHtmlHighlightColor } = load('src/services/highlight/HighlightColorEdit.ts');
for (const color of ['red', 'orange', 'green', 'blue', 'purple']) {
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
    await assert.rejects(() => service.changeHighlightColor({ ...target, isVirtual: true }, 'red'));
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
    const recolored=await batchService.batchChangeHighlightColors([...batchRows,otherRow,{...otherRow,isVirtual:true}], 'green');
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

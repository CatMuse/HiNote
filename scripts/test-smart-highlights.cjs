const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const modules = new Map();

function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(code, { exports, console, require: name => {
        if (!name.startsWith('.')) return require(name);
        const target = path.resolve(path.dirname(file), name);
        return load(fs.existsSync(target + '.ts') ? target + '.ts' : path.join(target, 'index.ts'));
    } }, { filename: file });
    return exports;
}

const { SmartHighlightCandidateExtractor } = load('src/services/smart-highlight/CandidateExtractor.ts');
const { SmartHighlightApplier } = load('src/services/smart-highlight/SmartHighlightApplier.ts');
const extractor = new SmartHighlightCandidateExtractor();
const source = [
    '---', 'title: Hidden metadata sentence.', '---',
    '# Main section',
    'This is an important complete sentence for careful readers.',
    '==This passage is already highlighted and must be skipped.==',
    '```ts', 'const hidden = "Do not recommend this code sentence.";', '```',
    '- A list item can contain a useful standalone conclusion.',
    '| Column | Table sentence should be skipped |',
    '第一句包含一个值得记住的观点。第二句解释了这个观点为何成立。'
].join('\n');
const candidates = extractor.extract(source);
assert.equal(candidates.length, 4);
assert.ok(candidates.every(candidate => source.slice(candidate.start, candidate.end) === candidate.rawText));
assert.ok(candidates.every(candidate => candidate.sectionHeading === 'Main section'));
assert.ok(candidates.some(candidate => candidate.text.startsWith('A list item')));
assert.ok(candidates.some(candidate => candidate.text.startsWith('第一句')));
assert.ok(!candidates.some(candidate => /metadata|already highlighted|code sentence|Table/.test(candidate.text)));

function editor(initial) {
    let value = initial;
    return {
        getValue: () => value,
        offsetToPos: offset => ({ line: 0, ch: offset }),
        transaction: tx => {
            for (const change of [...tx.changes].sort((a, b) => b.from.ch - a.from.ch)) {
                value = value.slice(0, change.from.ch) + change.text + value.slice(change.to.ch);
            }
        },
        value: () => value
    };
}
const selected = candidates.slice(0, 2).map(candidate => ({
    candidate, selected: true, category: 'claim', categoryConfidence: 1,
    importanceConfidence: 1, importanceProbabilities: { 3: 1 }, standaloneProbability: 1, rank: 1
}));
const target = editor(source);
assert.equal(new SmartHighlightApplier().apply(target, { snapshot: source, evaluations: selected, color: 'blue' }), 2);
assert.equal((target.value().match(/==🔵/g) || []).length, 2);
assert.throws(() => new SmartHighlightApplier().apply(target, {
    snapshot: source, evaluations: selected, color: null
}), /document changed/);
const overlapCandidate = {
    ...selected[0].candidate,
    end: selected[1].candidate.end,
    rawText: source.slice(selected[0].candidate.start, selected[1].candidate.end)
};
const overlap = [{ ...selected[0], candidate: overlapCandidate }, selected[1]];
assert.throws(() => new SmartHighlightApplier().apply(editor(source), {
    snapshot: source, evaluations: overlap, color: null
}), /overlap/);
console.log('Smart highlights passed: safe Markdown candidates, exact offsets, atomic colored apply, stale and overlap guards.');

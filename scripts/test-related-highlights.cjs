const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('src/services/related-highlights/RelatedHighlightRetriever.ts', 'utf8');
const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const moduleExports = {};
vm.runInNewContext(code, { exports: moduleExports, require: name => {
    if (name === '../../types/highlight') return { isFileComment: item => item.kind === 'file-comment' };
    throw new Error(`Unexpected import: ${name}`);
} });
const { RelatedHighlightRetriever } = moduleExports;
const retriever = new RelatedHighlightRetriever();
const highlight = (filePath, text, comments = []) => ({
    filePath, fileName: filePath.replace('.md', ''), text,
    comments: comments.map((content, index) => ({ id: String(index), content }))
});
const library = [
    highlight('current.md', 'Spaced repetition belongs to the current note.'),
    highlight('memory.md', 'Spaced repetition improves long-term memory retention.'),
    highlight('learning.md', 'Retrieval practice strengthens durable learning.'),
    highlight('unrelated.md', 'Garden soil benefits from compost.'),
    highlight('cards.md', 'Flashcards need good prompts.', ['Use spaced repetition scheduling.']),
    highlight('中文.md', '间隔重复能够提高长期记忆效果。'),
    ...Array.from({ length: 6 }, (_, index) => highlight('duplicate-source.md', `Spaced repetition detail ${index}.`))
];
const results = retriever.search('current.md', '# Spaced repetition\nStudy memory and retrieval practice. 间隔重复与长期记忆。', library, 20);
assert.ok(results.length >= 4);
assert.equal(results.some(item => item.highlight.filePath === 'current.md'), false);
assert.ok(results.slice(0, 3).some(item => item.highlight.filePath === 'memory.md'));
assert.ok(results.find(item => item.highlight.filePath === '中文.md'));
assert.ok(results.find(item => item.highlight.filePath === 'cards.md'), 'Comments participate in retrieval');
assert.ok(results.filter(item => item.highlight.filePath === 'duplicate-source.md').length <= 3);
assert.equal(results[0].localScore, 1);
assert.ok(results.every(item => item.finalScore >= 0 && item.finalScore <= 1));
const profile = retriever.profile('folder/current.md', '---\nsecret: metadata\n---\n# First\nUseful body.\n```\nhidden code\n```');
assert.equal(profile.title, 'current');
assert.deepEqual(Array.from(profile.headings), ['First']);
assert.ok(!profile.excerpt.includes('metadata'));
assert.ok(!profile.excerpt.includes('hidden code'));
console.log('Related highlights passed: bilingual local ranking, comments, current-note exclusion, diversity and bounded profile.');

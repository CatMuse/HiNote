const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let locale = 'en';
function load(name) {
    const filename = path.join(root, 'src/i18n', `${name}.ts`);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(code, {
        module, exports: module.exports, Date,
        require: id => id === 'obsidian' ? { moment: { locale: () => locale } } : load(id.replace('./', ''))
    }, { filename });
    return module.exports;
}
const en = load('en').default;
const zh = load('zh').default;
const { t, getLanguage, getDateLocale, formatDate, formatDateTime } = load('index');
locale = 'zh-cn';
assert.equal(t('Add comment...'), '添加批注…');
assert.equal(t('Created {count} HiCards.', { count: 0 }), '已创建 0 张闪卡。');
assert.equal(t('Prompt "{name}" not found.', { name: '$& {count}' }), '未找到提示词“$& {count}”。');
assert.equal(t('Unknown {value}', { value: '' }), 'Unknown ');
assert.equal(t('Unknown {value}'), 'Unknown {value}');
assert.equal(t('Unknown {value}', {}), 'Unknown {value}');
assert.equal(t('__proto__'), '__proto__');
locale = 'en';
assert.equal(t('Created {count} HiCards.', { count: 2 }), 'Created 2 HiCards.');
assert.equal(t('General'), 'General');
const date = new Date(2026, 8, 18, 13, 25);
for (const [input, language, expected] of [['zh-cn', 'zh', 'zh-CN'], ['zh-tw', 'zh', 'zh-TW'], ['en-gb', 'en', 'en-gb'], ['fr', 'en', 'en']]) {
    locale = input;
    assert.equal(getLanguage(), language);
    assert.equal(getDateLocale(), expected);
    assert.equal(formatDate(date), date.toLocaleDateString(expected));
    assert.equal(formatDateTime(date), date.toLocaleString(expected));
}
const placeholders = text => [...new Set([...text.matchAll(/(?<!\{)\{([a-zA-Z][a-zA-Z0-9_]*)\}(?!\})/g)].map(match => match[1]))].sort();
for (const [language, dictionary] of Object.entries({ en, zh })) {
    for (const [key, value] of Object.entries(dictionary)) {
        assert.deepEqual(placeholders(value), placeholders(key), `${language}: parameter mismatch in ${key}`);
    }
    const filename = `src/i18n/${language}.ts`;
    const source = ts.createSourceFile(filename, fs.readFileSync(path.join(root, filename), 'utf8'), ts.ScriptTarget.Latest, true);
    const keys = new Set();
    function checkDuplicates(node) {
        if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
            assert.ok(!keys.has(node.name.text), `${filename}: duplicate ${node.name.text}`);
            keys.add(node.name.text);
        }
        ts.forEachChild(node, checkDuplicates);
    }
    checkDuplicates(source);
}
function files(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const filename = path.join(dir, entry.name);
        return entry.isDirectory() ? (entry.name === 'i18n' ? [] : files(filename)) : filename.endsWith('.ts') ? [filename] : [];
    });
}
let checked = 0;
const failures = [];
for (const filename of [...files(path.join(root, 'src')), path.join(root, 'main.ts')]) {
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const report = (node, message) => failures.push(`${path.relative(root, filename)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`);
    function checkKey(node) {
        if (!node) return;
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            checked++;
            if (!Object.hasOwn(zh, node.text)) report(node, `Missing Chinese translation: ${node.text}`);
            if (/[\u3400-\u9fff]/.test(node.text) && !Object.hasOwn(en, node.text)) report(node, `Missing English translation: ${node.text}`);
        } else if (ts.isConditionalExpression(node)) {
            checkKey(node.whenTrue); checkKey(node.whenFalse);
        } else if (ts.isTemplateExpression(node) || ts.isBinaryExpression(node)) {
            report(node, 'Use a stable translation key with parameters instead of a computed string');
        }
        // Variable keys (provider labels, user-defined names) are verified at their definitions.
    }
    function visit(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') checkKey(node.arguments[0]);
        if (ts.isNewExpression(node) && node.expression.getText(source) === 'Notice' && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0])) report(node, 'Notice must use a translated string');
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'heading') checkKey(node.initializer);
        ts.forEachChild(node, visit);
    }
    visit(source);
}
assert.deepEqual(failures, [], failures.join('\n'));
console.log(`i18n checks passed: ${checked} static keys, translation parameters, locale switching, dates, duplicates and Notice coverage.`);

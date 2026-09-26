const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const pluginEntry = path.join(root, 'main');
const violations = [];

function isTypeOnlyImport(node) {
    const clause = node.importClause;
    if (!clause || clause.isTypeOnly) return true;
    if (clause.name) return false;
    const bindings = clause.namedBindings;
    return !!bindings && ts.isNamedImports(bindings) && bindings.elements.every(element => element.isTypeOnly);
}

function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            scan(file);
            continue;
        }
        if (!file.endsWith('.ts')) continue;
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        source.forEachChild(node => {
            if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
            const request = node.moduleSpecifier.text;
            if (!request.startsWith('.')) return;
            const resolved = path.resolve(path.dirname(file), request).replace(/\.ts$/, '');
            if (resolved !== pluginEntry || isTypeOnlyImport(node)) return;
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            violations.push(`${path.relative(root, file)}:${line}`);
        });
    }
}

scan(sourceRoot);
assert.deepEqual(violations, [], `Runtime imports of main.ts are forbidden:\n${violations.join('\n')}`);
console.log('Architecture boundary passed: source modules only use main.ts as a type dependency.');

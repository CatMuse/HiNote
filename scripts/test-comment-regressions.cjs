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
    await key('Enter', { keyCode: 229 });
    assert.equal(saves, 2);
}

async function testEmptySave() {
    // Exercise the save action without constructing unrelated DOM components.
    const { CommentInput } = load('src/components/comment/CommentInput.ts', {
        './InlineAICommentHandler': {},
        './CommentInputView': {},
        './CommentInputCleanup': {},
        './CommentInputKeyboard': {},
        './CommentInputSaveController': {}
    });
    let cancelled = 0;
    const input = Object.create(CommentInput.prototype);
    input.textarea = { value: '   ' };
    input.cancelEdit = () => { cancelled++; };
    input.saveController = { saveCurrentContent: async () => false };
    await input.handleSave();
    assert.equal(cancelled, 1, 'An empty editor closes without saving an empty comment');
    input.textarea.value = 'Keep this unsaved comment';
    await input.handleSave();
    assert.equal(cancelled, 1, 'A failed non-empty save keeps the editor open');
    input.saveController.saveCurrentContent = async () => true;
    await input.handleSave();
    assert.equal(cancelled, 1);
}

async function testLastCommentDeletion() {
    const { CommentService } = load('src/services/comment/CommentService.ts', {
        obsidian: { Notice: class {} },
        '../../utils/IdGenerator': {},
        '../../i18n': { t: value => value }
    });
    for (const scenario of ['ordinary', 'virtual', 'linked', 'remaining', 'retained-metadata']) {
        let removed = 0, saved = 0, updatedCard = 0, removedCard = 0;
        const highlight = {
            id: 'highlight', text: 'Source text', position: 0,
            isVirtual: scenario === 'virtual',
            comments: [{ id: 'delete', content: 'Delete this' }]
        };
        if (scenario === 'remaining') highlight.comments.push({ id: 'keep', content: 'Keep this' });
        if (scenario === 'retained-metadata') highlight.favoritedAt = 123;
        const service = new CommentService({}, {
            fsrsManager: { findCardsBySourceId: () => scenario === 'linked' ? [{}] : [] }
        }, {
            removeHighlight: async () => { removed++; },
            addHighlight: async () => { saved++; }
        });
        service.updateState({ currentFile: { path: 'note.md' }, highlights: [highlight] });
        service.setCallbacks({
            onCardUpdate: () => { updatedCard++; },
            onCardRemove: () => { removedCard++; }
        });
        await service.deleteComment(highlight, 'delete');
        assert.equal(removedCard, scenario === 'virtual' ? 1 : 0);
        assert.equal(updatedCard, scenario === 'virtual' ? 0 : 1);
        assert.equal(removed, ['ordinary', 'virtual'].includes(scenario) ? 1 : 0);
        assert.equal(saved, ['linked', 'remaining', 'retained-metadata'].includes(scenario) ? 1 : 0);
        assert.equal(highlight.comments.length, scenario === 'remaining' ? 1 : 0);
    }
}

(async () => {
    await testKeyboard();
    await testEmptySave();
    await testLastCommentDeletion();
    const manifest = JSON.parse(fs.readFileSync('manifest.json'));
    const pkg = JSON.parse(fs.readFileSync('package.json'));
    const lock = JSON.parse(fs.readFileSync('package-lock.json'));
    const versions = JSON.parse(fs.readFileSync('versions.json'));
    assert.equal(manifest.version, '0.5.9');
    assert.equal(pkg.version, manifest.version);
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages[''].version, manifest.version);
    assert.equal(manifest.minAppVersion, '1.8.0');
    assert.equal(versions[manifest.version], manifest.minAppVersion);
    console.log('Comments: IME, desktop/mobile shortcuts, empty saves, deletion and version consistency passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });


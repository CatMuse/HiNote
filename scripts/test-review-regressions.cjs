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

async function testSettings() {
    let renders = 0, initialized = 0;
    const renderer = class { display() { renders++; } };
    const { AISettingTab } = load('src/settings/SettingsTab.ts', {
        obsidian: {
            PluginSettingTab: class {},
            Setting: class {
                nameEl = {};
                setName() { return this; }
                setHeading() { return this; }
                setClass() { return this; }
            }
        },
        './tabs/GeneralSettingsTab': { GeneralSettingsTab: renderer },
        './tabs/AIServiceTab': { AIServiceTab: renderer },
        '../flashcard': { FlashcardSettingsTab: renderer },
        '../i18n': { t: text => text },
        '../services/LicenseManager': { LicenseManager: class { async isActivated() { return true; } } },
        '../utils/ObsidianInternals': { ObsidianInternals: {} }
    });
    let resolveInitialization;
    const tab = new AISettingTab({}, { ensureServicesInitialized: () => {
        initialized++;
        return new Promise(resolve => { resolveInitialization = resolve; });
    } });
    const definitions = tab.getSettingDefinitions();
    assert.equal(initialized, 0, 'Search indexing must not initialize vault services');
    assert.equal(definitions.length, 3);
    assert.ok(definitions.every(item => item.searchable !== false));
    assert.ok(definitions.every(item => item.type !== 'page'), 'No secondary settings pages');
    for (const term of ['Export Path', 'API key', 'Target retention']) {
        assert.ok(definitions.some(item => item.aliases?.includes(term)));
    }
    const setting = { settingEl: { empty() {}, addClass() {}, createEl() {}, createDiv() { return this; }, removeAttribute() {} } };
    const searchGroup = { listEl: {} };
    const cleanup = definitions[1].render(setting, searchGroup);
    cleanup(); resolveInitialization();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(renders, 0, 'Closed settings must not render after initialization');
    definitions[1].render(setting, searchGroup); resolveInitialization();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(renders, 1);
    for (const definition of definitions) {
        definition.render(setting, searchGroup);
        resolveInitialization();
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(renders, 4, 'All three sections must render without tab selection');
}

async function testAICommentLocalUpdate() {
    class TFile { constructor(path) { this.path = path; } }
    let nextId = 0;
    const { CommentService } = load('src/services/comment/CommentService.ts', {
        obsidian: { TFile, Notice: class {} },
        '../../types/highlight': { isFileComment: value => value.kind === 'file-comment' },
        '../../utils/IdGenerator': { IdGenerator: { generateCommentId: () => `comment-${++nextId}` } },
        '../../i18n': { t: value => value }
    });
    for (const mode of ['sidebar', 'all', 'search']) {
        const file = new TFile('note.md');
        const highlight = { id: 'target', filePath: file.path, text: 'highlight', comments: [], isGlobalSearch: mode === 'search' };
        const neighbor = { id: 'neighbor', comments: [] };
        const state = { currentFile: mode === 'sidebar' ? file : null, highlights: [highlight, neighbor] };
        const originalList = state.highlights;
        let updated = 0, saved = 0, refreshed = 0, callbacks;
        const { CommentController } = load('src/views/highlight/comments/CommentController.ts', {
            '../../../types/highlight': { isFileComment: value => value.kind === 'file-comment' },
            '../../../components/highlight': { defaultHighlightCardRegistry: {
                findByHighlightId: id => {
                    assert.equal(id, 'target', 'Only the target card may be updated');
                    return { updateComments: h => { assert.equal(h, highlight); updated++; } };
                }
            } }
        });
        const service = new CommentService({ vault: { getAbstractFileByPath: () => file } }, {}, {
            addHighlight: async (targetFile, value) => {
                assert.equal(targetFile, file);
                assert.equal(value, highlight);
                saved++;
            }
        });
        const controller = new CommentController({
            state, commentService: service,
            commentInputManager: { setCallbacks: value => { callbacks = value; } },
            refreshView: async () => { refreshed++; },
            // Guard against reintroducing the former extra full-list refresh.
            updateHighlights: async () => { refreshed++; }
        });
        controller.configure();
        await controller.addAIComment(highlight, 'AI answer');
        assert.equal(saved, 1);
        assert.equal(updated, 1);
        assert.equal(highlight.comments[0].content, 'AI answer');
        assert.equal(refreshed, 0, mode + ': AI must not refresh the list');
        assert.equal(state.highlights, originalList);
        assert.equal(state.highlights[1], neighbor);
        await callbacks.onCommentSave(highlight, 'Manual answer');
        assert.equal(saved, 2);
        assert.equal(updated, 2);
        assert.equal(refreshed, 0, mode + ': manual and AI comments share local updates');
    }
}

async function testFileCommentDraftLifecycle() {
    const { FileCommentDraftManager } = load('src/views/highlight/file-comments/FileCommentDraftManager.ts', {
        obsidian: { TFile: class {} },
        '../../../i18n': { t: value => value },
        '../../../utils/IdGenerator': { IdGenerator: { generateHighlightRecordId: () => 'highlight-draft-key' } }
    });
    const manager = new FileCommentDraftManager();
    const draft = manager.createDraft({ path: 'note.md' });
    assert.equal(draft.filePath, 'note.md');
    assert.equal(draft.id, 'file-comment-draft-highlight-draft-key');
    assert.equal(draft.recordId, undefined, 'A file-comment draft must not pretend to be stored');
    assert.equal(draft.isDraft, true);
    assert.equal(draft.comments.length, 0);

    class TFile { constructor(path) { this.path = path; } }
    const file = new TFile('note.md');
    const { CommentService } = load('src/services/comment/CommentService.ts', {
        obsidian: { TFile, Notice: class {} },
        '../../types/highlight': { isFileComment: value => value.kind === 'file-comment' },
        '../../utils/IdGenerator': { IdGenerator: { generateCommentId: () => 'comment-1' } },
        '../../i18n': { t: value => value }
    });
    let storageDeletes = 0, cardRemovals = 0;
    const service = new CommentService({ vault: { getAbstractFileByPath: () => file } }, {}, {
        removeHighlight: async () => { storageDeletes++; return true; }
    });
    service.updateState({ currentFile: file, highlights: [draft] });
    service.setCallbacks({ onCardRemove: value => { assert.equal(value, draft); cardRemovals++; } });
    await service.deleteFileCommentDraft(draft);
    assert.equal(storageDeletes, 0, 'Cancelling a view-only draft must not touch storage');
    assert.equal(cardRemovals, 1);
}

function testFileCommentNewestFirst() {
    const { sortFileCommentsByNewest } = load('src/views/highlight/rendering/FileCommentSection.ts', {
        obsidian: { setIcon: () => {} },
        '../../../i18n': { t: value => value }
    });
    const comments = [
        { id: 'older', kind: 'file-comment', text: 'File Comment', position: 0, createdAt: 100 },
        { id: 'newest', kind: 'file-comment', text: 'File Comment', position: 0, createdAt: 300 },
        { id: 'middle', kind: 'file-comment', text: 'File Comment', position: 0, createdAt: 200 }
    ];
    assert.deepEqual(Array.from(sortFileCommentsByNewest(comments), item => item.id), ['newest', 'middle', 'older']);
    assert.deepEqual(Array.from(comments, item => item.id), ['older', 'newest', 'middle'], 'Sorting must not mutate view state');
}

function testHighlightTitleModes() {
    const { resolveHighlightTitleMode } = load('src/components/highlight/card/TitleBarMode.ts', {
        '../../../types/highlight': { isFileComment: value => value.kind === 'file-comment' }
    });
    assert.equal(resolveHighlightTitleMode({ kind: 'file-comment', isGlobalSearch: false }, 'note.md', true), 'file');
    assert.equal(resolveHighlightTitleMode({ kind: 'file-comment', isGlobalSearch: false }, 'note.md', false), 'file-comment');
    assert.equal(resolveHighlightTitleMode({ kind: 'highlight', isGlobalSearch: false }, 'note.md', true), 'file');
    assert.equal(resolveHighlightTitleMode({ kind: 'highlight', isGlobalSearch: false }, undefined, false), 'line');
}

async function testAnnotationContext() {
    class TFile { constructor(path) { this.path = path; this.name = path.split('/').pop(); } }
    const file = new TFile('folder/note.md');
    let reads = 0;
    const { AnnotationContextResolver } = load('src/services/annotation/AnnotationContextResolver.ts', {
        obsidian: { TFile },
        '../../types/highlight': { isFileComment: value => value.kind === 'file-comment' }
    }, { console });
    const resolver = new AnnotationContextResolver({ vault: {
        getAbstractFileByPath: path => path === file.path ? file : null,
        read: async () => { reads++; return '0123456789'; }
    } }, 5);
    const fileContext = await resolver.resolve({
        kind: 'file-comment', filePath: file.path, text: 'File Comment', position: 0,
        comments: [{ content: 'Whole-note observation' }]
    });
    assert.equal(reads, 1);
    assert.equal(fileContext.primaryText, '01234\n\n[Source truncated]');
    assert.equal(fileContext.sourceContentTruncated, true);
    const aiContext = resolver.formatForAI(fileContext);
    assert.ok(aiContext.includes('Source file: note.md'));
    assert.ok(aiContext.includes('Whole-note observation'));
    const highlightContext = await resolver.resolve({ kind: 'highlight', text: 'selected text', position: 4 });
    assert.equal(reads, 1, 'Normal highlights must not read the whole file');
    assert.equal(resolver.formatForAI(highlightContext), 'selected text');
}

function testCopyHighlightFormatting() {
    const { HighlightCardClipboard } = load('src/components/highlight/card/Clipboard.ts', {
        obsidian: { Notice: class {} },
        '../../../i18n': { t: value => value },
        '../../../types/highlight': { isFileComment: value => value.kind === 'file-comment' }
    }, { console, navigator: { clipboard: { writeText: async () => {} } } });

    const normal = HighlightCardClipboard.formatHighlightContent({
        kind: 'highlight', text: 'first line\nsecond line', position: 2,
        filePath: 'folder/note.md',
        comments: [{ content: 'A comment' }]
    }, 'note.md');
    assert.ok(normal.includes('> first line\n> second line'));
    assert.ok(normal.includes('[[folder/note|note]]'));
    assert.ok(normal.includes('>> A comment'));

    const fileComment = HighlightCardClipboard.formatHighlightContent({
        kind: 'file-comment', text: 'File Comment', position: 0,
        filePath: 'folder/note.md',
        comments: [{ content: 'Whole note\nSecond line' }]
    });
    assert.ok(fileComment.includes('> [!note] File comment'));
    assert.ok(fileComment.includes('> Source: [[folder/note|note]]'));
    assert.ok(fileComment.includes('> Whole note\n> Second line'));
    assert.ok(!fileComment.includes('\n> File Comment\n'));
}

(async () => {
    testReviewDomRules();
    await testKeyboard();
    await testSettings();
    await testAICommentLocalUpdate();
    await testFileCommentDraftLifecycle();
    testFileCommentNewestFirst();
    testHighlightTitleModes();
    await testAnnotationContext();
    testCopyHighlightFormatting();
    const manifest = JSON.parse(fs.readFileSync('manifest.json'));
    const versions = JSON.parse(fs.readFileSync('versions.json'));
    assert.equal(manifest.minAppVersion, '1.13.0');
    assert.equal(versions['0.5.8'], '1.8.0');
    assert.equal(versions[manifest.version], manifest.minAppVersion);
    console.log('Review regressions passed: IME, keyboard shortcuts, settings search definitions and lifecycle, local AI comment updates, file-comment drafts/context/copy, versions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
